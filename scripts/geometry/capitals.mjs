/**
 * Does the map show the right polity where a polity's capital stood?
 *
 * Run: npm run audit:capitals
 *
 * This is the check that finds the errors that matter, and it took far too
 * long to arrive at. Everything built before it measured the wrong thing:
 * whether geometry was reused, how precise the source claims a frontier is,
 * whether a polity's dates are consistent. None of that catches a perfectly
 * precise polygon with the wrong name written across it — and that is the
 * commonest error in the atlas by a wide margin.
 *
 * The test is simple and it scales. A capital is a point where, by definition,
 * one polity held power. If the canonical layer says Vijayanagara existed in
 * 1400 with its capital at Hampi, and the map draws "Sultanate of Delhi" at
 * Hampi, the map is wrong — no interpretation, no frontier ambiguity, no
 * question of nominal versus direct control. Someone's capital is not in
 * someone else's empire.
 *
 * Every polity added to the canonical layer with a capital becomes another
 * test of the map for free.
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPolities, existsAt, namesAt, overlordAt } from "../canonical/load.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = path.join(ROOT, "public", "data", "borders");

const yearOf = (f) => {
  const m = /world_(bc)?(\d+)\.geojson$/.exec(f);
  return m ? (m[1] ? -Number(m[2]) : Number(m[2])) : null;
};
const inRing = (pt, r) => {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const inPoly = (pt, p) => inRing(pt, p[0]) && !p.slice(1).some((h) => inRing(pt, h));
const covers = (pt, g) => {
  if (!g) return false;
  if (g.type === "Polygon") return inPoly(pt, g.coordinates);
  if (g.type === "MultiPolygon") return g.coordinates.some((p) => inPoly(pt, p));
  return false;
};
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

const files = (await readdir(DIR)).filter((f) => f.endsWith(".geojson"));
const snapshots = [];
for (const f of files) {
  const year = yearOf(f);
  if (year === null) continue;
  snapshots.push({ year, fc: JSON.parse(await readFile(path.join(DIR, f), "utf8")) });
}
snapshots.sort((a, b) => a.year - b.year);

const polities = await loadPolities();
const results = [];

for (const p of polities) {
  for (const cap of p.capitals ?? []) {
    for (const { year, fc } of snapshots) {
      if (!existsAt(p, year)) continue;
      // respect a capital's own window — Nanjing was not the Ming capital after 1421
      if (cap.from !== undefined && year < cap.from) continue;
      if (cap.to !== undefined && year > cap.to) continue;
      const hits = fc.features
        .filter((f) => covers([cap.lng, cap.lat], f.geometry))
        .map((f) => f.properties.NAME)
        .filter(Boolean);
      const names = namesAt(p, year).map(norm);
      let ok = hits.some((h) => names.includes(norm(h)));
      // A vassal's capital drawn under its overlord's name is not an error —
      // it is how the map represents a polity that answered to another. Only a
      // sovereign capital showing someone else's name is wrong.
      let under = null;
      if (!ok) {
        const lord = overlordAt(p, year);
        if (lord) {
          const boss = polities.find((q) => q.id === lord.polityId);
          const bossNames = boss ? namesAt(boss, year).map(norm) : [];
          if (hits.some((h) => bossNames.includes(norm(h)))) {
            ok = true;
            under = `${boss.canonicalName} (${lord.kind})`;
          }
        }
      }
      results.push({
        polity: p.canonicalName, id: p.id, region: p.region,
        capital: cap.name, year,
        drawn: hits, ok, under, blank: hits.length === 0,
      });
    }
  }
}

const wrong = results.filter((r) => !r.ok && !r.blank);
const blank = results.filter((r) => r.blank);
const right = results.filter((r) => r.ok);

console.log(`\ncapital test — ${results.length} checks across ${polities.length} canonical polities\n`);
const asVassal = right.filter((r) => r.under);
console.log(`  ${right.length - asVassal.length} show the right polity at its own capital`);
console.log(`  ${asVassal.length} show the overlord a vassal answered to, which is correct`);
console.log(`  ${wrong.length} show a DIFFERENT polity at a capital`);
console.log(`  ${blank.length} draw nothing at the capital at all\n`);

// group the wrong ones by polity so one systemic error is one line
const byPolity = new Map();
for (const r of wrong) {
  const g = byPolity.get(r.id) ?? { polity: r.polity, region: r.region, capital: r.capital, rows: [] };
  g.rows.push(r);
  byPolity.set(r.id, g);
}
const sorted = [...byPolity.values()].sort((a, b) => b.rows.length - a.rows.length);

console.log("A DIFFERENT POLITY IS DRAWN AT THIS CAPITAL");
console.log("(a capital is a point where one polity held power by definition; there is no frontier ambiguity here)\n");
for (const g of sorted) {
  const years = g.rows.map((r) => r.year);
  const drawnCounts = new Map();
  for (const r of g.rows) for (const d of r.drawn) drawnCounts.set(d, (drawnCounts.get(d) ?? 0) + 1);
  const worst = [...drawnCounts].sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([n, c]) => `${n} (${c})`).join(", ");
  console.log(`  ${g.polity} — capital ${g.rows[0].capital} — wrong in ${g.rows.length} snapshot${g.rows.length > 1 ? "s" : ""}`);
  console.log(`      years:  ${years.join(", ")}`);
  console.log(`      drawn:  ${worst}`);
}

if (blank.length) {
  const byP = new Map();
  for (const r of blank) byP.set(r.polity, (byP.get(r.polity) ?? 0) + 1);
  console.log(`\nNOTHING DRAWN AT THE CAPITAL`);
  for (const [p, n] of [...byP].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`  ${p}: ${n} snapshots`);
  }
}

const byRegion = new Map();
for (const r of results) {
  const g = byRegion.get(r.region) ?? { ok: 0, total: 0 };
  g.total++; if (r.ok) g.ok++;
  byRegion.set(r.region, g);
}
console.log(`\nby region:`);
for (const [region, g] of [...byRegion].sort((a, b) => a[1].ok / a[1].total - b[1].ok / b[1].total)) {
  console.log(`  ${region.padEnd(20)} ${String(g.ok).padStart(4)}/${String(g.total).padEnd(4)} correct  ${((g.ok / g.total) * 100).toFixed(0)}%`);
}
console.log("");
process.exitCode = wrong.length > 0 ? 1 : 0;
