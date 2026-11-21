# Who's that Halo?

**▶ Play: https://legilly.github.io/ba-halo-game/**

A Blue Archive halo guessing game. Halos come from the
[Blue Archive Wiki Halo Gallery](https://bluearchive.fandom.com/wiki/Halo/Gallery),
so new students appear automatically once the wiki adds them.

## Weekly halo update

A GitHub Action (`.github/workflows/site.yml`) runs every Wednesday at 04:17 UTC, on every push to `main`,
and on demand (**Actions** tab → **Update halos and deploy** → **Run workflow**). It runs
`tools/update_halos.py`, which downloads new or changed halos from the wiki, shrinks them to 360 px
WebP files in `halos/`, lists them in `halos/halos.json`, commits them, and publishes the site.

The game only loads halos from this site (`halos/halos.json`); it never contacts the wiki itself.
To run the updater on your own PC: `pip install pillow`, then `python tools/update_halos.py`.

## Manual tweaks: `config.json`

- `exclude`: names to hide, e.g. `["Arona"]`
- `aliases`: extra accepted spellings, e.g. `"Aris": ["Alice", "Arisu"]`
- `rename`: change a displayed name, e.g. `"Alice": "Aris"`
- `aspect`: fix a squashed halo by setting its width/height ratio, e.g. `"Renge": 1.3`
- `extra`: add a halo the wiki doesn't have yet: upload the image to the `custom/` folder, then add
  `{ "name": "New Student", "group": "Playable", "url": "custom/new-student.png" }`
  (only images on this site are allowed, for security; don't put them in `halos/`, which the weekly job manages)

Edit it right on GitHub (pencil icon); the site updates within a minute or two.
The `extra` and `rename` options also apply to the copied halos.

Credits: halo images © NEXON Games / Yostar, via the Blue Archive Wiki (CC BY-SA).
Fan-made, not affiliated.

## Versions

The version is shown at the bottom of the page and set in `index.html`, as major.minor.patch:

- **patch** (1.0.**0** → 1.0.**1**): fixes and small visual changes
- **minor** (1.**0**.1 → 1.**1**.0): a new feature
- **major** (**1**.1.0 → **2**.0.0): a big change in what the project is or how it works

For each release, set the new version in `index.html` (the shown version and every `?v=`, so browsers fetch
the fresh files), add an entry to [CHANGELOG.md](CHANGELOG.md), and update the line below.
Current version: 1.3.6.
