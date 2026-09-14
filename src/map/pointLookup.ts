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
