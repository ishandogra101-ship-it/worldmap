/**
 * Draw every polity the atlas knows existed, in every year it existed.
 *
 * Run: npm run fill:gaps   (after bake:claims)
 *
 * The app used to carry a panel that named the realms a snapshot failed to
 * draw and explained that their absence was the boundary source's fault rather
 * than a fact about the year. That was true and it was not the job. A historical
 * atlas that knows the Ahom kingdom stood in 1715 and prints a note about it
 * instead of drawing it has stopped being a map.
 *
 * So: for every year a polity existed and is not drawn, give it the ground the
 * source itself gives it in the years either side.
 *
 * The rule is the intersection, not the nearest. Take the nearest earlier
 * depiction and the nearest later one and keep the ground the polity held in
 * both. An empire that was shrinking is the reason. Byzantium is drawn at 600
 * across the Levant and at 800 without it; carrying 600 forward would hand it
 * back Syria and Egypt in a year it had already lost them, and carrying 800
 * backward would take Anatolia off it early. What it held before and after, it
 * held in between — that is the one inference the record actually supports.
 * With only one side available, that side is used and the feature says so.
 *
 * Nothing here is invented. Every shape is the boundary source's own drawing of
 * that same polity, moved in time and named in the provenance.
 */
import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pc from "polygon-clipping";
import { loadPolities, existsAt, namesAt, normName as norm } from "./load.mjs";
import { areaOf } from "./regions.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = path.join(ROOT, "public", "data", "borders");
const SLIVER = 0.05;

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

function bbox(mp) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  const walk = (c) => {
    if (typeof c[0] === "number") {
      if (c[0] < w) w = c[0]; if (c[0] > e) e = c[0];
      if (c[1] < s) s = c[1]; if (c[1] > n) n = c[1];
    } else for (const x of c) walk(x);
  };
  walk(mp);
  return [w, s, e, n];
}
const disjoint = (a, b) => a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1];
// polygon-clipping throws or returns nothing on some of the source's malformed
// rings, and a shape it cannot parse is a shape this step would delete
const safe = (op, a, b, fallback = []) => {
  try { const r = op(a, b); return r ?? fallback; } catch { return fallback; }
};

const files = (await readdir(DIR)).filter((f) => f.endsWith(".geojson") && yearOf(f) !== null);
const snaps = new Map();
for (const f of files) {
  const fc = JSON.parse(await readFile(path.join(DIR, f), "utf8"));
  /**
   * Undo only what this script did last time.
   *
   * Features it ADDED are dropped. Features whose NAME it corrected keep their
   * geometry and get the source's name back. Features it TRIMMED are restored
   * from `__fillUntrimmed`, which holds the shape as the bake left it — not the
   * pristine source shape, which is the bake's own `__untrimmed` and must be
   * left alone. Restoring past the claim cuts would reverse them.
   */
  fc.features = fc.features
    .filter((x) => !x.properties?.__carried)
    .map((x) => {
      const p = { ...x.properties };
      const geometry = p.__fillUntrimmed ?? x.geometry;
      delete p.__fillUntrimmed;
      if (p.__sourceName) {
        p.NAME = p.__sourceName;
        if (p.__sourceSubjectTo !== null && p.__sourceSubjectTo !== undefined) p.SUBJECTO = p.__sourceSubjectTo;
        else delete p.SUBJECTO;
        if (p.__sourcePartOf !== null && p.__sourcePartOf !== undefined) p.PARTOF = p.__sourcePartOf;
        else delete p.PARTOF;
        delete p.__sourceName; delete p.__sourceSubjectTo; delete p.__sourcePartOf;
        delete p.__renamed; delete p.__carriedNote;
      }
      return { ...x, properties: p, geometry };
    });
  snaps.set(yearOf(f), { file: f, fc });
}
const years = [...snaps.keys()].sort((a, b) => a - b);
const polities = await loadPolities();

