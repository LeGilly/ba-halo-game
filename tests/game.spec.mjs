// Plays short rounds of Who's that Halo? with three halos from the real list.
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { sharedFiles } from "./shared.mjs";

const ALL = JSON.parse(readFileSync(new URL("../halos/halos.json", import.meta.url)));
const PICK = ["Shiroko", "Hoshino", "Nonomi"];
const SMALL = { ...ALL, halos: PICK.map((n) => ALL.halos.find((h) => h.name === n)) };

async function start(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await sharedFiles(page);
  await page.route("**/halos/halos.json", (r) => r.fulfill({ json: SMALL }));
  await page.goto("/");
  await expect(page.locator("#stage")).not.toHaveClass(/loading/);
  return errors;
}
// The halo on screen, by its picture file.
const current = (page) => page.evaluate((list) => {
  const file = decodeURIComponent(new URL(document.getElementById("halo").src).pathname.split("/").pop());
  return list.find((h) => h.file === file).name;
}, SMALL.halos);

test("a whole round: right, wrong, skipped, then review the missed ones", async ({ page }) => {
  const errors = await start(page);
  await expect(page.locator("#progress")).toHaveText("0/3");
  // Right answer, picked from the suggestions.
  const first = await current(page);
  await page.fill("#guess", first.slice(0, 4));
  await page.locator("#suggest li", { hasText: first }).first().click();   // picking a suggestion submits it
  await expect(page.locator("#reveal")).toHaveText(`Correct, it's ${first}!`);
  await expect(page.locator("#streak")).toHaveText("1");
  await expect.poll(() => current(page)).not.toBe(first);
  await expect(page.locator("#stage")).not.toHaveClass(/loading/);
  // Wrong answer.
  const second = await current(page);
  const wrong = PICK.find((n) => n !== second);
  await page.fill("#guess", wrong);
  await page.keyboard.press("Enter");
  await expect(page.locator("#reveal")).toContainText(`It was ${second}`);
  await expect(page.locator("#reveal")).toContainText(`You guessed ${wrong}`);
  await expect(page.locator("#streak")).toHaveText("0");
  await page.click("#nextBtn");
  await expect(page.locator("#stage")).not.toHaveClass(/loading/);
  // Skip the last one.
  const third = await current(page);
  await page.click("#skipBtn");
  await expect(page.locator("#reveal")).toContainText(`It was ${third}`);
  await expect(page.locator("#nextBtn")).toHaveText("See results →");
  await page.click("#nextBtn");
  await expect(page.locator("#summary")).toContainText("1/3 correct · 33%");
  await expect(page.locator("#summary .missed")).toContainText([second, third].sort().join(", "));
  await expect(page.locator("#best")).toHaveText("1");
  // Review only brings back the two missed halos.
  await page.click("#reviewBtn");
  await expect(page.locator("#stage")).not.toHaveClass(/loading/);
  await expect(page.locator("#progress")).toHaveText("0/2");
  expect([second, third]).toContain(await current(page));
  expect(errors).toEqual([]);
});

test("progress is kept after a reload, and restart needs two clicks", async ({ page }) => {
  await start(page);
  await page.click("#skipBtn");
  await page.click("#nextBtn");
  await expect(page.locator("#progress")).toHaveText("1/3");
  await page.reload();
  await expect(page.locator("#stage")).not.toHaveClass(/loading/);
  await expect(page.locator("#progress")).toHaveText("1/3");
  await page.click("#restartBtn");
  await expect(page.locator("#progress")).toHaveText("1/3");
  await page.click("#restartBtn");
  await expect(page.locator("#progress")).toHaveText("0/3");
});

test("silhouette mode hides the colours until the answer", async ({ page }) => {
  await start(page);
  await page.check("#hard");
  await expect(page.locator("#stage")).toHaveClass(/hard/);
  await expect(page.locator("#stage")).not.toHaveClass(/loading/);
  await page.click("#skipBtn");
  await expect(page.locator("#stage")).toHaveClass(/revealed/);
});

test("fits a phone screen, with the navigation bar on top", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 760 });
  await start(page);
  await expect(page.locator(".lg-bar")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const top = await page.evaluate(() => document.querySelector("main, .wrap, header").getBoundingClientRect().top);
  expect(top).toBeGreaterThanOrEqual(46 - 1);
});

test("every ?v= matches the version in the footer and the changelog", async () => {
  const read = (name) => readFileSync(new URL("../" + name, import.meta.url), "utf8");
  const latest = read("CHANGELOG.md").match(/^## (\d+\.\d+\.\d+)/m)[1];
  const html = read("index.html");
  const versions = [...html.matchAll(/\?v=([\d.]+)/g)].map((m) => m[1]);
  expect(versions.length).toBeGreaterThan(0);
  expect(new Set(versions)).toEqual(new Set([latest]));
  for (const m of html.matchAll(/(?:src|href)="((?!https?:|#|data:)[^"]+\.(?:js|css)[^"]*)"/g)) expect(m[1]).toContain("?v=");
  expect(html).toContain(`v${latest}</span>`);
});
