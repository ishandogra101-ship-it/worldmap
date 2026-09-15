// Builds the people and events layers from Wikidata and writes the files the app
// reads at runtime.
//
//   node scripts/import/build-dataset.mjs [rulers|figures|events|portraits]
//
// Each layer is a separate invocation that writes its own file the moment it is
// finished. The first full run lost 39 minutes of completed rulers and figures
// because nothing was written until all three layers were done and the job was
// killed partway through the third.
//
// Needs query.wikidata.org and commons.wikimedia.org. The environment this repo
// is normally edited from cannot reach either, so this runs in GitHub Actions —
// see .github/workflows/import.yml.
//
// Writes public/data/{rulers,figures,events}.json and public/portraits/*.jpg,
// which the app merges over src/data/highlights.json by id.

import { writeFile, readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchRulers } from "./wikidata-rulers.mjs";
import { fetchFigures } from "./wikidata-figures.mjs";
import { fetchEvents } from "./wikidata-events.mjs";
import { fetchPortraits } from "./fetch-portraits.mjs";
import { WATCHLIST } from "./watchlist.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const DATA_DIR = path.join(ROOT, "public", "data");
const PORTRAIT_DIR = path.join(ROOT, "public", "portraits");

// must match MIN_YEAR / MAX_YEAR in src/app/store.ts
const MIN_YEAR = -3000;
const MAX_YEAR = 2026;

/**
 * Drops anything the map could only draw wrongly.
 *
 * Wikidata is a public wiki and carries the occasional reversed reign, a
 * coordinate at the wrong pole, or a date typed with an extra digit. None of
 * that is worth rendering, and silently clamping it would put a marker
 * somewhere no source claims. Each rejection is counted and reported.
 */
