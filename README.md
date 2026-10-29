# Who's that Halo?

A Blue Archive halo guessing game. The halo list and images load live from the
[Blue Archive Wiki Halo Gallery](https://bluearchive.fandom.com/wiki/Halo/Gallery),
so new students appear automatically once the wiki adds them.

## Manual tweaks: `config.json`

- `exclude`: names to hide, e.g. `["Arona"]`
- `aliases`: extra accepted spellings, e.g. `"Alice": ["Aris", "Arisu"]`
- `rename`: change a displayed name, e.g. `"Shiroko Terror": "Shiroko*Terror"`
- `extra`: add a halo the wiki doesn't have yet:
  `{ "name": "New Student", "group": "Playable", "url": "https://…/halo.png" }`

Edit it right on GitHub (pencil icon); the site updates within a minute or two.
Players' browsers cache the wiki list for 12 hours.

Credits: halo images © NEXON Games / Yostar, via the Blue Archive Wiki (CC BY-SA).
Fan-made, not affiliated.
