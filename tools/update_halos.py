"""Copy the halos from the Blue Archive Wiki into this repository.

Run weekly by .github/workflows/site.yml (or by hand: `python tools/update_halos.py`).
- Reads the wiki's Halo Gallery page (names, groups and image links).
- Downloads only halos that are new or changed since the last run, politely (one at a time).
- Shrinks each one to at most 360 px and saves it as WebP in halos/.
- Writes halos/halos.json, which the game reads.
Needs Pillow:  pip install pillow
"""
import io
import json
import re
import sys
import time
import urllib.parse
import urllib.request
import warnings
from html.parser import HTMLParser
from pathlib import Path

from PIL import Image

API = ("https://bluearchive.fandom.com/api.php?action=parse&page=Halo/Gallery"
       "&prop=text&format=json&formatversion=2&useskin=fandomdesktop")
IMAGE_HOST = "static.wikia.nocookie.net"
MAX_SIZE = 360            # longest side, in pixels
PROCESS_VERSION = 2       # raise when the image processing changes, to redo every halo once
DELAY = 1.5               # seconds between downloads, to stay polite
MAX_FAILS_IN_A_ROW = 5   # the wiki is probably blocking us: stop instead of retrying for hours
TIME_BUDGET = 30 * 60     # seconds; stop cleanly and keep what we have after this long
USER_AGENT = "ba-halo-game updater (+https://github.com/LeGilly/ba-halo-game)"
MAX_BYTES = 25 * 1024 * 1024                  # refuse downloads bigger than 25 MB
ALLOWED_FORMATS = ["PNG", "WEBP", "JPEG", "GIF"]
Image.MAX_IMAGE_PIXELS = 40_000_000           # refuse absurd dimensions (largest real halo is ~10 MP)
warnings.simplefilter("error", Image.DecompressionBombWarning)

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "halos"
MANIFEST = OUT / "halos.json"


def get(url, tries=4):
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read(MAX_BYTES + 1)
                if len(data) > MAX_BYTES:
                    raise ValueError("download too large")
                return data
        except Exception as e:  # network error, 429, 5xx...
            if attempt == tries - 1:
                raise
            wait = 10 * (attempt + 1)
            print(f"  retry in {wait}s ({e})")
            time.sleep(wait)


class Gallery(HTMLParser):
    """Collects (name, group, url) for every *_Halo image, with the section it sits under."""

    def __init__(self):
        super().__init__()
        self.items, self.seen = [], set()
        self.group, self.in_headline, self.headline, self.depth = "", False, "", 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "span" and self.in_headline:
            self.depth += 1                         # nested span (e.g. an [edit] link): ignore its text
        elif tag == "span" and "mw-headline" in (a.get("class") or "").split():
            self.in_headline, self.headline, self.depth = True, "", 0
        elif tag == "img":
            src = a.get("data-src") or a.get("src") or ""
            m = re.search(r"/images/[0-9a-f]/[0-9a-f]{2}/([^/?#]+)", src, re.I)
            key = a.get("data-image-key") or (m.group(1) if m else "")
            if not re.search(r"_Halo\.", key, re.I) or key in self.seen:
                return
            self.seen.add(key)
            src = re.sub(r"/scale-to-width-down/\d+", "", src)
            if src.startswith("//"):
                src = "https:" + src
            if urllib.parse.urlparse(src).hostname != IMAGE_HOST:
                return
            name = (a.get("alt") or urllib.parse.unquote(key).rsplit("_Halo", 1)[0].replace("_", " ")).strip()[:80]
            if not name:
                return
            self.items.append({"name": name, "group": self.group or "Other", "src": src})

    def handle_data(self, data):
        if self.in_headline and self.depth == 0:
            self.headline += data

    def handle_endtag(self, tag):
        if tag == "span" and self.in_headline:
            if self.depth:
                self.depth -= 1
            else:
                self.in_headline = False
                self.group = self.headline.strip()


