// Who's that Halo? — reads the halo list live from the Blue Archive Wiki.
const WIKI_API =
  "https://bluearchive.fandom.com/api.php?action=parse&page=Halo/Gallery&prop=text&format=json&formatversion=2&origin=*&useskin=fandomdesktop";
// useskin=fandomdesktop: phones otherwise get the mobile layout, which lacks the image details we read.
const CACHE_KEY = "halo-cache-v2";
const DECKS_KEY = "decks-v1";
const CACHE_HOURS = 12;
const DEFAULT_POOLS = ["Playable"];

const $ = (id) => document.getElementById(id);
const els = {
  status: $("status"), pools: $("pools"), hard: $("hard"), stage: $("stage"), halo: $("halo"),
  reveal: $("reveal"), form: $("guessForm"), guess: $("guess"), suggest: $("suggest"),
  submit: $("submitBtn"), skip: $("skipBtn"), next: $("nextBtn"),
  streak: $("streak"), best: $("best"), progress: $("progress"), progressLabel: $("progressLabel"),
  accuracy: $("accuracy"), loaderText: $("loaderText"), preload: $("preloadBtn"),
  summary: $("summary"), restart: $("restartBtn"),
};

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// Only accept halo images from the wiki's image server, or files hosted in this repository.
const IMAGE_HOST = "static.wikia.nocookie.net";
function isAllowedImage(url) {
  try {
    const u = new URL(url, location.href);
    return u.origin === location.origin || (u.protocol === "https:" && u.hostname === IMAGE_HOST);
  } catch { return false; }
}

const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

let all = [];          // [{name, group, url, accept:Set}]
let groups = [];       // group names in wiki order
let pools = new Set(store.get("pools", DEFAULT_POOLS));
let pool = [], byName = new Map();
let current = null, upcoming = null, answered = false, loading = true, roundId = 0;
let streak = 0, selIdx = -1, lastSeen = null;

// ---------- Deck: each halo once per round, saved across refreshes ----------
// deck = { phase: "main" | "review", queue: [names to go], seen: [names done], correct: n, failed: [names] }
let decks = store.get(DECKS_KEY, {});
let deck = null;
const poolKey = () => [...pools].sort().join("+");

