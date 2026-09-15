import type { FeatureCollection, Polygon, MultiPolygon } from "geojson";
import { loadManifest } from "../data/snapshots";
import { loadSnapshot } from "./borders";

export interface HeldBy {
  /** the territory's own name at that date */
  name: string;
  /** the sovereign it answered to */
  group: string;
  color: string;
  year: number;
}

function inRing(ring: number[][], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function inPolygon(rings: number[][][], x: number, y: number): boolean {
  if (rings.length === 0 || !inRing(rings[0], x, y)) return false;
  // a point inside a hole is outside the polygon
  for (let i = 1; i < rings.length; i++) if (inRing(rings[i], x, y)) return false;
  return true;
}

/** Which polity held this exact point, in this snapshot. */
export function polityAt(fc: FeatureCollection, lng: number, lat: number): HeldBy | null {
  for (const f of fc.features) {
    const g = f.geometry as Polygon | MultiPolygon | null;
    if (!g) continue;
    let hit = false;
    if (g.type === "Polygon") {
      hit = inPolygon(g.coordinates as number[][][], lng, lat);
    } else if (g.type === "MultiPolygon") {
      for (const poly of g.coordinates as number[][][][]) {
        if (inPolygon(poly as number[][][], lng, lat)) { hit = true; break; }
      }
    }
    if (!hit) continue;
    const p = (f.properties || {}) as Record<string, string>;
    const group = String(p.__group || "");
    if (!group) continue;
    return {
      name: String(p.__name || p.NAME || group),
      group,
      color: String(p.__color || "#888"),
      year: 0,
    };
  }
  return null;
}

/**
 * What held this place in the nearest mapped year before and after the one on
 * screen. Only real snapshots are consulted — nothing is inferred about the
 * years in between.
 */
export async function beforeAndAfter(
  lng: number,
  lat: number,
  snapshotYear: number,
): Promise<{ before: HeldBy | null; after: HeldBy | null }> {
  const manifest = await loadManifest();
  const i = manifest.findIndex((m) => m.year === snapshotYear);
  const prev = i > 0 ? manifest[i - 1] : null;
  const next = i >= 0 && i < manifest.length - 1 ? manifest[i + 1] : null;

  const lookup = async (entry: typeof prev): Promise<HeldBy | null> => {
    if (!entry) return null;
    try {
      const { fc } = await loadSnapshot(entry.file);
      const held = polityAt(fc, lng, lat);
      return held ? { ...held, year: entry.year } : null;
    } catch {
      return null;
    }
  };

  const [before, after] = await Promise.all([lookup(prev), lookup(next)]);
  return { before, after };
}

/**
 * Everyone whose recorded place falls inside one realm's territory.
 *
 * The panel used to find its people by comparing the border dataset's realm
 * name against the realm named on a person's record. Those two vocabularies
 * barely overlap — of 636 realms in the 1600 snapshot, 17 found a ruler that
 * way — and an imported figure carries a field ("art", "science") where a realm
 * name would go, so no realm ever found a single one of the 14,304.
 *
 * Geography is the honest join: a person belongs here if the place recorded for
 * them lies within what this realm holds in the year being drawn. A bounding
 * box per feature keeps the ray casting off the great majority of candidates.
 */
/**
 * Candidates standing inside a realm's polygons.
 *
 * `match` decides which polygons count. Passing a group takes every polygon in
 * it, which for the Mongol Empire in 1400 means six khanates from Korea to
 * Moscow — so a panel scoped that way answers about a quarter of Eurasia.
 * Passing the clicked polity's own name keeps the answer to the shape the
 * reader pointed at.
 */
export function entitiesWithin<T extends { lng: number; lat: number }>(
  fc: FeatureCollection,
  match: string | ((props: Record<string, unknown>) => boolean),
  candidates: readonly T[],
): T[] {
  const want = typeof match === "function"
    ? match
    : (props: Record<string, unknown>) => String(props.__group || "") === match;
  const boxes: Array<{ rings: number[][][]; x0: number; y0: number; x1: number; y1: number }> = [];

  for (const f of fc.features) {
    const props = (f.properties || {}) as Record<string, unknown>;
    if (!want(props)) continue;
    const g = f.geometry;
    const polys: number[][][][] =
      g?.type === "Polygon" ? [g.coordinates as number[][][]]
      : g?.type === "MultiPolygon" ? (g.coordinates as number[][][][])
      : [];
    for (const rings of polys) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of rings[0]) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      boxes.push({ rings, x0, y0, x1, y1 });
    }
  }
  if (boxes.length === 0) return [];

  const out: T[] = [];
  for (const c of candidates) {
    for (const b of boxes) {
      if (c.lng < b.x0 || c.lng > b.x1 || c.lat < b.y0 || c.lat > b.y1) continue;
      if (inPolygon(b.rings, c.lng, c.lat)) { out.push(c); break; }
    }
  }
  return out;
}
