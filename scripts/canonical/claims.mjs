/**
 * Territorial control as dated claims, and the map for any year.
 *
 * The replacement for snapshots. A claim says one polity held one extent over
 * one interval, with a note saying why. The map for a year is every claim valid
 * in that year — not the nearest of 49 fixed files, but the actual year asked
 * for.
 *
 * Ground no claim covers is not drawn. That is the point: a hole means nobody
 * has established what held it, which is a fact about the record and is
 * different from the ground being empty. The snapshot model had no way to say
 * it, and filled the gap with whichever empire was nearest.
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pc from "polygon-clipping";
import { makeRegionResolver, areaOf } from "./regions.mjs";
import { loadPolities } from "./load.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CANON = path.join(ROOT, "canonical");

export async function loadClaims() {
  const dir = path.join(CANON, "claims");
  let files = [];
  try { files = (await readdir(dir)).filter((f) => f.endsWith(".json")); } catch { return []; }
  const out = [];
  for (const f of files) {
    const d = JSON.parse(await readFile(path.join(dir, f), "utf8"));
    for (const c of d.claims) {
      out.push({ ...c, sources: c.sources ?? d.sources, verification: c.verification ?? d.verification, _file: f });
    }
  }
  return out;
}

export async function makeAtlas() {
  const resolvers = new Map();
  const dir = path.join(CANON, "regions");
  for (const f of (await readdir(dir)).filter((x) => x.endsWith(".json"))) {
    resolvers.set(f.replace(".json", ""), await makeRegionResolver(path.join(dir, f)));
  }
  const regionOf = (id) => {
    for (const r of resolvers.values()) {
      if (r.spec.regions.some((x) => x.id === id)) return r.region(id);
    }
    throw new Error(`no region "${id}" in any region file`);
  };

  const claims = await loadClaims();

  /**
   * Geometry the boundary source itself draws for a name in some other year.
   *
   * Some snapshots are simply broken while their neighbours are fine. At 1400
   * the source draws one "Great Khanate" over China, Manchuria, Mongolia and
   * Korea, thirty-two years after the Yuan were driven out; at 1492 and 1500 it
   * draws the Ming and Korea correctly. Rebuilding a Ming frontier from named
   * physical lines would mean deciding where the northern border ran, and the
   * honest answer is that this project does not know it better than its own
   * source does eight decades later.
   *
   * So a claim may borrow: "the ground the source gives the Ming Empire in
   * 1492". It invents nothing, it is reproducible, and the claim's note has to
   * say why the borrowed year is a fair likeness of the claimed one.
   *
   * Only features the source drew are eligible. Anything carrying __claim is
   * something this layer put there, and borrowing from it would let one claim
   * silently build on another.
   */
  const borrowed = new Map();
  // walk the whole extent tree: an asDrawnIn nested inside a union or a minus
  // still needs its snapshot loaded, and only collecting the top level meant a
  // borrowed year silently went missing
  const wanted = [];
  const collect = (e) => {
    if (!e || typeof e !== "object") return;
    if (e.asDrawnIn) wanted.push(e.asDrawnIn);
    for (const m of e.union ?? []) collect(m);
    if (e.minus) { collect(e.minus.from); collect(e.minus.remove); }
  };
  for (const c of claims) collect(c.extent);
  for (const year of new Set(wanted.map((a) => a.year))) {
    const file = path.join(ROOT, "public", "data", "borders",
      year < 0 ? `world_bc${-year}.geojson` : `world_${year}.geojson`);
    const fc = JSON.parse(await readFile(file, "utf8"));
    for (const f of fc.features) {
      const name = f.properties?.NAME;
      if (!name || f.properties.__claim || !f.geometry) continue;
      const mp = f.geometry.type === "Polygon" ? [f.geometry.coordinates]
        : f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [];
      if (!mp.length) continue;
      const key = `${year}|${name}`;
      borrowed.set(key, borrowed.has(key) ? pc.union(borrowed.get(key), mp) : mp);
    }
  }

  const extentOf = (e) => {
    if (e.region) return regionOf(e.region);
    // members may be region ids or whole extents, so a union can mix a named
    // region with a borrowed one
    if (e.union) {
      return e.union
        .map((m) => (typeof m === "string" ? regionOf(m) : extentOf(m)))
        .reduce((a, b) => (a.length ? pc.union(a, b) : b));
    }
    if (e.minus) return pc.difference(extentOf(e.minus.from), extentOf(e.minus.remove));
    if (e.asDrawnIn) {
      const key = `${e.asDrawnIn.year}|${e.asDrawnIn.name}`;
      const mp = borrowed.get(key);
      if (!mp) throw new Error(`the source draws no "${e.asDrawnIn.name}" in ${e.asDrawnIn.year}`);
      return mp;
    }
    throw new Error(`unrecognised extent ${JSON.stringify(e)}`);
  };
  const polities = await loadPolities();

  /**
   * Every claim valid in this year, with its geometry resolved.
   *
   * A later claim in the file cuts every earlier one it touches. That is how a
   * cartographer works — lay down the broad thing, then the specific things on
   * top — and it makes file order an explicit statement rather than an
   * accident. Delhi is written before Malwa, Jaunpur and the Rajput country,
   * so those carve their ground out of it, and the alternative (hand-writing a
   * subtraction for every pair of neighbours) is both laborious and a place for
   * mistakes to hide.
   *
   * Claims that do not touch are unaffected, so ordering only matters where
   * two claims genuinely disagree about the same ground — which is exactly
   * where a decision should have to be visible.
   */
  function at(year) {
    const live = claims
      .filter((c) => year >= c.from && year < c.to)
      .map((c) => {
        const p = polities.find((x) => x.id === c.polityId);
        return {
          polityId: c.polityId,
          name: p ? p.canonicalName : c.polityId,
          geometry: extentOf(c.extent),
          from: c.from, to: c.to,
          note: c.note,
          sources: c.sources,
          verification: c.verification,
          // Names this claim takes off the map, each with the reason. A claim
          // may only unmake a polity the boundary source draws if someone has
          // written down why — the source is anachronistic here, or this power
          // annexed it in a year the source has not caught up with.
          replaces: c.replaces ?? [],
        };
      });

    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        if (live[i].geometry.length === 0) break;
        live[i].geometry = pc.difference(live[i].geometry, live[j].geometry);
      }
    }
    return live.filter((c) => c.geometry.length > 0);
  }

  /** Two claims on the same ground in the same year is a contradiction. */
  function overlaps(year) {
    const held = at(year);
    const out = [];
    for (let i = 0; i < held.length; i++) {
      for (let j = i + 1; j < held.length; j++) {
        const both = pc.intersection(held[i].geometry, held[j].geometry);
        const a = areaOf(both);
        if (a > 0.5) out.push({ a: held[i].name, b: held[j].name, area: a });
      }
    }
    return out;
  }

  return { at, overlaps, claims, polities, areaOf };
}