def slug(name, taken):
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "halo"
    s, n = base, 2
    while s in taken:
        s, n = f"{base}-{n}", n + 1
    taken.add(s)
    return s


def main():
    sys.stdout.reconfigure(line_buffering=True)   # show progress live in the GitHub log
    started = time.monotonic()
    OUT.mkdir(exist_ok=True)
    old = {}
    if MANIFEST.exists():
        old = {h["name"]: h for h in json.loads(MANIFEST.read_text(encoding="utf-8"))["halos"]}

    print("Reading the wiki's Halo Gallery...")
    html = json.loads(get(API))["parse"]["text"]
    parser = Gallery()
    parser.feed(html)
    found = parser.items
    print(f"Found {len(found)} halos on the wiki.")
    if len(found) < 50:  # page layout changed or wiki error: keep what we have
        sys.exit("Too few halos found; leaving the existing files untouched.")

    def up_to_date(it):
        prev = old.get(it["name"])
        return bool(prev and prev.get("src") == it["src"] and prev.get("v") == PROCESS_VERSION
                    and (OUT / prev["file"]).exists())

    todo = sum(not up_to_date(it) for it in found)
    print(f"{todo} of {len(found)} halos need downloading.")

    taken, halos, changed, failed = set(), [], 0, []
    fails_in_a_row, stopped, attempt = 0, None, 0
    for it in found:
        prev = old.get(it["name"])
        file = prev["file"] if prev else slug(it["name"], taken) + ".webp"
        taken.add(file[:-5])
        entry = {"name": it["name"], "group": it["group"], "file": file, "src": it["src"], "v": PROCESS_VERSION}
        if up_to_date(it):
            halos.append(entry)                     # unchanged: nothing to download
            continue
        if stopped:                                  # gave up: keep old copies, skip the rest
            if prev and (OUT / prev["file"]).exists():
                halos.append(prev)
            continue
        if time.monotonic() - started > TIME_BUDGET:
            stopped = "time limit reached"
        elif fails_in_a_row >= MAX_FAILS_IN_A_ROW:
            stopped = f"{fails_in_a_row} downloads failed in a row (the wiki may be blocking us)"
        if stopped:
            print(f"Stopping early: {stopped}. The rest will be tried next run.")
            if prev and (OUT / prev["file"]).exists():
                halos.append(prev)
            continue
        attempt += 1
        print(f"[{attempt}/{todo}] Downloading {it['name']}...")
        try:
            img = Image.open(io.BytesIO(get(it["src"])), formats=ALLOWED_FORMATS)
            img = img.convert("RGBA")
            # Trim the empty transparent margins, so every halo fills the frame the same way.
            box = img.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
            if box:
                img = img.crop(box)
            img.thumbnail((MAX_SIZE, MAX_SIZE), Image.LANCZOS)   # keeps the proportions
            img.save(OUT / file, "WEBP", quality=88, method=6)
            halos.append(entry)
            changed += 1
            fails_in_a_row = 0
        except Exception as e:
            fails_in_a_row += 1
            print(f"  FAILED: {e}")
            failed.append(it["name"])
            if prev and (OUT / prev["file"]).exists():
                halos.append(prev)                  # keep the old copy for now
        time.sleep(DELAY)

    # Remove halos the wiki no longer lists (only after a complete run, never after stopping early).
    keep = {h["file"] for h in halos}
    removed = [] if stopped else [p.name for p in OUT.glob("*.webp") if p.name not in keep]
    for name in removed:
        (OUT / name).unlink()

    if changed or removed or len(halos) != len(old):
        MANIFEST.write_text(json.dumps({
            "source": "https://bluearchive.fandom.com/wiki/Halo/Gallery",
            "updated": time.strftime("%Y-%m-%d", time.gmtime()),
            "halos": halos,
        }, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"Done: {changed} downloaded, {len(removed)} removed, {len(failed)} failed, {len(halos)} total.")
    if failed:
        print("Failed (will retry next run): " + ", ".join(failed))


if __name__ == "__main__":
    main()
