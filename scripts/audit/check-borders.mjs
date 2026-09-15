/**
 * Check the border layer against claims that can be checked.
 *
 * Run: node scripts/audit/check-borders.mjs
 *
 * Reads the snapshots the app ships, asks each one who held a place, and
 * compares against ground-truth.mjs. Prints a pass rate and every failure with
 * enough detail to act on. Nothing here fixes anything: the point is to turn
 * "the data is wrong in a lot of places" into a list that can be worked
 * through, and a number that can move.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GROUND_TRUTH } from "./ground-truth.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BORDERS = path.join(ROOT, "public", "data", "borders");

function inRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}
const inPoly = (pt, poly) =>
  inRing(pt, poly[0]) && !poly.slice(1).some((hole) => inRing(pt, hole));
function covers(pt, g) {
  if (!g) return false;
  if (g.type === "Polygon") return inPoly(pt, g.coordinates);
  if (g.type === "MultiPolygon") return g.coordinates.some((p) => inPoly(pt, p));
  return false;
}

const manifest = JSON.parse(await readFile(path.join(BORDERS, "manifest.json"), "utf8"));
/** the snapshot the app would draw for a year: nearest mapped year at or below */
function snapshotFor(year) {
  let best = manifest[0];
  for (const e of manifest) if (e.year <= year && e.year > best.year) best = e;
  return best;
}

const cache = new Map();
async function load(file) {
  if (!cache.has(file)) {
    cache.set(file, JSON.parse(await readFile(path.join(ROOT, "public", "data", file), "utf8")));
  }
  return cache.get(file);
}

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const matches = (drawn, list) =>
  list.some((want) => norm(drawn).includes(norm(want)) || norm(want).includes(norm(drawn)));

/**
 * Who is drawn at a point, allowing for the coast.
 *
 * Constantinople, Alexandria and Istanbul all came back blank on the first run,
 * and none of them is a data error. The polygons correctly exclude water, and
 * those cities sit on a strait or a spit: the Ottoman Empire reaches to within
 * 0.1 degrees of Hagia Sophia and stops at the Bosphorus. A test that reads a
 * single coordinate is asking whether a city centre is wet.
 *
 * So the exact point is tried first, then a ring around it at about 17km. The
 * result says which, because a city whose centre falls outside every polygon is
 * worth knowing about even when the answer is right — it is exactly what a
 * reader clicking that city in the app would hit.
 */
function drawnAt(fc, lng, lat) {
  const at = (x, y) => fc.features
    .filter((f) => covers([x, y], f.geometry))
    .map((f) => f.properties.NAME)
    .filter(Boolean);

  const exact = at(lng, lat);
  if (exact.length > 0) return { names: exact, offshore: false };

  const R = 0.15;
  const tally = new Map();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    for (const n of at(lng + Math.cos(a) * R, lat + Math.sin(a) * R)) {
      tally.set(n, (tally.get(n) ?? 0) + 1);
    }
  }
  if (tally.size === 0) return { names: [], offshore: false };
  const top = Math.max(...tally.values());
  return { names: [...tally].filter(([, n]) => n === top).map(([n]) => n), offshore: true };
}

const results = [];
for (const claim of GROUND_TRUTH) {
  const snap = snapshotFor(claim.year);
  const fc = await load(snap.file);
  const { names: drawn, offshore } = drawnAt(fc, claim.lng, claim.lat);

  let verdict;
  if (drawn.length === 0) verdict = "blank";
  else if (claim.reject && drawn.some((d) => matches(d, claim.reject))) verdict = "wrong";
  else if (drawn.some((d) => matches(d, claim.expect))) verdict = "ok";
  else verdict = "other";

  results.push({ ...claim, snapshotYear: snap.year, drawn, verdict, offshore });
}

const by = (v) => results.filter((r) => r.verdict === v);
const ok = by("ok").length;
console.log(`\nBorder audit — ${ok}/${results.length} claims drawn correctly\n`);

const show = (verdict, heading) => {
  const rows = by(verdict);
  if (rows.length === 0) return;
  console.log(`${heading} (${rows.length})`);
  for (const r of rows) {
    const yr = r.snapshotYear === r.year ? `${r.year}` : `${r.year} -> snapshot ${r.snapshotYear}`;
    console.log(`  ${r.place}, ${yr}`);
    console.log(`    drawn:    ${r.drawn.join(" | ") || "(nothing)"}`
      + (r.offshore ? "   (city centre falls outside every polygon; read from 17km around it)" : ""));
    console.log(`    expected: ${r.expect.join(" | ")}`);
    console.log(`    ${r.note}`);
  }
  console.log("");
};

/**
 * Every failure should either be fixed or be explained to the reader.
 *
 * A correction in src/data/corrections.ts is the explanation: the panel for
 * that realm says what is wrong and why. A failure with no correction behind it
 * is one the app is still presenting as fact, which is the thing to avoid, so
 * they are counted separately and the exit code follows them.
 */
const src = await readFile(path.join(ROOT, "src", "data", "corrections.ts"), "utf8");
const covered = [...src.matchAll(/snapshot:\s*(-?\d+),\s*\n\s*polity:\s*"([^"]+)"/g)]
  .map((m) => `${m[1]}|${m[2]}`);
const isCovered = (r) =>
  r.drawn.some((d) => covered.includes(`${r.snapshotYear}|${d}`));

const unexplained = by("wrong").filter((r) => !isCovered(r));
const explained = by("wrong").filter(isCovered);
console.log(
  `of ${by("wrong").length} definite errors, ${explained.length} carry a correction the app shows `
  + `and ${unexplained.length} do not\n`,
);
if (unexplained.length > 0) {
  console.log("PRESENTED AS FACT WITH NO CORRECTION — add one to src/data/corrections.ts");
  for (const r of unexplained) console.log(`  ${r.place}, snapshot ${r.snapshotYear}: ${r.drawn.join(" | ")}`);
  console.log("");
}

show("wrong", "NAMES A POWER THAT WAS DEFINITELY NOT THERE");
show("other", "NEITHER EXPECTED NOR REJECTED — worth a look, may be a naming difference");
show("blank", "NOTHING DRAWN AT ALL");

process.exitCode = unexplained.length > 0 ? 1 : 0;
