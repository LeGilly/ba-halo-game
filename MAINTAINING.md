# Maintaining Who's that Halo?

> **Start with the hub's `MAINTAINING.md`** (repo `LeGilly.github.io`, or
> https://github.com/LeGilly/LeGilly.github.io/blob/main/MAINTAINING.md): how the owner works, versions and
> releases, the rules every site follows, and the shared navigation bar and colour themes.
> This file only covers what's specific to Who's that Halo?.

## Layout

| Path | What it is |
|---|---|
| `index.html`, `style.css`, `app.js` | The game (one page, one script) |
| `config.json` | Manual tweaks on top of the wiki data (see README); has a `_help` line |
| `halos/` | Halo images (WebP, max 360 px) and `halos.json`; managed by the updater, don't edit by hand |
| `custom/` | Images for `extra` halos the wiki doesn't have yet (create it when needed) |
| `tools/update_halos.py` | Copies halos from the Blue Archive Wiki |
| `.github/workflows/site.yml` | Runs the updater and publishes the site |
| `tests/`, `package.json`, `playwright.config.mjs`, `.github/workflows/tests.yml` | The tests (see Testing) |

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

- Version: `index.html` (footer `vX.Y.Z` and every `?v=`: style.css, app.js).
- The weekly halo commits don't need a version.
- The repo is on the owner's PC with Windows line endings (CRLF), and the halo bot commits to `main`:
  **fetch/pull before committing**.

## Constraints

- **Content security policy** (meta tag): `default-src 'none'; script-src 'self' https://legilly.com;
  style-src 'self' https://legilly.com; img-src 'self'; connect-src 'self'`. No inline scripts or styles, no third-party anything, images only
  from this site (which is why `extra` halos must live in `custom/`).
- Browser storage (`localStorage`): chosen halo groups (`pools`), Silhouette mode (`hard`), best streaks
  per group set and mode, and the current round.

## Testing

How tests run (GitHub, locally, keeping them current) is in the hub's `MAINTAINING.md`, "Tests".
`tests/game.spec.mjs` plays rounds with three halos taken from `halos/halos.json` (right, wrong, skip,
summary, review of missed halos, progress after a reload, restart, Silhouette mode, phone width). The test
files get published with the site (the workflow publishes the whole folder); that's harmless.
Still check light and dark mode by eye.

## Shared bar and themes: what's specific here

- The halo stage (`--stage`) mixes the theme's accent into a soft glow; `--good`/`--bad` and the score colour
  stay the same in every theme.
