// Who's that Halo? — reads the halo list live from the Blue Archive Wiki.
const WIKI_API =
  "https://bluearchive.fandom.com/api.php?action=parse&page=Halo/Gallery&prop=text&format=json&formatversion=2&origin=*";
const CACHE_KEY = "halo-cache-v2";
const CACHE_HOURS = 12;
const DEFAULT_POOLS = ["Playable"];

const $ = (id) => document.getElementById(id);
const els = {
  status: $("status"), pools: $("pools"), hard: $("hard"), stage: $("stage"), halo: $("halo"),
  reveal: $("reveal"), form: $("guessForm"), guess: $("guess"), suggest: $("suggest"),
  submit: $("submitBtn"), skip: $("skipBtn"), next: $("nextBtn"),
  streak: $("streak"), best: $("best"), seen: $("seen"),
  loaderText: $("loaderText"), preload: $("preloadBtn"),
};

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

let all = [];          // [{name, group, url, accept:Set}]
let groups = [];       // group names in wiki order
let pools = new Set(store.get("pools", DEFAULT_POOLS));
let pool = [], bag = [], current = null, answered = false;
let streak = 0, seen = 0, selIdx = -1;
let upcoming = null, roundId = 0, loading = true;

// ---------- Image preloading ----------
// Keeps one Image per URL so a halo is only downloaded once, then shows instantly.
const imgCache = new Map();
function preload(url) {
  if (!imgCache.has(url)) {
    const p = new Promise((resolve, reject) => {
      const im = new Image();
      im.referrerPolicy = "no-referrer";
      im.onload = () => (im.decode ? im.decode().catch(() => {}) : Promise.resolve()).then(() => resolve(im));
      im.onerror = () => { imgCache.delete(url); reject(new Error("image failed: " + url)); };
      im.src = url;
    });
    p.catch(() => {});
    imgCache.set(url, p);
  }
  return imgCache.get(url);
}

// ---------- Data loading ----------
async function fetchWiki() {
  const cached = store.get(CACHE_KEY, null);
  if (cached && Date.now() - cached.t < CACHE_HOURS * 3600e3) return cached.items;
  try {
    const res = await fetch(WIKI_API);
    const json = await res.json();
    const items = parseGallery(json.parse.text);
    if (items.length) store.set(CACHE_KEY, { t: Date.now(), items });
    return items;
  } catch (e) {
    if (cached) return cached.items;   // offline / wiki down -> use last good copy
    throw e;
  }
}

function parseGallery(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const items = [], seenKeys = new Set();
  let group = "";
  doc.querySelectorAll("h2, h3, h4, img").forEach((el) => {
    if (el.tagName !== "IMG") {
      const h = el.querySelector(".mw-headline");
      if (h) group = h.textContent.trim();
      return;
    }
    const key = el.getAttribute("data-image-key") || "";
    if (!/_Halo\./i.test(key) || seenKeys.has(key)) return;
    seenKeys.add(key);
    let src = el.getAttribute("data-src") || el.getAttribute("src") || "";
    src = src.replace(/\/scale-to-width-down\/\d+/, "");   // original file: already cached by the wiki's CDN, much faster
    const name = (el.getAttribute("alt") || decodeURIComponent(key).replace(/_Halo\..*$/i, "").replace(/_/g, " ")).trim();
    items.push({ name, group: group || "Other", url: src });
  });
  return items;
}

async function fetchConfig() {
  try { return await (await fetch("config.json", { cache: "no-cache" })).json(); }
  catch { return {}; }
}

function applyConfig(items, cfg) {
  const exclude = new Set((cfg.exclude || []).map(norm));
  const rename = cfg.rename || {};
  const aliases = cfg.aliases || {};
  const extra = (cfg.extra || []).filter((x) => x && x.name && x.url && !x._disabled);
  const byName = new Map();
  for (const it of [...items, ...extra.map((x) => ({ name: x.name, group: x.group || "Playable", url: x.url }))]) {
    const name = rename[it.name] || it.name;
    if (exclude.has(norm(name)) || exclude.has(norm(it.name))) continue;
    byName.set(norm(name), { ...it, name });   // extras override wiki entries with the same name
  }
  return [...byName.values()].map((it) => {
    const accept = new Set([norm(it.name)]);
    for (const a of aliases[it.name] || []) accept.add(norm(a));
    return { ...it, accept };
  });
}

