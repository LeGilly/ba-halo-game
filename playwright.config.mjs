// Browser tests for the game page (see MAINTAINING.md, Testing).
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  testMatch: "*.spec.mjs",
  timeout: 90_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: {
    baseURL: "http://localhost:8000",
    viewport: { width: 1200, height: 900 },
    // A browser already on the machine can be used instead of Playwright's own download.
    launchOptions: process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
  },
  webServer: { command: "node tests/serve.mjs", port: 8000, reuseExistingServer: true },
});
