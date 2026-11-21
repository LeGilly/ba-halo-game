# Maintaining Who's that Halo?

Notes for whoever works on this repo (including AI assistants). The README describes the game; this file
covers how it's built and released.

## How the owner works

- Changes are committed and pushed by the owner with GitHub Desktop, from `Documents\GitHub\ba-halo-game`.
  An assistant writes files into that folder and suggests a one-line commit summary; it doesn't commit.
- Files on the owner's PC use Windows line endings (CRLF); keep them when editing.
- Hub: https://legilly.com (repo `LeGilly.github.io`). Sibling projects: `anime-dashboard`, `irc-idlerpg-web`.

## Layout

| Path | What it is |
|---|---|
| `index.html`, `style.css`, `app.js` | The game (one page, one script) |
| `config.json` | Manual tweaks on top of the wiki data (see README); has a `_help` line |
| `halos/` | Halo images (WebP, max 360 px) and `halos.json`; managed by the updater, don't edit by hand |
| `custom/` | Images for `extra` halos the wiki doesn't have yet (create it when needed) |
| `tools/update_halos.py` | Copies halos from the Blue Archive Wiki |
| `.github/workflows/site.yml` | Runs the updater and publishes the site |

## Hosting and the weekly update

- Published by GitHub Actions to GitHub Pages (https://legilly.com/ba-halo-game/), not by the plain
  "deploy from branch" setting. Every push to `main` runs the workflow, so a push also publishes.
- The workflow runs every Wednesday at 04:17 UTC, on every push, and on demand (Actions → Update halos and
  deploy → Run workflow). It runs the updater, commits changed halos as `github-actions[bot]`
  ("Update halos from the wiki"), then deploys. If the wiki is unreachable it still deploys what exists.
- Because the bot commits to `main`, the owner should **fetch/pull before committing** to avoid conflicts.
- The updater: polite (one download every 1.5 s, stops after 5 failures in a row or 30 minutes), only
  downloads new or changed halos, refuses oversized images. Raise `PROCESS_VERSION` when the image
  processing changes, to redo every halo once. Run locally with `pip install pillow` then
  `python tools/update_halos.py`.
- The game never contacts the wiki: it only loads `halos/halos.json`, `config.json` and images from this site.

## Releasing

1. Version is major.minor.patch: patch = fixes and small visual changes, minor = a new feature,
   major = a big change in what the game is or does.
2. Set it in `index.html`: footer `vX.Y.Z` and every `?v=` (style.css, app.js).
3. Add an entry at the top of `CHANGELOG.md` (`## X.Y.Z · YYYY-MM-DD`, one short line per change).
   The weekly halo commits don't need a version.

## Constraints

- **Content security policy** (meta tag): `default-src 'none'; script-src 'self' https://legilly.com;
  style-src 'self' https://legilly.com; img-src 'self'; connect-src 'self'`. No inline scripts or styles, no third-party anything, images only
  from this site (which is why `extra` halos must live in `custom/`).
- Browser storage (`localStorage`): chosen halo groups (`pools`), Silhouette mode (`hard`), best streaks
  per group set and mode, and the current round.

## Testing

No test suite. Serve the folder (`python -m http.server`) and play a round in a browser; check light and
dark mode and a phone width.

## Shared code: navigation bar and colour themes

- One script and one stylesheet are shared by every legilly.com site. They live **only in the hub repo**
  (`LeGilly.github.io/shared/site.js` and `site.css`) and every site loads them from
  `https://legilly.com/shared/`, in `<head>` before its own stylesheet. A change there reaches every site
  within about 10 minutes of pushing the hub (GitHub Pages cache), with no commit in the other repos.
  So test a change on all four sites before pushing the hub: a mistake breaks every site at once.
- Each page says which project it belongs to: `<html data-lg-project="home|anime|halo|idlerpg">`
  (highlights it in the bar). `<html data-tp-dark-only>` keeps a site dark (IdleRPG).
- **The bar** (top of every page, 46 px, `--lg-bar-h`): home icon → hub; **Games** and **Tools** menus
  listing every project (current one highlighted); theme button on the right. The project list is
  `GROUPS` at the top of `site.js`. The bar replaced every "← All projects" link: don't add back links.
  Pages get `padding-top` for it from the start (`html.lg-bar-on`), so nothing jumps when it's drawn.
- **Themes:** the script reads the `legilly_theme` cookie (`theme.mode`, e.g. `purple.dark`;
  `Domain=legilly.com` so every subdomain shares it; localStorage elsewhere, e.g. localhost) and sets
  `data-theme` (blue, purple, teal, amber, rose) and `data-mode` (light or dark, System resolved) on `<html>`
  before the page draws. `site.css` defines `--bg --card --ink --muted --accent --accent-ink --line --tag
  --track --shadow` per theme and mode; site stylesheets don't redefine these.
- Text on an accent background uses `var(--accent-ink)`: white in light mode and for Blue in dark mode;
  dark text on the lighter dark-mode accents of the other themes.
- Dark-only rules are written as `:root[data-mode="dark"] …`, plus `@media (prefers-color-scheme: dark)
  { :root:not([data-mode]) … }` as a fallback without the script.
- How the palettes were made: the blue neutrals with only the hue rotated (same lightness, so the same
  contrast); accents chosen by calculation, with at least the old blue's contrast and at least as far from the
  dashboard's status colours as the blue is from "Plan to watch". Check any new theme the same way.
- Security rules: sites on legilly.com allow `script-src`/`style-src` `'self' https://legilly.com`; Anime
  Dashboard (anime.legilly.com) needs `https://legilly.com` listed for both.
- Here: the halo stage (`--stage`) mixes the theme's accent into a soft glow; `--good`/`--bad` and the
  score colour stay the same in every theme.
