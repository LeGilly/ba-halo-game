// The navigation bar and themes come from https://legilly.com/shared/. Tests load the live files,
// unless LEGILLY_SHARED points at a local copy of the hub's shared/ folder (for offline runs).
import { readFileSync } from "node:fs";
import { join } from "node:path";

export async function sharedFiles(page) {
  const dir = process.env.LEGILLY_SHARED;
  if (!dir) return;
  await page.route("https://legilly.com/shared/**", (route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop();
    route.fulfill({ body: readFileSync(join(dir, name)), contentType: name.endsWith(".js") ? "text/javascript" : "text/css" });
  });
}
