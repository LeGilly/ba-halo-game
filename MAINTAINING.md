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

- **Content security policy** (meta tag): `default-src 'none'; script-src 'self'; style-src 'self';
  img-src 'self'; connect-src 'self'`. No inline scripts or styles, no third-party anything, images only
  from this site (which is why `extra` halos must live in `custom/`).
- Browser storage (`localStorage`): chosen halo groups (`pools`), Silhouette mode (`hard`), best streaks
  per group set and mode, and the current round.

## Testing

No test suite. Serve the folder (`python -m http.server`) and play a round in a browser; check light and
dark mode and a phone width.

## Colour themes (shared by all legilly.com sites)

- `theme.css` and `theme.js` are shared by the hub, Anime Dashboard, Who's that Halo? and IdleRPG Web and must
  stay **identical in every repo**: change them in one, copy them to the other three, and release each site.
- `theme.js` is loaded in `<head>` before the stylesheets. It reads the `legilly_theme` cookie (`theme.mode`,
  e.g. `purple.dark`; `Domain=legilly.com` so every subdomain shares it; falls back to localStorage elsewhere,
  e.g. localhost), sets `data-theme` (blue, purple, teal, amber, rose) and `data-mode` (light or dark, with
  System resolved) on `<html>`, and adds the theme button in the page's top-right corner, or inside an
  element marked `data-tp-slot`. `<html data-tp-dark-only>` keeps a site dark.
- `theme.css` defines `--bg --card --ink --muted --accent --accent-ink --line --tag --track --shadow` for each
  theme in light and dark, plus the button and panel styles. Site stylesheets don't redefine these.
- Text on an accent background uses `var(--accent-ink)`: white in light mode; dark text on the lighter
  dark-mode accents (all but blue).
- Dark-only rules are written as `:root[data-mode="dark"] …`, plus `@media (prefers-color-scheme: dark)
  { :root:not([data-mode]) … }` as a fallback without the script.
- How the palettes were made: the blue neutrals with only the hue rotated (same lightness, so the same
  contrast); accents chosen by calculation, with at least the blue's contrast and at least as far from the
  dashboard's status colours as the blue is from "Plan to watch". Check any new theme the same way.
- Here: the halo stage (`--stage`) mixes the theme's accent into a soft glow; `--good`/`--bad` and the
  score colour stay the same in every theme.
