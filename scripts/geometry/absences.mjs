/**
 * Every polity the atlas knows existed must be drawn in every year it existed.
 *
 * Run: npm run audit:absences
 *
 * This is a hard test and it fails the build, because the alternative to
 * passing it is a map that knows a kingdom was there and does not draw it. The
 * app used to have a panel for that — it named the realms a snapshot omitted
 * and explained whose fault it was. The owner's answer to the panel was that he
 * did not want to be told what was missing, he wanted it on the map. He was
 * right, and this is the check that keeps it that way.
 *
 * Anything failing here is filled by bake:claims and fill:gaps. If it fails
 * after those have run, a polity has been added with no geometry anywhere and
 * no claim, and it needs one before it can be shown.
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPolities, existsAt, namesAt, normName as norm } from "../canonical/load.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = path.join(ROOT, "public", "data", "borders");
const yearOf = (f) => {
  const m = /world_(bc)?(\d+)\.geojson$/.exec(f);
  return m ? (m[1] ? -Number(m[2]) : Number(m[2])) : null;
};

const drawn = new Map();
for (const f of (await readdir(DIR)).filter((x) => x.endsWith(".geojson"))) {
  const y = yearOf(f);
  if (y === null) continue;
  const fc = JSON.parse(await readFile(path.join(DIR, f), "utf8"));
  drawn.set(y, new Set(fc.features.filter((x) => x.geometry && x.properties?.NAME)
    .map((x) => norm(x.properties.NAME))));
}
const years = [...drawn.keys()].sort((a, b) => a - b);
const polities = await loadPolities();

const missing = [];
let checks = 0;
for (const p of polities) {
  for (const y of years) {
    if (!existsAt(p, y)) continue;
    checks++;
    if (!namesAt(p, y).some((n) => drawn.get(y).has(norm(n)))) missing.push({ p, y });
  }
}

console.log(`\nabsence test — ${checks} polity-years across ${polities.length} polities and ${years.length} snapshots\n`);
if (!missing.length) {
  console.log(`  every polity the atlas knows existed is drawn in every year it existed\n`);
  process.exitCode = 0;
} else {
  const byPolity = new Map();
  for (const m of missing) {
    const g = byPolity.get(m.p.id) ?? { name: m.p.canonicalName, region: m.p.region, years: [] };
    g.years.push(m.y);
    byPolity.set(m.p.id, g);
  }
  console.log(`  ${missing.length} polity-year(s) the atlas knows about and does not draw:\n`);
  for (const g of [...byPolity.values()].sort((a, b) => b.years.length - a.years.length)) {
    console.log(`  ${g.name} (${g.region}) — ${g.years.length}: ${g.years.join(", ")}`);
  }
  console.log(`\n  Run bake:claims then fill:gaps. If they do not fix it, the polity has no\n  geometry anywhere and needs a claim with a stated extent.\n`);
  process.exitCode = 1;
}