// ---------- UI ----------
function renderPools() {
  els.pools.innerHTML = "";
  for (const g of groups) {
    const n = all.filter((x) => x.group === g).length;
    const b = document.createElement("button");
    b.type = "button"; b.className = "chip";
    b.textContent = `${g} (${n})`;
    b.setAttribute("aria-pressed", pools.has(g));
    b.onclick = () => {
      if (pools.has(g) && pools.size === 1) return; // keep at least one
      pools.has(g) ? pools.delete(g) : pools.add(g);
      store.set("pools", [...pools]);
      renderPools(); rebuildPool(); nextRound();
    };
    els.pools.appendChild(b);
  }
}

const scoreKey = () => `best:${[...pools].sort().join("+")}:${els.hard.checked ? "hard" : "normal"}`;

function updateScores() {
  els.streak.textContent = streak;
  els.best.textContent = store.get(scoreKey(), 0);
  els.seen.textContent = seen;
}

function rebuildPool() {
  pool = all.filter((x) => pools.has(x.group));
  bag = [];
  upcoming = null;
  streak = 0;
  updateScores();
  resetPreloadBtn();
}

function draw() {
  if (!bag.length) bag = [...pool].sort(() => Math.random() - 0.5);
  let pick = bag.pop();
  if (pick === current && bag.length) { bag.unshift(pick); pick = bag.pop(); }
  return pick;
}

function setLoading(on, text = "Loading halo…") {
  loading = on;
  els.stage.classList.toggle("loading", on);
  els.loaderText.textContent = text;
  els.submit.disabled = on; els.skip.disabled = on;
}

function nextRound(failures = 0) {
  if (!pool.length) return;
  const id = ++roundId;
  current = upcoming || draw();
  upcoming = pool.length > 1 ? draw() : null;
  answered = false;

  // Clear the old halo right away so it is never shown for the new round.
  els.halo.removeAttribute("src");
  els.stage.classList.remove("revealed");
  els.stage.classList.toggle("hard", els.hard.checked);
  els.reveal.textContent = ""; els.reveal.className = "reveal";
  els.guess.value = ""; els.guess.disabled = false;
  els.next.hidden = true;
  closeSuggest();
  setLoading(true);
  els.guess.focus({ preventScroll: true });

  preload(current.url)
    .then(() => {
      if (id !== roundId) return;              // a newer round started meanwhile
      els.halo.src = current.url;
      return (els.halo.decode ? els.halo.decode().catch(() => {}) : Promise.resolve()).then(() => {
        if (id !== roundId) return;
        setLoading(false);
        if (upcoming) preload(upcoming.url);   // fetch the next halo in the background
      });
    })
    .catch(() => {
      if (id !== roundId) return;
      if (failures < 3) nextRound(failures + 1);  // broken image: quietly pick another
      else setLoading(true, "Couldn't load halos. Check your connection and refresh.");
    });
}

// ---------- Preload all ----------
function resetPreloadBtn() {
  if (!els.preload) return;
  els.preload.disabled = !pool.length;
  els.preload.textContent = "Preload all";
}

