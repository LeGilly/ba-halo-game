/* Colour theme shared by every legilly.com site: the same file in each repo (see MAINTAINING.md).
   Load it in <head>, before the stylesheets, so the right colours are there before the page draws.
   It also adds the theme button to the top-right corner of the page.
   The choice ("purple.dark") is kept in a cookie readable by legilly.com and all its subdomains,
   so picking a theme on one site applies to all of them. It holds the theme name only. */
(function () {
  "use strict";
  var THEMES = [["blue", "Blue"], ["purple", "Purple"], ["teal", "Teal"], ["amber", "Amber"], ["rose", "Rose"]];
  var MODES = [["system", "System"], ["light", "Light"], ["dark", "Dark"]];
  var KEY = "legilly_theme";
  var root = document.documentElement;
  var systemDark = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  var known = function (list, v) { return list.some(function (x) { return x[0] === v; }); };
  var label = function (list, v) { for (var i = 0; i < list.length; i++) if (list[i][0] === v) return list[i][1]; return v; };

  function read() {
    var m = document.cookie.match(/(?:^|;\s*)legilly_theme=([a-z]+)\.([a-z]+)/);
    var v = m ? [m[1], m[2]] : null;
    if (!v) { try { var s = localStorage.getItem(KEY); if (s) v = s.split("."); } catch (e) { /* storage blocked */ } }
    return {
      theme: v && known(THEMES, v[0]) ? v[0] : "blue",
      mode: v && known(MODES, v[1]) ? v[1] : "system",
    };
  }
  // A site that is always dark marks <html data-tp-dark-only>; its mode then stays dark.
  var darkOnly = root.hasAttribute("data-tp-dark-only");
  function apply(p) {
    root.setAttribute("data-theme", p.theme);
    root.setAttribute("data-mode", darkOnly ? "dark" : p.mode === "system" ? (systemDark && systemDark.matches ? "dark" : "light") : p.mode);
  }
  function save(p) {
    var v = p.theme + "." + p.mode;
    var shared = /(^|\.)legilly\.com$/.test(location.hostname) ? "; domain=legilly.com" : "";
    document.cookie = KEY + "=" + v + shared + "; path=/; max-age=34560000; samesite=lax" +
      (location.protocol === "https:" ? "; secure" : "");
    try { localStorage.setItem(KEY, v); } catch (e) { /* storage blocked */ }
  }

  var current = read();
  apply(current);
  if (systemDark && systemDark.addEventListener) systemDark.addEventListener("change", function () { apply(current); });
  // Changed on another legilly.com site or tab meanwhile: follow it when this tab comes back.
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) return;
    var now = read();
    if (now.theme !== current.theme || now.mode !== current.mode) { current = now; apply(current); update(); }
  });

  /* ---------- the button in the top-right corner, and its panel ----------
     It floats in the page's top-right corner, or goes into an element marked data-tp-slot
     (for a page whose top bar already spans the full width). */
  var box, btn, pop;
  function build() {
    var slot = document.querySelector("[data-tp-slot]");
    box = document.createElement("div");
    box.className = slot ? "tp-corner tp-inline" : "tp-corner";
    box.innerHTML =
      '<button type="button" class="tp-btn" aria-expanded="false" aria-controls="tpPop"><span class="tp-sw"></span></button>' +
      '<div class="tp-pop" id="tpPop" role="dialog" aria-label="Theme" hidden>' +
        '<div class="tp-label">Colour</div><div class="tp-dots">' +
        THEMES.map(function (t) {
          return '<button type="button" class="tp-dot tp-' + t[0] + '" data-tp-theme="' + t[0] + '" title="' + t[1] + '" aria-label="' + t[1] + '"></button>';
        }).join("") +
        '</div><div class="tp-label">Light or dark</div>' +
        (darkOnly ? '<p class="tp-note">Always dark here. Your choice applies on the other sites.</p>' : "") +
        '<div class="tp-modes"' + (darkOnly ? " hidden" : "") + ">" +
        MODES.map(function (m) { return '<button type="button" data-tp-mode="' + m[0] + '">' + m[1] + "</button>"; }).join("") +
      "</div></div>";
    (slot || document.body).appendChild(box);
    btn = box.querySelector(".tp-btn");
    pop = box.querySelector(".tp-pop");
    btn.addEventListener("click", function () { toggle(pop.hidden); });
    pop.addEventListener("click", function (ev) {
      var b = ev.target.closest("button");
      if (!b) return;
      if (b.dataset.tpTheme) current.theme = b.dataset.tpTheme;
      else if (b.dataset.tpMode) current.mode = b.dataset.tpMode;
      else return;
      apply(current); save(current); update();
    });
    document.addEventListener("click", function (ev) { if (!pop.hidden && !box.contains(ev.target)) toggle(false); });
    document.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && !pop.hidden) { toggle(false); btn.focus(); } });
    update();
  }
  function toggle(open) {
    pop.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
    if (open) { var on = pop.querySelector('[aria-pressed="true"]'); if (on) on.focus(); }
  }
  function update() {
    if (!box) return;
    btn.querySelector(".tp-sw").className = "tp-sw tp-" + current.theme;
    var name = "Theme: " + label(THEMES, current.theme) + ", " + label(MODES, current.mode).toLowerCase();
    btn.title = name; btn.setAttribute("aria-label", name);
    pop.querySelectorAll("[data-tp-theme]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.tpTheme === current.theme)); });
    pop.querySelectorAll("[data-tp-mode]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.tpMode === current.mode)); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build); else build();
  window.LegillyTheme = { get: function () { return { theme: current.theme, mode: current.mode }; } };
})();