function shuffle(arr) {                      // Fisher–Yates: every order equally likely
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function newDeck(names, phase = "main") {
  const queue = shuffle(names);
  if (queue.length > 1 && queue[0] === lastSeen) [queue[0], queue[1]] = [queue[1], queue[0]];
  return { phase, queue, seen: [], correct: 0, failed: [] };
}

function saveDeck() { decks[poolKey()] = deck; store.set(DECKS_KEY, decks); }

function loadDeck() {
  const names = pool.map((x) => x.name);
  const valid = new Set(names);
  let d = decks[poolKey()];
  if (!d || !Array.isArray(d.queue) || !Array.isArray(d.seen)) {
    d = newDeck(names);
  } else {
    // Keep the saved deck in sync with the wiki: drop removed halos, slot new ones in at random.
    d.queue = d.queue.filter((n) => valid.has(n));
    d.seen = d.seen.filter((n) => valid.has(n));
    d.failed = (d.failed || []).filter((n) => valid.has(n));
    d.correct = Math.min(d.correct || 0, d.seen.length);
    if (d.phase === "main") {
      const known = new Set([...d.queue, ...d.seen]);
      for (const n of names) {
        if (known.has(n)) continue;
        const pos = 1 + Math.floor(Math.random() * d.queue.length); // never replace the halo on screen
        d.queue.splice(Math.min(pos, d.queue.length), 0, n);
      }
    }
  }
  deck = d;
  saveDeck();
}

function recordAnswer(correct) {
  const name = deck.queue.shift();
  deck.seen.push(name);
  if (correct) deck.correct++; else deck.failed.push(name);
  lastSeen = name;
  saveDeck();
}

// ---------- Data loading ----------
async function fetchWiki() {
  const cached = store.get(CACHE_KEY, null);
  if (cached && Date.now() - cached.t < CACHE_HOURS * 3600e3) return cached.items;
  try {
    const res = await fetch(WIKI_API);
    const json = await res.json();
    const items = parseGallery(json.parse.text);
    if (!items.length) throw new Error("no halos found in the wiki page");
    store.set(CACHE_KEY, { t: Date.now(), items });
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
    let src = el.getAttribute("data-src") || el.getAttribute("src") || "";
    // File name, e.g. "Shiroko_Halo.png": from data-image-key, or from the image link as a fallback.
    const key = el.getAttribute("data-image-key") ||
      ((src.match(/\/images\/[0-9a-f]\/[0-9a-f]{2}\/([^/?#]+)/i) || [])[1] || "");
    if (!/_Halo\./i.test(key) || seenKeys.has(key)) return;
    seenKeys.add(key);
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
  const map = new Map();
  for (const it of [...items, ...extra.map((x) => ({ name: x.name, group: x.group || "Playable", url: x.url }))]) {
    if (typeof it.name !== "string" || !isAllowedImage(it.url)) continue;   // skip anything suspicious
    const name = rename[it.name] || it.name;
    if (exclude.has(norm(name)) || exclude.has(norm(it.name))) continue;
    map.set(norm(name), { ...it, name });   // extras override wiki entries with the same name
  }
  return [...map.values()].map((it) => {
    const accept = new Set([norm(it.name)]);
    for (const a of aliases[it.name] || []) accept.add(norm(a));
    return { ...it, accept };
  });
}

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
      renderPools(); rebuildPool(); showCurrent();
    };
    els.pools.appendChild(b);
  }
}

const scoreKey = () => `best:${poolKey()}:${els.hard.checked ? "hard" : "normal"}`;

function updateScores() {
  els.streak.textContent = streak;
  els.best.textContent = store.get(scoreKey(), 0);
  if (!deck) return;
  const done = deck.seen.length, total = done + deck.queue.length;
  els.progressLabel.textContent = deck.phase === "review" ? "Review" : "Round";
  els.progress.textContent = `${done}/${total}`;
  const pct = done ? Math.round((deck.correct / done) * 100) : null;
  els.accuracy.textContent = pct === null ? "–" : `${pct}%`;
  // Colour from red (0%) through yellow to green (100%): hue 0 → 120.
  els.accuracy.classList.toggle("rated", pct !== null);
  if (pct !== null) els.accuracy.style.setProperty("--hue", Math.round(pct * 1.2));
}

function rebuildPool() {
  pool = all.filter((x) => pools.has(x.group));
  byName = new Map(pool.map((x) => [x.name, x]));
  upcoming = null;
  streak = 0;
  loadDeck();
  updateScores();
  resetPreloadBtn();
}

function setLoading(on, text = "Loading halo…") {
  loading = on;
  els.stage.classList.toggle("loading", on);
  els.loaderText.textContent = text;
  els.submit.disabled = on; els.skip.disabled = on;
}

function setPlaying(on) {
  els.stage.hidden = !on; els.reveal.hidden = !on; els.form.hidden = !on;
  els.summary.hidden = on;
  if (!on) els.next.hidden = true;
}

function showCurrent(failures = 0) {
  if (!pool.length || !deck) return;
  const id = ++roundId;
  if (!deck.queue.length) { showSummary(); return; }
  setPlaying(true);
  current = byName.get(deck.queue[0]);
  upcoming = deck.queue[1] ? byName.get(deck.queue[1]) : null;
  answered = false;

  // Clear the old halo right away so it is never shown for the new halo.
  els.halo.removeAttribute("src");
  els.stage.classList.remove("revealed");
  els.stage.classList.toggle("hard", els.hard.checked);
  els.reveal.textContent = ""; els.reveal.className = "reveal";
  els.guess.value = ""; els.guess.disabled = false;
  els.next.hidden = true;
  closeSuggest();
  setLoading(true);
  updateScores();
  els.guess.focus({ preventScroll: true });

  preload(current.url)
    .then(() => {
      if (id !== roundId) return;              // something newer started meanwhile
      els.halo.src = current.url;
      return (els.halo.decode ? els.halo.decode().catch(() => {}) : Promise.resolve()).then(() => {
        if (id !== roundId) return;
        setLoading(false);
        if (upcoming) preload(upcoming.url);   // fetch the next halo in the background
      });
    })
    .catch(() => {
      if (id !== roundId) return;
      if (failures < 3 && deck.queue.length > 1) {   // broken image: move it to the back, try another
        deck.queue.push(deck.queue.shift()); saveDeck();
        showCurrent(failures + 1);
      } else setLoading(true, "Couldn't load halos. Check your connection and refresh.");
    });
}

function finish(correct, guessText) {
  answered = true;
  recordAnswer(correct);
  els.stage.classList.add("revealed");
  els.guess.disabled = true; els.submit.disabled = true; els.skip.disabled = true;
  closeSuggest();
  if (correct) {
    streak++;
    if (streak > store.get(scoreKey(), 0)) store.set(scoreKey(), streak);
    els.reveal.className = "reveal good";
    els.reveal.innerHTML = `Correct, it's ${esc(current.name)}!`;
    updateScores();
    setTimeout(() => { if (answered) showCurrent(); }, 1100);
  } else {
    streak = 0;
    els.reveal.className = "reveal bad";
    els.reveal.innerHTML = `It was ${esc(current.name)}` +
      (guessText ? `<small>You guessed ${esc(guessText)}</small>` : "");
    updateScores();
    els.next.textContent = deck.queue.length ? "Next halo →" : "See results →";
    els.next.hidden = false;
    els.next.focus();
  }
}

function showSummary() {
  roundId++;
  answered = true;
  setPlaying(false);
  const done = deck.seen.length;
  const pct = done ? Math.round((deck.correct / done) * 100) : 0;
  const missed = deck.failed.length;
  const review = deck.phase === "review";
  const title = review ? "Review complete" : missed ? "Round complete!" : "Perfect round!";
  let html = `<h2>${title}</h2><p class="big">${deck.correct}/${done} correct · ${pct}%</p>`;
  if (missed) {
    const list = deck.failed.slice().sort().map(esc).join(", ");
    html += `<p class="missed"><strong>Missed (${missed}):</strong> ${list}</p>` +
      `<button id="reviewBtn">${review ? "Review the" : "Review"} ${missed} ${review ? "still missed" : "missed"} →</button>`;
  }
  html += `<button id="newRoundBtn" class="${missed ? "ghost" : ""}">Start a new round</button>`;
  els.summary.innerHTML = html;
  const rb = $("reviewBtn");
  if (rb) rb.onclick = () => { deck = newDeck(deck.failed, "review"); saveDeck(); showCurrent(); };
  $("newRoundBtn").onclick = startNewRound;
  updateScores();
}

function startNewRound() {
  deck = newDeck(pool.map((x) => x.name), "main");
  saveDeck();
  showCurrent();
}

// Restart needs two clicks so a stray tap doesn't wipe your progress.
let restartArmed = null;
els.restart.addEventListener("click", () => {
  if (restartArmed) {
    clearTimeout(restartArmed); restartArmed = null;
    els.restart.textContent = "Restart round";
    startNewRound();
    return;
  }
  els.restart.textContent = "Click again to restart";
  restartArmed = setTimeout(() => { restartArmed = null; els.restart.textContent = "Restart round"; }, 3000);
});

// ---------- Preload all ----------
function resetPreloadBtn() {
  els.preload.disabled = !pool.length;
  els.preload.textContent = "Preload all";
}

async function preloadAll() {
  const urls = [...new Set(pool.map((x) => x.url))];
  let done = 0, i = 0;
  els.preload.disabled = true;
  const tick = () => { els.preload.textContent = `Preloading ${done}/${urls.length}…`; };
  tick();
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
els.next.addEventListener("click", () => showCurrent());
els.hard.addEventListener("change", () => {
  store.set("hard", els.hard.checked);
  streak = 0; updateScores();
  if (!answered) els.stage.classList.toggle("hard", els.hard.checked);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && answered && !els.next.hidden && document.activeElement !== els.next) showCurrent();
});
// Close suggestions when clicking elsewhere. Clicks inside the form are ignored: pressing Enter
// fires a "click" on the Guess button, which used to clear the highlighted name before submitting.
document.addEventListener("click", (e) => { if (!e.target.closest("#guessForm")) closeSuggest(); });

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
    renderPools(); rebuildPool(); showCurrent();
  } catch (e) {
    console.error(e);
    setLoading(true, "Couldn't load halos");
    els.status.textContent = "Couldn't reach the Blue Archive Wiki. Try refreshing in a moment.";
  }
})();
