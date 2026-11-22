// Who's that Halo? — halos are copied weekly from the Blue Archive Wiki into halos/ (see tools/update_halos.py).
const DECKS_KEY = "decks-v1";
const DEFAULT_POOLS = ["Playable"];
const PRELOAD_AHEAD = 3;   // halos fetched ahead of time

const $ = (id) => document.getElementById(id);
const els = {
  status: $("status"), pools: $("pools"), hard: $("hard"), stage: $("stage"), halo: $("halo"),
  reveal: $("reveal"), form: $("guessForm"), guess: $("guess"), suggest: $("suggest"),
  submit: $("submitBtn"), skip: $("skipBtn"), next: $("nextBtn"),
  streak: $("streak"), best: $("best"), progress: $("progress"), progressLabel: $("progressLabel"),
  accuracy: $("accuracy"), loaderText: $("loaderText"),
  summary: $("summary"), restart: $("restartBtn"),
};

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// Only accept halo images hosted on this site (halos/ and custom/ folders).
function isAllowedImage(url) {
  try { return new URL(url, location.href).origin === location.origin; }
  catch { return false; }
}

const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

let all = [];          // [{name, group, url, accept:Set}]
let groups = [];       // group names in wiki order
let pools = new Set(store.get("pools", DEFAULT_POOLS));
let pool = [], byName = new Map(), sortedNames = [];
let current = null, answered = false, loading = true, roundId = 0;
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
// Halos are copied into this site weekly by the GitHub job (halos/halos.json + images).
async function fetchHalos() {
  const res = await fetch("halos/halos.json", { cache: "no-cache" });
  if (!res.ok) throw new Error("halo list missing (" + res.status + ")");
  const data = await res.json();
  const items = (data.halos || []).map((h) => ({
    name: h.name, group: h.group,
    url: "halos/" + encodeURIComponent(h.file) + "?" +
      encodeURIComponent(((h.src.match(/cb=(\d+)/) || [])[1] || "") + "-" + (h.v || 1)),
  }));
  if (!items.length) throw new Error("empty halo list");
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
  const aspect = cfg.aspect || {};   // e.g. { "Renge": 1.3 }: show that halo at width/height = 1.3
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
    const ar = Number(aspect[it.name]);
    return { ...it, accept, aspect: ar > 0.2 && ar < 5 ? ar : null };
  });
}

// ---------- Image preloading ----------
// Keeps one Image per URL so a halo is only downloaded once, then shows instantly.
const imgCache = new Map();
function preload(url) {
  if (!imgCache.has(url)) {
    const p = new Promise((resolve, reject) => {
      const im = new Image();
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
  sortedNames = pool.map((x) => x.name).sort();
  streak = 0;
  loadDeck();
  updateScores();
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
      // Optional shape correction from config.json "aspect".
      els.halo.classList.toggle("reshaped", !!current.aspect);
      if (current.aspect) els.halo.style.setProperty("--ar", current.aspect);
      else els.halo.style.removeProperty("--ar");
      return (els.halo.decode ? els.halo.decode().catch(() => {}) : Promise.resolve()).then(() => {
        if (id !== roundId) return;
        setLoading(false);
        // Fetch the next few halos in the background (about 18 KB each), so they show instantly.
        for (const n of deck.queue.slice(1, 1 + PRELOAD_AHEAD)) preload(byName.get(n).url);
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
  const touch = window.matchMedia && matchMedia("(pointer: coarse)").matches;
  els.restart.textContent = touch ? "Tap again to restart" : "Click again to restart";
  restartArmed = setTimeout(() => { restartArmed = null; els.restart.textContent = "Restart round"; }, 3000);
});

// ---------- Autocomplete ----------
function matches(q) {
  const n = norm(q);
  if (!n) return [];
  const names = sortedNames;
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
  // Remove data saved by earlier versions that read the wiki directly.
  try { localStorage.removeItem("halo-cache-v1"); localStorage.removeItem("halo-cache-v2"); } catch {}
  els.hard.checked = store.get("hard", false);
  try {
    const [items, cfg] = await Promise.all([fetchHalos(), fetchConfig()]);
    all = applyConfig(items, cfg);
    groups = [...new Set(all.map((x) => x.group))];
    pools = new Set([...pools].filter((g) => groups.includes(g)));
    if (!pools.size) pools = new Set(groups.includes("Playable") ? ["Playable"] : groups.slice(0, 1));
    // Green: halos loaded. Red (below): something went wrong.
    els.status.textContent = `${all.length} halos · updated weekly`;
    els.status.classList.add("ok");
    renderPools(); rebuildPool(); showCurrent();
  } catch (e) {
    console.error(e);
    setLoading(true, "Couldn't load halos");
    els.status.textContent = "Couldn't load the halos. Try refreshing in a moment.";
    els.status.classList.add("warn");
  }
})();
