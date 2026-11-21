# Who's that Halo?

**▶ Play: https://legilly.com/ba-halo-game/**

A Blue Archive guessing game: a halo appears, and you name the student it belongs to.

- Type a name (suggestions appear as you type), then **Guess**, or **Skip**.
- Pick which groups of halos to play with, and turn on **Silhouette mode** for a harder game.
- A round shows every halo once, in random order. Progress, accuracy and streaks are shown as you play
  and kept in your browser between visits.
- At the end of a round, review the halos you missed until you get them all.

## Halos

Halos come from the [Blue Archive Wiki Halo Gallery](https://bluearchive.fandom.com/wiki/Halo/Gallery).
A GitHub Action (`.github/workflows/site.yml`, running `tools/update_halos.py`) copies new or changed ones
to this site every week, so new students appear automatically. The game only loads halos from this site;
it never contacts the wiki itself.

## `config.json`

- `exclude`: names to hide, e.g. `["Arona"]`
- `aliases`: extra accepted spellings, e.g. `"Aris": ["Alice", "Arisu"]`
- `rename`: change a displayed name, e.g. `"Alice": "Aris"`
- `aspect`: fix a squashed halo by setting its width/height ratio, e.g. `"Renge": 1.3`
- `extra`: add a halo the wiki doesn't have yet, from the `custom/` folder:
  `{ "name": "New Student", "group": "Playable", "url": "custom/new-student.png" }`

Halo images © NEXON Games / Yostar, via the Blue Archive Wiki (CC BY-SA). Fan-made, not affiliated.
