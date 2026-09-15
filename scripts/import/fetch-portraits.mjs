import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const UA =
  "worldmap-history-atlas/0.1 (https://github.com/ishandogra101-ship-it/worldmap) portrait fetch";

const OK_LICENSE = /public domain|^cc|^pd|cc0|no restrictions/i;
const BAD_LICENSE = /fair use|non-free|copyright/i;

const stripTags = (s) => (s || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

function fileTitleFromImageUrl(url) {
  const m = /Special:FilePath\/(.+)$/.exec(url);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

async function commonsInfo(fileTitle) {
  const u = new URL(COMMONS_API);
  u.searchParams.set("action", "query");
  u.searchParams.set("format", "json");
  u.searchParams.set("titles", `File:${fileTitle}`);
  u.searchParams.set("prop", "imageinfo");
  u.searchParams.set("iiprop", "url|extmetadata");
  u.searchParams.set("iiurlwidth", "96");
  const res = await fetch(u, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`commons ${res.status}`);
  const json = await res.json();
  const pages = json.query?.pages || {};
  const page = Object.values(pages)[0];
  const info = page?.imageinfo?.[0];
  if (!info) return null;
  const ext = info.extmetadata || {};
  // Commons appends its own campaign tracking to thumburl; strip it rather than
  // bake analytics parameters into a checked-in asset URL.
  let thumb = info.thumburl || "";
  try {
    const t = new URL(thumb);
    for (const k of [...t.searchParams.keys()]) if (k.startsWith("utm_")) t.searchParams.delete(k);
    thumb = t.toString();
  } catch { /* leave it as given */ }
  return {
    thumb,
    license: stripTags(ext.LicenseShortName?.value),
    artist: stripTags(ext.Artist?.value),
  };
}

// entities: array with optional `image` (Commons FilePath URL). Mutates entries
// in place, adding `portrait` (relative path) and `portraitCredit`; deletes `image`.
// Returns the number of portraits downloaded. Bounded by `limit` (most prominent first).
export async function fetchPortraits(entities, outDir, {
  limit = 1200, minProminence = 62, delayMs = 110,
} = {}) {
  await mkdir(outDir, { recursive: true });
  // Only the markers that actually surface at low zoom earn a checked-in image.
  // Everyone else falls back to a role glyph, which is also what happens when a
  // person has no freely licensed likeness — the atlas never invents a face.
  const withImage = entities
    .filter((e) => e.image && e.prominence >= minProminence)
    .sort((a, b) => b.prominence - a.prominence)
    .slice(0, limit);
  console.log(`  ${withImage.length} candidates (prominence >= ${minProminence}, cap ${limit})`);
  let skippedLicense = 0;
  const skipped = new Map();
  let got = 0;
  for (const e of withImage) {
    const title = fileTitleFromImageUrl(e.image);
    if (!title) continue;
    try {
      const info = await commonsInfo(title);
      await new Promise((r) => setTimeout(r, delayMs));
      if (!info || !info.thumb) continue;
      if (BAD_LICENSE.test(info.license) || !OK_LICENSE.test(info.license)) {
        skippedLicense++;
        continue;
      }
      const img = await fetch(info.thumb, { headers: { "User-Agent": UA } });
      if (!img.ok) continue;
      const buf = Buffer.from(await img.arrayBuffer());
      const fname = `${e.id}.jpg`;
      await writeFile(path.join(outDir, fname), buf);
      e.portrait = `portraits/${fname}`;
      e.portraitCredit = [info.artist, info.license].filter(Boolean).join(" · ") + " (Wikimedia Commons)";
      got++;
      if (got % 100 === 0) console.log(`  portraits: ${got} downloaded`);
    } catch (err) {
      // Commons rate-limits hard, and one line per refusal buried the ruler and
      // figure diagnostics under two thousand identical "commons 429" lines —
      // which is how a run that fetched nothing new looked like a run that
      // worked. Counted by reason, reported once.
      const reason = /\b(\d{3})\b/.exec(err.message)?.[1] ?? err.message.slice(0, 40);
      skipped.set(reason, (skipped.get(reason) ?? 0) + 1);
    }
  }
  for (const e of entities) delete e.image;
  console.log(`  ${got} downloaded, ${skippedLicense} skipped for licence`);
  if (skipped.size) {
    const by = [...skipped].sort((a, b) => b[1] - a[1]).map(([r, n]) => `${n}x ${r}`);
    console.log(`  ${[...skipped.values()].reduce((a, b) => a + b, 0)} skipped: ${by.join(", ")}`);
  }
  return got;
}
