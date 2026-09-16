/**
 * Fetch geometry from OpenStreetMap, cached on disk.
 *
 * Every line in canonical/regions/*.json that was typed from memory is a
 * measured liability: the traced Krishna ran half a degree north of the real
 * river and put Bijapur city on the wrong side of its own frontier. A river or
 * a wall is a real object with real coordinates, and OSM has them.
 *
 * One practical constraint shapes this file. Of the public Overpass mirrors,
 * exactly one answers from here (checked 2026-09-16): overpass-api.de resets
 * the connection, kumi and private.coffee time out, osm.jp has an expired
 * certificate, and overpass.osm.ch holds Switzerland only. The one that works
 * takes ten to twenty seconds a query. So every response is cached to
 * scripts/.cache/osm and a second run costs nothing. Do not write a loop that
 * refetches.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CACHE = path.join(ROOT, "scripts", ".cache", "osm");
const ENDPOINT =
  process.env.OVERPASS_URL || "https://maps.mail.ru/osm/tools/overpass/api/interpreter";
const UA = "worldmap-atlas/1.0 (https://github.com/ishandogra101-ship-it/worldmap)";

export async function overpass(query, { label = "query" } = {}) {
  await mkdir(CACHE, { recursive: true });
  const key = createHash("sha256").update(query).digest("hex").slice(0, 16);
  const file = path.join(CACHE, `${key}.json`);
  if (existsSync(file)) return JSON.parse(await readFile(file, "utf8"));

  process.stderr.write(`  overpass: ${label} … `);
  const started = Date.now();
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(240_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      await writeFile(file, JSON.stringify(json));
      process.stderr.write(`${json.elements.length} elements in ${((Date.now() - started) / 1000).toFixed(0)}s\n`);
      return json;
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
    }
  }
  process.stderr.write("failed\n");
  throw lastError;
}

/**
 * Join OSM ways into as few continuous lines as possible.
 *
 * A river or a wall arrives as a few dozen ways in arbitrary order and
 * direction. This walks them end to end, tolerating a small gap, and returns
 * the joined runs longest first. It does not close rings and does not
 * interpolate across a real break — a gap in the data should stay visible
 * rather than be papered over with a straight line.
 */
export function stitch(ways, { tolerance = 0.01 } = {}) {
  const near = (a, b) => Math.abs(a[0] - b[0]) <= tolerance && Math.abs(a[1] - b[1]) <= tolerance;
  const pool = ways.map((w) => w.map((p) => [p[0], p[1]]));
  const runs = [];
  while (pool.length) {
    let run = pool.pop();
    let joined = true;
    while (joined) {
      joined = false;
      for (let i = 0; i < pool.length; i++) {
        const w = pool[i];
        if (near(run[run.length - 1], w[0])) { run = run.concat(w.slice(1)); }
        else if (near(run[run.length - 1], w[w.length - 1])) { run = run.concat(w.slice().reverse().slice(1)); }
        else if (near(run[0], w[w.length - 1])) { run = w.slice(0, -1).concat(run); }
        else if (near(run[0], w[0])) { run = w.slice().reverse().slice(0, -1).concat(run); }
        else continue;
        pool.splice(i, 1); joined = true; break;
      }
    }
    runs.push(run);
  }
  return runs.sort((a, b) => b.length - a.length);
}

/**
 * Ramer-Douglas-Peucker: keep the points that carry the shape.
 *
 * A river arrives from OSM with thousands of vertices, which is far more than a
 * frontier line needs and more than the region resolver wants to intersect
 * against. This keeps every point that is further than `epsilon` degrees from
 * the chord its neighbours span, recursively, so bends survive and straight
 * runs collapse. Note it must be recursive on the *whole* segment -- comparing
 * each point only against the last one kept collapses a smooth curve to its
 * endpoints.
 */
export function thin(points, epsilon = 0.02) {
  if (points.length < 3) return points.slice();
  const perp = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-12) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    return Math.abs(dy * (p[0] - a[0]) - dx * (p[1] - a[1])) / len;
  };
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop();
    let far = -1, best = epsilon;
    for (let k = i + 1; k < j; k++) {
      const d = perp(points[k], points[i], points[j]);
      if (d > best) { best = d; far = k; }
    }
    if (far > 0) { keep[far] = 1; stack.push([i, far], [far, j]); }
  }
  return points.filter((_, i) => keep[i]);
}

/**
 * Reduce a scatter of river points to one ordered polyline.
 *
 * An OSM river relation is not a tidy line. It arrives as dozens to hundreds of
 * ways, in arbitrary order and direction, with braided channels, islands and
 * side arms, and stitching end to end leaves a handful of disconnected runs
 * rather than one course. Picking the longest run gets you whichever fragment
 * happened to have the most vertices -- for the Yalu that is the headwater
 * reach near Paektu, a third of a degree of a river that runs four.
 *
 * So instead of following the topology, take every point the relation contains,
 * bin along the axis the river mostly runs, and take the median of each bin.
 * Braids and side channels average out, the course survives, and the result is
 * ordered by construction, which is what halfPlane() in the region resolver
 * needs. `axis` is the axis the river travels along: "lon" for one running east
 * to west, "lat" for one running north to south.
 */
export function spine(points, { axis = "lon", bin = 0.05 } = {}) {
  const a = axis === "lon" ? 0 : 1, b = 1 - a;
  const bins = new Map();
  for (const p of points) {
    const k = Math.round(p[a] / bin);
    (bins.get(k) ?? bins.set(k, []).get(k)).push(p[b]);
  }
  return [...bins.entries()]
    .sort((x, y) => x[0] - y[0])
    .map(([k, vs]) => {
      vs.sort((x, y) => x - y);
      const mid = vs[Math.floor(vs.length / 2)];
      return a === 0 ? [k * bin, mid] : [mid, k * bin];
    });
}