async function preloadAll() {
  const urls = [...new Set(pool.map((x) => x.url))];
  let done = 0;
  els.preload.disabled = true;
  const tick = () => { els.preload.textContent = `Preloading ${done}/${urls.length}…`; };
  tick();
  let i = 0;
  const worker = async () => {
    while (i < urls.length) {
      const url = urls[i++];
      try { await preload(url); } catch {}
      done++; tick();
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  els.preload.textContent = "All halos ready ✓";
}
els.preload.addEventListener("click", preloadAll);

function finish(correct, guessText) {
  answered = true;
  els.stage.classList.add("revealed");
  els.guess.disabled = true; els.submit.disabled = true; els.skip.disabled = true;
  closeSuggest();
  seen++;
  if (correct) {
    streak++;
    if (streak > store.get(scoreKey(), 0)) store.set(scoreKey(), streak);
    els.reveal.className = "reveal good";
    els.reveal.innerHTML = `Correct, it's ${esc(current.name)}!`;
    updateScores();
    setTimeout(() => { if (answered) nextRound(); }, 1100);
  } else {
    streak = 0;
    els.reveal.className = "reveal bad";
    els.reveal.innerHTML = `It was ${esc(current.name)}` +
      (guessText ? `<small>You guessed ${esc(guessText)}</small>` : "");
    updateScores();
    els.next.hidden = false;
    els.next.focus();
  }
}

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ---------- Autocomplete ----------
function matches(q) {
  const n = norm(q);
  if (!n) return [];
  const names = pool.map((x) => x.name).sort();
  const starts = names.filter((nm) => norm(nm).startsWith(n));
  const contains = names.filter((nm) => !norm(nm).startsWith(n) && norm(nm).includes(n));
  return [...starts, ...contains].slice(0, 8);
}

function renderSuggest() {
  const list = matches(els.guess.value);
  selIdx = list.length ? 0 : -1;
  els.suggest.innerHTML = list
    .map((nm, i) => `<li role="option" data-name="${esc(nm)}" aria-selected="${i === selIdx}">${esc(nm)}</li>`)
    .join("");
}
function closeSuggest() { els.suggest.innerHTML = ""; selIdx = -1; }
function moveSel(d) {
  const lis = [...els.suggest.children];
  if (!lis.length) return;
  selIdx = (selIdx + d + lis.length) % lis.length;
  lis.forEach((li, i) => li.setAttribute("aria-selected", i === selIdx));
  lis[selIdx].scrollIntoView({ block: "nearest" });
}

els.guess.addEventListener("input", renderSuggest);
els.guess.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") { e.preventDefault(); moveSel(1); }
  else if (e.key === "ArrowUp") { e.preventDefault(); moveSel(-1); }
  else if (e.key === "Escape") closeSuggest();
});
els.suggest.addEventListener("mousedown", (e) => {
  const li = e.target.closest("li"); if (!li) return;
  e.preventDefault();
  els.guess.value = li.dataset.name; closeSuggest(); submitGuess();
});

function submitGuess() {
  if (answered || !current || loading) return;
  const lis = [...els.suggest.children];
  if (selIdx >= 0 && lis[selIdx]) els.guess.value = lis[selIdx].dataset.name;
  const text = els.guess.value.trim();
  if (!text) return;
  const n = norm(text);
  const known = pool.some((x) => x.accept.has(n));
  if (!known) {                       // not a valid name: nudge instead of costing the streak
    els.reveal.className = "reveal"; els.reveal.textContent = "Pick a name from the list";
    return;
  }
  finish(current.accept.has(n), text);
}

els.form.addEventListener("submit", (e) => { e.preventDefault(); submitGuess(); });
els.skip.addEventListener("click", () => { if (!loading && !answered) finish(false, ""); });
els.next.addEventListener("click", () => nextRound());
els.hard.addEventListener("change", () => {
  store.set("hard", els.hard.checked);
  streak = 0; updateScores();
  if (!answered) els.stage.classList.toggle("hard", els.hard.checked);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && answered && !els.next.hidden && document.activeElement !== els.next) nextRound();
});
document.addEventListener("click", (e) => { if (!e.target.closest(".ac")) closeSuggest(); });

// ---------- Start ----------
(async function init() {
  els.hard.checked = store.get("hard", false);
  try {
    const [items, cfg] = await Promise.all([fetchWiki(), fetchConfig()]);
    all = applyConfig(items, cfg);
    groups = [...new Set(all.map((x) => x.group))];
    pools = new Set([...pools].filter((g) => groups.includes(g)));
    if (!pools.size) pools = new Set(groups.includes("Playable") ? ["Playable"] : groups.slice(0, 1));
    els.status.textContent = `${all.length} halos loaded from the Blue Archive Wiki`;
    renderPools(); rebuildPool(); nextRound();
  } catch (e) {
    console.error(e);
    setLoading(true, "Couldn't load halos");
    els.status.textContent = "Couldn't reach the Blue Archive Wiki. Try refreshing in a moment.";
  }
})();
