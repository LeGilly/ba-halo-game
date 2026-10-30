# Who's that Halo?

**▶ Play: https://legilly.github.io/ba-halo-game/**

A Blue Archive halo guessing game. The halo list and images load live from the
[Blue Archive Wiki Halo Gallery](https://bluearchive.fandom.com/wiki/Halo/Gallery),
so new students appear automatically once the wiki adds them.

## Manual tweaks: `config.json`

- `exclude`: names to hide, e.g. `["Arona"]`
- `aliases`: extra accepted spellings, e.g. `"Aris": ["Alice", "Arisu"]`
- `rename`: change a displayed name, e.g. `"Alice": "Aris"`
- `extra`: add a halo the wiki doesn't have yet:
  `{ "name": "New Student", "group": "Playable", "url": "halos/new-student.png" }`
  (the image must be uploaded to this repository, or be a Blue Archive Wiki image link; other sites are blocked for security)

Edit it right on GitHub (pencil icon); the site updates within a minute or two.
Players' browsers cache the wiki list for 12 hours.

Credits: halo images © NEXON Games / Yostar, via the Blue Archive Wiki (CC BY-SA).
Fan-made, not affiliated.

## Versions

The version shown at the bottom of the page is in `index.html`.
For each release, raise it by one and set every `?v=` number in `index.html` to the same value,
so browsers fetch the fresh CSS/JS. Current version: 8.