function clean(records, label) {
  const reasons = {};
  const drop = (why) => { reasons[why] = (reasons[why] || 0) + 1; return false; };
  const out = records.filter((e) => {
    if (!e.name || /^Q\d+$/.test(e.name)) return drop("no English label");
    if (!Number.isFinite(e.startYear) || !Number.isFinite(e.endYear)) return drop("non-numeric year");
    if (e.endYear < e.startYear) return drop("ends before it starts");
    if (e.endYear < MIN_YEAR || e.startYear > MAX_YEAR) return drop("outside the atlas range");
    if (e.endYear - e.startYear > 200) return drop("span over 200 years");
    if (!Number.isFinite(e.lng) || !Number.isFinite(e.lat)) return drop("no coordinate");
    if (Math.abs(e.lat) > 90 || Math.abs(e.lng) > 180) return drop("coordinate off the globe");
    if (e.lat === 0 && e.lng === 0) return drop("null island");
    return true;
  });
  const lost = records.length - out.length;
  console.log(`  ${label}: ${out.length} kept, ${lost} dropped`);
  for (const [why, n] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${n} ${why}`);
  }
  return out;
}

/** Reported every run: a rising count is not the same as good coverage. */
function checkWatchlist(records, label) {
  const want = WATCHLIST[label];
  if (!want) return;
  const hit = [], miss = [];
  for (const name of want) {
    (records.some((e) => e.name && e.name.includes(name)) ? hit : miss).push(name);
  }
  console.log(`  watchlist: ${hit.length}/${want.length} found`);
  if (miss.length) console.log(`    still missing: ${miss.join(", ")}`);
}

function summarise(records, label) {
  if (records.length === 0) return;
  const years = records.map((e) => e.startYear).sort((a, b) => a - b);
  const prom = records.map((e) => e.prominence).sort((a, b) => a - b);
  const q = (arr, f) => arr[Math.floor(arr.length * f)];
  const withPortrait = records.filter((e) => e.portrait).length;
  console.log(
    `  ${label}: years ${years[0]}..${years[years.length - 1]} (median ${q(years, 0.5)}), ` +
    `prominence ${prom[0]}..${prom[prom.length - 1]} (median ${q(prom, 0.5)}), ` +
    `${withPortrait} with a portrait`,
  );
  const top = [...records].sort((a, b) => b.prominence - a.prominence).slice(0, 6);
  console.log(`    most documented: ${top.map((e) => `${e.name} (${e.prominence})`).join(", ")}`);
}

const FETCH = { rulers: fetchRulers, figures: fetchFigures, events: fetchEvents };

async function readLayer(name) {
  try {
    return JSON.parse(await readFile(path.join(DATA_DIR, `${name}.json`), "utf8"));
  } catch {
    return [];
  }
}

/**
 * Fetches a layer and merges it over whatever is already on disk.
 *
 * A layer is not reproducible: how much fits in the endpoint's time budget
 * depends on how busy it is, and windows it refuses are written off. Two runs
 * of identical code returned 14,296 figures and then 6,271, and because the
 * second simply overwrote the first, a re-run silently destroyed more than half
 * the people in the atlas.
 *
 * Records are keyed by QID, so a union is safe and the import becomes
 * monotonic: running it again can add and refresh, never delete. A record that
 * genuinely should disappear — one whose upstream dates were corrected into
 * something unusable — survives until the file is deleted deliberately, which
 * is the right way round for a set of historical people.
 */
async function buildLayer(name) {
  console.log(`\n=== ${name} ===`);
  const t = Date.now();
  const fetched = clean(await FETCH[name](), name);

  const existing = await readLayer(name);
  const byId = new Map(existing.map((e) => [e.id, e]));
  let refreshed = 0;
  for (const e of fetched) {
    if (byId.has(e.id)) refreshed++;
    byId.set(e.id, e);
  }
  const merged = [...byId.values()];
  if (existing.length) {
    console.log(
      `  merged with ${existing.length} already on disk: ` +
      `${merged.length} total, ${refreshed} refreshed, ${merged.length - existing.length} new`,
    );
    if (fetched.length < existing.length * 0.8) {
      console.warn(
        `  NOTE: this run fetched ${fetched.length}, well under the ${existing.length} ` +
        `on disk — the endpoint was likely refusing windows. Nothing was lost.`,
      );
    }
  }

  summarise(merged, name);
  checkWatchlist(merged, name);
  await writeFile(path.join(DATA_DIR, `${name}.json`), JSON.stringify(merged));
  console.log(`  wrote ${name}.json in ${((Date.now() - t) / 60000).toFixed(1)} min`);
}

/**
 * Portraits run last and separately, over whatever the layers left on disk, so
 * a people layer that has already been written is never re-fetched just to put
 * a face on it.
 */
async function buildPortraits() {
  console.log("\n=== portraits ===");
  const rulers = await readLayer("rulers");
  const figures = await readLayer("figures");
  const people = [...rulers, ...figures];
  if (people.length === 0) {
    console.log("  no people on disk; nothing to do");
    return;
  }
  const got = await fetchPortraits(people, PORTRAIT_DIR);
  // fetchPortraits mutates in place, so the layers are rewritten with their
  // portrait paths attached
  await writeFile(path.join(DATA_DIR, "rulers.json"), JSON.stringify(rulers));
  await writeFile(path.join(DATA_DIR, "figures.json"), JSON.stringify(figures));

  const credited = people.filter((e) => e.portraitCredit);
  await writeFile(
    path.join(ROOT, "CREDITS.md"),
    [
      "# Credits",
      "",
      "Generated by `scripts/import/build-dataset.mjs`. Do not edit by hand.",
      "",
      "## Data",
      "",
      "- Historical borders: [historical-basemaps](https://github.com/aourednik/historical-basemaps) (GPLv3).",
      "- Coastlines: [Natural Earth](https://www.naturalearthdata.com/) (public domain).",
      "- People and events: [Wikidata](https://www.wikidata.org) (CC0). Each record keeps its QID as its id and links to its item page.",
      "",
      `## Portraits (${credited.length})`,
      "",
      "From Wikimedia Commons. Only images whose licence reads as public domain or",
      "Creative Commons are downloaded; anything else falls back to a role glyph.",
      "",
      ...credited
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((e) => `- **${e.name}** — ${e.portraitCredit}`),
      "",
    ].join("\n"),
  );

  console.log(`  ${got} portraits, ${credited.length} credited`);
}

async function main() {
  await mkdir(DATA_DIR, { recursive: true });
  const which = process.argv[2] || "all";
  const t0 = Date.now();

  if (which === "portraits") await buildPortraits();
  else if (FETCH[which]) await buildLayer(which);
  else {
    for (const name of Object.keys(FETCH)) await buildLayer(name);
    await buildPortraits();
  }

  console.log(`\nDone in ${((Date.now() - t0) / 60000).toFixed(1)} min.`);
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
