/**
 * Write canonical claims into the snapshots the app renders.
 *
 * Run: npm run bake:claims
 *
 * The claim model computes a map for any year, but the app reads fixed
 * snapshot files. Rather than rewrite the renderer before the claim layer
 * covers enough of the world to stand on its own, this bakes claims into the
 * snapshots: for each mapped year, every claim valid then replaces whatever the
 * boundary source drew on that ground.
 *
 * Where a claim exists it wins outright — the source geometry under it is cut
 * away, so there is no double-drawing and no argument about which layer is on
 * top. Where no claim speaks the source is left exactly as it was.
 *
 * That second half is a hard rule, not a convenience. An earlier version cut by
 * a declared "authority area" instead: inside the subcontinent between 1206 and
 * 1707 the claim layer was the whole map and anything the source drew there was
 * erased. It read as rigour. What it did was delete Ahmadnagar, Berar, Bidar,
 * the Gond kingdoms, the Rajput states and the Sinhalese kingdoms from 1492 —
 * real polities, correctly placed by the source, removed because this file had
 * not got to them yet. A gap in the claim layer must never be able to unmake a
 * polity. Cutting by the claims' own geometry makes that structural rather than
 * a thing to remember.
 *
 * Claimed features carry __claim, so the app can say where the shape came from.
 */
import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pc from "polygon-clipping";
import { makeAtlas } from "./claims.mjs";
import { areaOf } from "./regions.mjs";
import { namesAt } from "./load.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = path.join(ROOT, "public", "data", "borders");

const yearOf = (f) => {
  const m = /world_(bc)?(\d+)\.geojson$/.exec(f);
  return m ? (m[1] ? -Number(m[2]) : Number(m[2])) : null;
};
const coordsOf = (g) =>
  !g ? [] : g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
const asGeometry = (mp) =>
  mp.length === 0 ? null
  : mp.length === 1 ? { type: "Polygon", coordinates: mp[0] }
  : { type: "MultiPolygon", coordinates: mp };

/** [west, south, east, north] of a multipolygon's coordinates. */
function bbox(mp) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  const walk = (c) => {
    if (typeof c[0] === "number") {
      if (c[0] < w) w = c[0];
      if (c[0] > e) e = c[0];
      if (c[1] < s) s = c[1];
      if (c[1] > n) n = c[1];
    } else for (const x of c) walk(x);
  };
  walk(mp);
  return [w, s, e, n];
}
const disjoint = (a, b) => a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1];

/**
 * A shaving left where a claim cut a source polygon, in square degrees.
 *
 * Anything smaller along a claim edge is an artefact of the cut rather than
 * territory, and keeping it means keeping the old name on a hairline.
 */
const SLIVER = 0.25;

/**
 * Below this a polygon draws nothing at any zoom, so nothing this step does to
 * it counts as putting a polity on or off the map. Roughly twelve square
 * kilometres. The 1500 Bahmani Kingdom arrives from simplification as three
 * nearly collinear points enclosing 1.3e-4 of a square degree.
 */
const INVISIBLE = 1e-3;

const atlas = await makeAtlas();
const files = (await readdir(DIR)).filter((f) => f.endsWith(".geojson"));
let touched = 0, replaced = 0, trimmed = 0;

