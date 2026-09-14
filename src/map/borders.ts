import type { FeatureCollection, Feature, Polygon, MultiPolygon } from "geojson";
import { asset } from "../util";
import { groupKey, colorForGroup, tierForArea, type BorderProps } from "./palette";
import type { PolitySummary, PolityTier } from "../types";

export interface Snapshot {
  fc: FeatureCollection;
  polities: PolitySummary[];
  /** group -> summary, for fast lookup on hover/click */
  byGroup: Map<string, PolitySummary>;
}

const cache = new Map<string, Promise<Snapshot>>();

export function loadSnapshot(fileRel: string): Promise<Snapshot> {
  let p = cache.get(fileRel);
  if (!p) {
    p = fetchSnapshot(fileRel);
    cache.set(fileRel, p);
  }
  return p;
}

async function fetchSnapshot(fileRel: string): Promise<Snapshot> {
  const res = await fetch(asset(`data/${fileRel}`));
  if (!res.ok) throw new Error(`Failed to load ${fileRel}: ${res.status}`);
  const fc = (await res.json()) as FeatureCollection;
  const polities = summarise(fc);
  const byGroup = new Map(polities.map((p) => [p.group, p]));
  // second pass: stamp tier onto each feature now that tiers are known
  for (const f of fc.features) {
    const props = f.properties as Record<string, unknown>;
    const g = props.__group as string;
    props.__tier = g ? (byGroup.get(g)?.tier ?? 2) : 2;
  }
  return { fc, polities, byGroup };
}

// --- geometry helpers (planar; relative scale only) ---

function ringCentroid(ring: number[][]): [number, number, number] {
  let cx = 0, cy = 0, a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % n];
    const cross = x1 * y2 - x2 * y1;
    a += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  a /= 2;
  if (Math.abs(a) < 1e-9) {
    let sx = 0, sy = 0;
    for (const p of ring) { sx += p[0]; sy += p[1]; }
    return [sx / ring.length, sy / ring.length, 0];
  }
  return [cx / (6 * a), cy / (6 * a), Math.abs(a)];
}

function outerRings(geom: Polygon | MultiPolygon): number[][][] {
  if (geom.type === "Polygon") return [geom.coordinates[0] as number[][]];
  return (geom.coordinates as number[][][][]).map((poly) => poly[0] as number[][]);
}

interface Acc {
  name: string;
  color: string;
  area: number;
  homeArea: number; homeCx: number; homeCy: number;
  bestArea: number; bestCx: number; bestCy: number;
}

/**
 * Collapse polygons into one summary per sovereign. The label anchor prefers the
 * realm's home territory (the feature whose own NAME is the sovereign), so a
 * far-flung empire is labelled on its homeland rather than at the mean centre of
 * its colonies — which for a maritime empire lands in open ocean.
 */
function summarise(fc: FeatureCollection): PolitySummary[] {
  const acc = new Map<string, Acc>();

  for (const f of fc.features) {
    const props = (f.properties || {}) as BorderProps;
    const group = groupKey(props);
    const name = (props.NAME || group || "").toString();
    const color = group ? colorForGroup(group) : "transparent";
    (props as Record<string, unknown>).__group = group;
    (props as Record<string, unknown>).__color = color;
    (props as Record<string, unknown>).__name = name;
    f.properties = props as Feature["properties"];
    if (!group) continue;

    const geom = f.geometry as Polygon | MultiPolygon | null;
    if (!geom || (geom.type !== "Polygon" && geom.type !== "MultiPolygon")) continue;

    let e = acc.get(group);
    if (!e) {
      e = { name, color, area: 0, homeArea: 0, homeCx: 0, homeCy: 0, bestArea: 0, bestCx: 0, bestCy: 0 };
      acc.set(group, e);
    }
    const isHome = ((props.NAME || "") as string) === group;
    for (const ring of outerRings(geom)) {
      const [cx, cy, a] = ringCentroid(ring);
      e.area += a;
      if (isHome) { e.homeArea += a; e.homeCx += cx * a; e.homeCy += cy * a; }
      if (a > e.bestArea) { e.bestArea = a; e.bestCx = cx; e.bestCy = cy; }
    }
  }

  let maxArea = 0;
  for (const e of acc.values()) if (e.area > maxArea) maxArea = e.area;

  const out: PolitySummary[] = [];
  for (const [group, e] of acc) {
    if (e.area <= 0) continue;
    const useHome = e.homeArea > 0;
    out.push({
      group,
      name: e.name,
      color: e.color,
      tier: tierForArea(e.area, maxArea) as PolityTier,
      lng: useHome ? e.homeCx / e.homeArea : e.bestCx,
      lat: useHome ? e.homeCy / e.homeArea : e.bestCy,
      area: e.area,
    });
  }
  out.sort((a, b) => b.area - a.area);
  return out;
}
