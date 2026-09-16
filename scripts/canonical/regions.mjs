/**
 * Resolve a region definition into real geometry.
 *
 * A region says something like "the land south of the Krishna, inside the
 * subcontinent". This turns that into a polygon by cutting a half-plane along
 * the named line and intersecting it with the actual coastline, so the result
 * has a real shore rather than a rectangle's edge where the sea should be.
 *
 * The frontier itself is as coarse as the line that defines it — eight points
 * along the Krishna's course. That is the same precision a printed historical
 * atlas gives when it draws the river as the boundary, and it is honest about
 * what is known: the Krishna was the frontier, and nobody surveyed it.
 *
 * What it is not is invented. Every line records where its points come from,
 * and two polities meeting at the same river reference the same line, so their
 * shared frontier is one object and cannot drift apart.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pc from "polygon-clipping";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

let landCache = null;
/** Natural Earth land, as multipolygon coordinates. */
async function land() {
  if (landCache) return landCache;
  const fc = JSON.parse(await readFile(path.join(ROOT, "public", "data", "land.geojson"), "utf8"));
  const out = [];
  for (const f of fc.features) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === "Polygon") out.push(g.coordinates);
    else if (g.type === "MultiPolygon") out.push(...g.coordinates);
  }
  landCache = out;
  return out;
}

const boxPoly = ([w, s, e, n]) => [[[w, s], [e, s], [e, n], [w, n], [w, s]]];

/**
 * A half-plane on one side of a polyline, bounded by a box.
 *
 * The line is extended to the box edges so the cut is complete, then closed
 * along whichever side was asked for.
 */
function halfPlane(points, side, box) {
  const [w, s, e, n] = box;
  const pts = [...points].sort((a, b) => a[0] - b[0]);
  // extend horizontally to the box edges, holding the end latitudes
  const first = pts[0], last = pts[pts.length - 1];
  const spine = [[w, first[1]], ...pts, [e, last[1]]];
  const ring =
    side === "south" ? [...spine, [e, s], [w, s], [w, first[1]]]
    : side === "north" ? [...spine, [e, n], [w, n], [w, first[1]]]
    : null;
  if (ring) return [ring];

  // east/west: the line runs roughly north-south, so sort by latitude instead
  const v = [...points].sort((a, b) => a[1] - b[1]);
  const vs = [[v[0][0], s], ...v, [v[v.length - 1][0], n]];
  return side === "east"
    ? [[...vs, [e, n], [e, s], [vs[0][0], s]]]
    : [[...vs, [w, n], [w, s], [vs[0][0], s]]];
}

const clean = (mp) => (mp && mp.length ? mp : []);

export async function makeRegionResolver(file) {
  const spec = JSON.parse(await readFile(file, "utf8"));
  const lines = new Map(spec.lines.map((l) => [l.id, l]));
  const boxes = spec.boxes ?? {};
  const landMP = await land();
  const cache = new Map();

  const lineOf = (id) => {
    const l = lines.get(id);
    if (!l) throw new Error(`unknown line "${id}"`);
    return l.points;
  };
  const boxOf = (id) => {
    const b = boxes[id];
    if (!b) throw new Error(`unknown box "${id}"`);
    return b;
  };
  /** intersect with real land so the result has a coastline */
  const toLand = (mp, box) =>
    clean(pc.intersection(pc.intersection(mp, boxPoly(box)), landMP));

  function resolve(def) {
    switch (def.kind) {
      case "bbox":
        return toLand(boxPoly(def.box ?? boxOf(def.clipTo)), def.box ?? boxOf(def.clipTo));
      case "landSouthOf":
        return toLand(halfPlane(lineOf(def.line), "south", boxOf(def.clipTo)), boxOf(def.clipTo));
      case "landNorthOf":
        return toLand(halfPlane(lineOf(def.line), "north", boxOf(def.clipTo)), boxOf(def.clipTo));
      case "landEastOf":
        return toLand(halfPlane(lineOf(def.line), "east", boxOf(def.clipTo)), boxOf(def.clipTo));
      case "landWestOf":
        return toLand(halfPlane(lineOf(def.line), "west", boxOf(def.clipTo)), boxOf(def.clipTo));
      case "landBetween": {
        const box = boxOf(def.clipTo);
        const below = halfPlane(lineOf(def.north), "south", box);
        const above = halfPlane(lineOf(def.south), "north", box);
        return toLand(clean(pc.intersection(below, above)), box);
      }
      case "union":
        return def.of.map(region).reduce((a, b) => clean(pc.union(a, b)));
      case "minus":
        return clean(pc.difference(region(def.from), region(def.remove)));
      default:
        throw new Error(`unknown region kind "${def.kind}"`);
    }
  }

  function region(id) {
    if (cache.has(id)) return cache.get(id);
    const r = spec.regions.find((x) => x.id === id);
    if (!r) throw new Error(`unknown region "${id}"`);
    const geom = resolve(r.def);
    cache.set(id, geom);
    return geom;
  }

  return { region, spec, lines, boxes };
}

/** Area in square degrees, cosine-corrected so latitude does not inflate it. */
export function areaOf(mp) {
  let a = 0;
  for (const poly of mp) {
    for (let k = 0; k < poly.length; k++) {
      const r = poly[k];
      let t = 0;
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const lat = ((r[i][1] + r[j][1]) / 2) * (Math.PI / 180);
        t += (r[j][0] - r[i][0]) * ((r[i][1] + r[j][1]) / 2) * Math.cos(lat);
      }
      a += k === 0 ? Math.abs(t) : -Math.abs(t);
    }
  }
  return a;
}
