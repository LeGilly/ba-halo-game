# Who's that Halo?

**▶ Play: https://legilly.github.io/ba-halo-game/**

A Blue Archive halo guessing game. Halos come from the
[Blue Archive Wiki Halo Gallery](https://bluearchive.fandom.com/wiki/Halo/Gallery),
so new students appear automatically once the wiki adds them.

## Daily halo update

A GitHub Action (`.github/workflows/site.yml`) runs every Wednesday at 04:17 UTC, on every push to `main`,
and on demand (**Actions** tab → **Update halos and deploy** → **Run workflow**). It runs
`tools/update_halos.py`, which downloads new or changed halos from the wiki, shrinks them to 360 px
WebP files in `halos/`, lists them in `halos/halos.json`, commits them, and publishes the site.

The game reads `halos/halos.json` first, and only falls back to the wiki directly if it's missing.
To run the updater on your own PC: `pip install pillow`, then `python tools/update_halos.py`.

## Manual tweaks: `config.json`

- `exclude`: names to hide, e.g. `["Arona"]`
- `aliases`: extra accepted spellings, e.g. `"Aris": ["Alice", "Arisu"]`
- `rename`: change a displayed name, e.g. `"Alice": "Aris"`
- `extra`: add a halo the wiki doesn't have yet:
  `{ "name": "New Student", "group": "Playable", "url": "halos/new-student.png" }`
  (the image must be uploaded to this repository, or be a Blue Archive Wiki image link; other sites are blocked for security)

Edit it right on GitHub (pencil icon); the site updates within a minute or two.
The `extra` and `rename` options also apply to the copied halos.

Credits: halo images © NEXON Games / Yostar, via the Blue Archive Wiki (CC BY-SA).
Fan-made, not affiliated.

## Versions

The version shown at the bottom of the page is in `index.html`.
For each release, raise it by one and set every `?v=` number in `index.html` to the same value,
so browsers fetch the fresh CSS/JS. Current version: 11.
