#!/usr/bin/env node
/**
 * Precomputes, for every sovereign realm, the extent it holds in each mapped
 * snapshot — so a panel can show how long a realm lasted and when it was at its
 * widest without the browser fetching all 49 border files.
 *
 * Extent is planar deg², the same relative measure the map already uses for
 * visual weight. It is never shown as a figure; only its shape over time is.
 */
import fs from "node:fs";
import path from "node:path";

const DIR = "public/data/borders";
const OUT = "public/data/arcs.json";

// Matches ringCentroid() in src/map/borders.ts: a degree of longitude narrows
// towards the poles, so raw deg² is not area. Without the cosine correction
// Antarctica came out the largest polity in the atlas.
function ringArea(ring) {
  let a = 0, cy = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % n];
    const cross = x1 * y2 - x2 * y1;
    a += cross;
    cy += (y1 + y2) * cross;
  }
  a /= 2;
  if (Math.abs(a) < 1e-9) return 0;
  const lat = cy / (6 * a);
  return Math.abs(a) * Math.max(Math.cos((lat * Math.PI) / 180), 0.05);
}

function outerRings(g) {
  if (!g) return [];
  if (g.type === "Polygon") return [g.coordinates[0]];
  if (g.type === "MultiPolygon") return g.coordinates.map((p) => p[0]);
  return [];
}

const manifest = JSON.parse(fs.readFileSync(path.join(DIR, "manifest.json"), "utf8"));
const arcs = new Map();

for (const entry of manifest) {
  const fc = JSON.parse(fs.readFileSync(path.join(DIR, path.basename(entry.file)), "utf8"));
  const per = new Map();
  for (const f of fc.features) {
    const p = f.properties || {};
    // must match groupKey() in src/map/palette.ts
    const group = String(p.SUBJECTO || p.NAME || "").trim();
    if (!group) continue;
    let a = 0;
    for (const r of outerRings(f.geometry)) a += ringArea(r);
    if (a <= 0) continue;
    per.set(group, (per.get(group) || 0) + a);
  }
  for (const [group, area] of per) {
    if (!arcs.has(group)) arcs.set(group, []);
    // one decimal keeps small realms distinguishable without bloating the file
    arcs.get(group).push([entry.year, Math.round(area * 10) / 10]);
  }
}

const out = {};
for (const [group, points] of [...arcs].sort((a, b) => a[0].localeCompare(b[0]))) {
  points.sort((a, b) => a[0] - b[0]);
  out[group] = points;
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ snapshots: manifest.map((m) => m.year), groups: out }));
const bytes = fs.statSync(OUT).size;
console.log(`${Object.keys(out).length} realms across ${manifest.length} snapshots -> ${(bytes / 1024).toFixed(0)} kB`);