/** What the map draws for this polity in this year, if anything. */
function drawnGeometry(p, year) {
  const want = new Set(namesAt(p, year).map(norm));
  let out = [];
  for (const f of snaps.get(year).fc.features) {
    const n = f.properties?.NAME;
    if (!n || !want.has(norm(n))) continue;
    const mp = coordsOf(f.geometry);
    if (!mp.length) continue;
    out = out.length ? safe(pc.union, out, mp, out) : mp;
  }
  return out;
}

/**
 * Pass one: the source's name is stale, and the shape is somebody else's.
 *
 * The commonest way a polity goes missing is not that the map forgot it. It is
 * that the map is still calling its ground by the name of the state before it.
 * "Mauryan Empire" over Pataliputra in 100 BCE, eighty-five years after the
 * Mauryas ended; "Liao" over Beijing in 1200, seventy-five years after the
 * Jurchens took it; "Kediri" over Java in 1279. The polygon is in the right
 * place. Only the label is out of date.
 *
 * That is decidable from the canonical layer rather than by eye. If a drawn
 * name belongs to a polity that had already ended, the ground is its
 * successor's; if it belongs to one not yet founded, the ground is its
 * predecessor's. Where a polity has several successors the tie is broken by
 * whose capital actually falls inside the polygon, which is the same test the
 * capital audit uses and is not a matter of opinion.
 *
 * Renaming beats carrying a shape in from another year, so this runs first.
 */
