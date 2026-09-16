/**
 * What the boundary source says about its own boundaries.
 *
 * Run: npm run audit:precision
 *
 * Every polygon in historical-basemaps carries a BORDERPRECISION field the
 * compilers set themselves: 1 approximate, 2 moderately precise, 3 determined
 * by international law. The vendoring script used to strip it, so the atlas
 * drew a frontier its own source had marked "approximate" with exactly the same
 * crisp edge as one fixed by treaty.
 *
 * This is not a confidence score invented here to excuse inaccuracy. It is the
 * source stating what kind of claim each shape is, and it is the difference
 * between the parts of this atlas that can be presented as fact and the parts
 * that cannot. The dataset's own README is equally direct: "work in progress:
 * verify the maps by comparison to other sources before using in academic
 * work."
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = path.join(ROOT, "public", "data", "borders");

const yearOf = (f) => {
  const m = /world_(bc)?(\d+)\.geojson$/.exec(f);
  return m ? (m[1] ? -Number(m[2]) : Number(m[2])) : null;
};
const ringsOf = (g) => {
  if (!g) return [];
  const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
  return polys.map((p) => p[0]).filter(Boolean);
};
const areaOf = (g) => {
  let a = 0;
  for (const r of ringsOf(g)) {
    let t = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const lat = ((r[i][1] + r[j][1]) / 2) * (Math.PI / 180);
      t += (r[j][0] - r[i][0]) * ((r[i][1] + r[j][1]) / 2) * Math.cos(lat);
    }
    a += Math.abs(t);
  }
  return a;
};

const LABEL = { 1: "approximate", 2: "moderately precise", 3: "fixed by treaty" };

const files = (await readdir(DIR)).filter((f) => f.endsWith(".geojson"));
files.sort((a, b) => yearOf(a) - yearOf(b));

let anyField = false;
const rows = [];
for (const f of files) {
  const year = yearOf(f);
  if (year === null) continue;
  const fc = JSON.parse(await readFile(path.join(DIR, f), "utf8"));
  const count = { 1: 0, 2: 0, 3: 0, missing: 0 };
  const area = { 1: 0, 2: 0, 3: 0, missing: 0 };
  for (const ft of fc.features) {
    const p = ft.properties?.BORDERPRECISION;
    const key = p === 1 || p === 2 || p === 3 ? p : "missing";
    if (key !== "missing") anyField = true;
    count[key]++;
    area[key] += areaOf(ft.geometry);
  }
  const total = Object.values(area).reduce((a, b) => a + b, 0) || 1;
  rows.push({ year, count, area, total, features: fc.features.length });
}

if (!anyField) {
  console.log(`
No BORDERPRECISION on any polygon. The vendoring is stripping it — see
scripts/build-borders.mjs. Rebuild with: npm run build:borders
`);
  process.exit(1);
}

console.log("\nWhat the boundary source says about its own boundaries");
console.log("share of mapped land area, by the precision the compilers assigned\n");
console.log("  year   approximate  moderate  by treaty   polygons");
for (const r of rows) {
  const pct = (k) => `${((r.area[k] / r.total) * 100).toFixed(0)}%`.padStart(6);
  console.log(
    `  ${String(r.year).padStart(5)}  ${pct(1)}      ${pct(2)}    ${pct(3)}     ${String(r.features).padStart(5)}`,
  );
}

const approxArea = rows.reduce((a, r) => a + r.area[1], 0);
const allArea = rows.reduce((a, r) => a + r.total, 0);
const solid = rows.filter((r) => r.area[3] / r.total > 0.5).map((r) => r.year);

console.log(`
Across every snapshot, ${((approxArea / allArea) * 100).toFixed(0)}% of the mapped land area carries a
boundary the source itself calls approximate.

Snapshots where more than half the area is a boundary fixed by treaty:
  ${solid.length ? solid.join(", ") : "none"}

Everything else is a reconstruction. That is not a flaw in this atlas's
handling of the data — it is what the data is, stated by the people who made
it. An accurate map of those periods cannot be built from this source, only
from scholarly reconstruction of each region.
`);