for (const file of files) {
  const year = yearOf(file);
  if (year === null) continue;
  const held = atlas.at(year);
  if (held.length === 0) continue;

  const fc = JSON.parse(await readFile(path.join(DIR, file), "utf8"));
  // strip any claim features from a previous bake, so this is idempotent
  const source = fc.features.filter((f) => !f.properties?.__claim);

  // The ground the claims actually occupy. Nothing else is touched.
  const footprint = held.map((h) => h.geometry).reduce((a, b) => pc.union(a, b), []);
  const reach = bbox(footprint);

  /**
   * Names the claims have taken over for this year.
   *
   * A claim supersedes the source's version of that polity entirely, not only
   * where the two overlap. Without this the old "Sultanate of Delhi" polygon
   * kept its Kashmir and Punjab lobes — outside the authority area, so never
   * cut — and the map showed them beside the claim's "Delhi Sultanate" in a
   * different colour, reading as two separate states.
   */
  const superseded = new Set();
  for (const h of held) {
    const p = atlas.polities.find((x) => x.id === h.polityId);
    if (p) for (const n of namesAt(p, year)) superseded.add(n.toLowerCase());
    // Plus any name this claim states it takes over, with the reason written
    // in the claim file. That is the only way a polity the source draws may
    // leave the map — see the guard below.
    for (const r of h.replaces ?? []) superseded.add(String(r.name).toLowerCase());
  }

  const kept = [];
  const hadGeometry = new Set();
  for (const f of source) {
    const n = String(f.properties?.NAME ?? "").trim();
    if (n && areaOf(coordsOf(f.geometry)) >= INVISIBLE) hadGeometry.add(n);
  }
  for (const f of source) {
    if (superseded.has(String(f.properties?.NAME ?? "").toLowerCase())) { replaced++; continue; }
    const mp = coordsOf(f.geometry);
    if (mp.length === 0) { kept.push(f); continue; }
    // Nowhere near a claim: keep it untouched, and never hand it to the
    // clipper. polygon-clipping returns an empty result on some of the source's
    // malformed rings, and a feature it cannot parse is a feature this step
    // would delete. Chemapho and Cupeño in California and the Andean
    // hunter-gatherers vanished from snapshots whose only claims were in India.
    if (disjoint(bbox(mp), reach)) { kept.push(f); continue; }
    const before = areaOf(mp);
    // A ring with no area draws nothing, and differencing it returns nothing,
    // which the guard below would read as a claim having erased it. The 1500
    // Bahmani Kingdom comes out of simplification as three collinear points.
    // Leave it exactly as the source has it and let the source own the problem.
    if (before < INVISIBLE) { kept.push(f); continue; }
    const outside = pc.difference(mp, footprint);
    const after = areaOf(outside);
    const cut = after < before - 1e-9;
    if (outside.length === 0) { replaced++; continue; }        // wholly under a claim
    // A shaving left along a claim edge is an artefact, not a polity — but only
    // a feature the cut actually touched can be one. Applying the threshold to
    // every feature deleted a thousand small islands and city states worldwide
    // that no claim came near.
    if (cut && after < SLIVER) { replaced++; continue; }
    // Per part, not per feature. The old Sultanate of Delhi polygon came out of
    // the cut as thirty thin shavings along the claim edges, scattered from
    // Sindh to Bengal — together large enough to pass a whole-feature test, and
    // individually nothing but artefacts still carrying the name.
    const parts = cut ? outside.filter((poly) => areaOf([poly]) >= SLIVER) : outside;
    if (parts.length === 0) { replaced++; continue; }
    const g = asGeometry(parts);
    if (!g) { replaced++; continue; }
    if (cut) trimmed++;
    kept.push({ ...f, geometry: g });
  }

  const claimFeatures = held.map((h) => ({
    type: "Feature",
    properties: {
      NAME: h.name,
      SUBJECTO: h.name,
      PARTOF: h.name,
      BORDERPRECISION: 1,
      __claim: `${h.polityId}:${h.from}-${h.to}`,
      __claimNote: h.note ?? null,
    },
    geometry: asGeometry(h.geometry),
  })).filter((f) => f.geometry);

  /**
   * The guard that makes the rule above enforceable.
   *
   * A source polity may leave the map for exactly one reason: a claim has taken
   * over its name, and draws it better. Any other disappearance means a claim's
   * geometry swallowed a state this file does not name — one blob standing over
   * ground several polities held, which is the error the claim layer exists to
   * fix, reintroduced by the fix itself. The bake stops rather than write it.
   */
  const survived = new Set(
    kept.filter((f) => f.geometry?.coordinates?.length)
      .map((f) => String(f.properties?.NAME ?? "").trim()),
  );
  const erased = [...hadGeometry].filter(
    (n) => !survived.has(n) && !superseded.has(n.toLowerCase()),
  );
  if (erased.length) {
    console.error(
      `\n${file}: a claim erased ${erased.length} polity name(s) it does not replace:\n` +
        erased.map((n) => `    ${n}`).join("\n") +
        `\n\n  Either the claim covering that ground is drawn too wide, or these\n` +
        `  states belong in the claim file. Splitting the claim is usually right:\n` +
        `  the source put a separate polity there for a reason.\n`,
    );
    process.exitCode = 1;
    continue;
  }

  fc.features = [...kept, ...claimFeatures];
  await writeFile(path.join(DIR, file), JSON.stringify(fc));
  touched++;
  console.log(`  ${String(year).padStart(5)}: ${claimFeatures.length} claim${claimFeatures.length === 1 ? "" : "s"} written, ${source.length - kept.length} source feature(s) replaced`);
}

console.log(`\n${touched} snapshots rewritten — ${replaced} source features wholly replaced, ${trimmed} trimmed at a claim edge\n`);