const inRing = (pt, r) => {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const inside = (pt, mp) =>
  mp.some((poly) => inRing(pt, poly[0]) && !poly.slice(1).some((h) => inRing(pt, h)));

const byId = new Map(polities.map((p) => [p.id, p]));
/** every polity that could answer to this name in any year at all */
const claimants = new Map();
for (const p of polities) {
  for (const n of [p.canonicalName, ...(p.alternativeNames ?? []), ...(p.mapsTo ?? []).map((m) => m.name)]) {
    const k = norm(n);
    if (!claimants.has(k)) claimants.set(k, []);
    claimants.get(k).push(p);
  }
}
let relabelled = 0;
const renames = [];
for (const y of years) {
  const { fc } = snaps.get(y);
  const drawnNow = new Set();
  for (const f of fc.features) if (f.properties?.NAME && f.geometry) drawnNow.add(norm(f.properties.NAME));
  const isDrawn = (q) => namesAt(q, y).some((n) => drawnNow.has(norm(n)));

  for (const f of fc.features) {
    const name = f.properties?.NAME;
    const mp = coordsOf(f.geometry);
    if (!name || !mp.length) continue;
    const owners = claimants.get(norm(name)) ?? [];
    if (!owners.length) continue;
    if (owners.some((o) => existsAt(o, y))) continue;   // the label is fine

    const candidates = [];
    for (const o of owners) {
      const links = y > (o.ended?.year ?? Infinity) ? (o.successors ?? [])
        : y < o.founded.year ? (o.predecessors ?? []) : [];
      for (const id of links) {
        const q = byId.get(id);
        if (q && existsAt(q, y) && !isDrawn(q)) candidates.push(q);
      }
    }
    if (!candidates.length) continue;
    const seated = candidates.filter((q) =>
      (q.capitals ?? []).some((c) =>
        (c.from === undefined || y >= c.from) && (c.to === undefined || y <= c.to) &&
        inside([c.lng, c.lat], mp)));
    const pick = seated.length === 1 ? seated[0] : candidates.length === 1 ? candidates[0] : null;
    if (!pick) continue;

    renames.push(`${y}: "${name}" -> ${pick.canonicalName}`);
    f.properties = {
      ...f.properties,
      NAME: pick.canonicalName, SUBJECTO: pick.canonicalName, PARTOF: pick.canonicalName,
      __renamed: pick.id,
      // all three, not just NAME: the source often has a different SUBJECTO --
      // "Great Khanate" is SUBJECTO "Mongol Empire" -- and restoring only NAME
      // silently rewrote the other two.
      __sourceName: name,
      __sourceSubjectTo: f.properties?.SUBJECTO ?? null,
      __sourcePartOf: f.properties?.PARTOF ?? null,
      __carriedNote: `The boundary source labels this ground "${name}" in ${y}, a state that ` +
        (y > (owners[0].ended?.year ?? 0) ? `had ended by then` : `did not exist yet`) +
        `. The shape is the source's; the name is corrected to the polity that held it.`,
    };
    drawnNow.add(norm(pick.canonicalName));
    relabelled++;
  }
}
if (relabelled) {
  console.log(`\nrelabelled ${relabelled} feature(s) the source names after a state that had ended or not yet begun:`);
  for (const r of renames.slice(0, 40)) console.log(`  ${r}`);
  if (renames.length > 40) console.log(`  … and ${renames.length - 40} more`);
}

const fills = new Map(years.map((y) => [y, []]));
const unfilled = [];

for (const p of polities) {
  const alive = years.filter((y) => existsAt(p, y));
  if (!alive.length) continue;
  const shown = new Map();
  for (const y of alive) {
    const g = drawnGeometry(p, y);
    if (g.length) shown.set(y, g);
  }
  const gaps = alive.filter((y) => !shown.has(y));
  if (!gaps.length) continue;

  /**
   * A polity the source draws in no year at all has nothing of its own to
   * carry. Its predecessor or successor is the next best thing the record
   * offers: the Majapahit sat on Singhasari's ground, the Kamakura shogunate on
   * the ground the source draws for Heian Japan. Those are real links in the
   * canonical layer, not guesses about geography.
   *
   * The check that keeps it honest is the capital. If the polity's own capital
   * does not fall inside the shape being borrowed, the two are not describing
   * the same country and the borrow is refused. That is the same test the
   * capital audit runs, so nothing gets drawn here that the audit would then
   * call an error.
   */
  if (!shown.size) {
    const linked = [...(p.predecessors ?? []), ...(p.successors ?? [])]
      .map((id) => byId.get(id)).filter(Boolean);
    let filledAny = false;
    const stillMissing = [];
    for (const y of gaps) {
      let best = null;
      for (const q of linked) {
        for (const yy of years) {
          if (!existsAt(q, yy)) continue;
          const g = drawnGeometry(q, yy);
          if (!g.length || areaOf(g) <= SLIVER) continue;
          const caps = (p.capitals ?? []).filter((c) =>
            (c.from === undefined || y >= c.from) && (c.to === undefined || y <= c.to));
          if (caps.length && !caps.some((c) => inside([c.lng, c.lat], g))) continue;
          const d = Math.abs(yy - y);
          if (!best || d < best.d) best = { d, geom: g, q, yy };
        }
      }
      if (best) {
        fills.get(y).push({ p, geom: best.geom,
          from: `the ground the source gives ${best.q.canonicalName}, its ${(p.predecessors ?? []).includes(best.q.id) ? "predecessor" : "successor"}, in ${best.yy}` });
        filledAny = true;
      } else stillMissing.push(y);
    }
    if (stillMissing.length) unfilled.push({ p, gaps: stillMissing });
    if (filledAny) continue;
    continue;
  }

  const have = [...shown.keys()].sort((a, b) => a - b);
  for (const y of gaps) {
    const before = have.filter((h) => h < y).pop();
    const after = have.find((h) => h > y);
    let geom, from;
    if (before !== undefined && after !== undefined) {
      const both = safe(pc.intersection, shown.get(before), shown.get(after));
      if (areaOf(both) > SLIVER) { geom = both; from = `held in both ${before} and ${after}`; }
      else {
        // the two depictions do not overlap: the polity moved, or the source
        // drew two unrelated things under one name. Take the nearer year whole
        // rather than draw nothing, and say which.
        const near = y - before <= after - y ? before : after;
        geom = shown.get(near);
        from = `as drawn in ${near}; its ${before} and ${after} shapes do not overlap`;
      }
    } else {
      const only = before ?? after;
      geom = shown.get(only);
      from = `as drawn in ${only}, the only year the source draws it`;
    }
    if (areaOf(geom) > SLIVER) fills.get(y).push({ p, geom, from });
  }
}

let written = 0, trimmed = 0;
const problems = [];

for (const y of years) {
  const list = fills.get(y);
  if (!list.length) continue;
  const { file, fc } = snaps.get(y);
  // a smaller polity is the more specific statement, so it is applied last and
  // keeps its ground where two carried shapes overlap
  list.sort((a, b) => areaOf(b.geom) - areaOf(a.geom));
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      if (!list[i].geom.length) break;
      list[i].geom = safe(pc.difference, list[i].geom, list[j].geom, list[i].geom);
    }
  }
  const live = list.filter((f) => areaOf(f.geom) > SLIVER);
  if (!live.length) continue;

  const all = live.reduce((a, f) => (a.length ? safe(pc.union, a, f.geom, a) : f.geom), []);
  const reach = bbox(all);

  const kept = [];
  for (const f of fc.features) {
    const mp = coordsOf(f.geometry);
    if (!mp.length) { kept.push(f); continue; }
    if (disjoint(bbox(mp), reach)) { kept.push(f); continue; }
    const before = areaOf(mp);
    const cut = safe(pc.difference, mp, all, mp);
    const after = areaOf(cut);
    if (after >= before - 1e-9) { kept.push(f); continue; }
    if (after < SLIVER) {
      // the carried shape would take everything this feature had. Leave it
      // alone instead: a polity the source names is never worth deleting to
      // make room for one carried in from another year.
      problems.push(`${file}: carrying ${live.map((l) => l.p.canonicalName).join("/")} would have erased ${f.properties?.NAME}; left it alone`);
      kept.push(f);
      continue;
    }
    trimmed++;
    kept.push({
      ...f,
      properties: { ...f.properties, __fillUntrimmed: f.properties?.__fillUntrimmed ?? f.geometry },
      geometry: asGeometry(cut),
    });
  }

  const carried = live.map((f) => ({
    type: "Feature",
    properties: {
      NAME: f.p.canonicalName, SUBJECTO: f.p.canonicalName, PARTOF: f.p.canonicalName,
      BORDERPRECISION: 1,
      __carried: f.p.id,
      __carriedNote: `The boundary source does not draw ${f.p.canonicalName} in this year. Shape ${f.from}.`,
    },
    geometry: asGeometry(f.geom),
  })).filter((f) => f.geometry);

  fc.features = [...kept, ...carried];
  written += carried.length;
  await writeFile(path.join(DIR, file), JSON.stringify(fc));
}

for (const f of files) {
  const { file, fc } = snaps.get(yearOf(f));
  if (!fills.get(yearOf(f)).length) await writeFile(path.join(DIR, file), JSON.stringify(fc));
}

console.log(`\ncarried ${written} polity-years the source does not draw; ${trimmed} features trimmed to make room\n`);
if (problems.length) {
  console.log("left alone rather than erase a named polity:");
  for (const p of problems.slice(0, 10)) console.log(`  ${p}`);
  if (problems.length > 10) console.log(`  … and ${problems.length - 10} more`);
  console.log("");
}
if (unfilled.length) {
  console.log(`STILL NOT DRAWN — the source draws these in no year at all, so there is nothing to carry:`);
  for (const u of unfilled.sort((a, b) => b.gaps.length - a.gaps.length)) {
    console.log(`  ${u.p.canonicalName.padEnd(34)} ${u.gaps.length} snapshot(s): ${u.gaps.join(", ")}`);
  }
  console.log("");
}
