import type { FeatureCollection, Feature, Polygon, MultiPolygon } from "geojson";
import { asset } from "../util";
import { groupKey, colorForGroup, type BorderProps } from "./colors";

export interface PolityLabel {
  group: string; // sovereign key
  name: string; // display name
  color: string;
  lng: number;
  lat: number;
  area: number; // planar deg^2, for zoom-based visibility
}

interface Snapshot {
  fc: FeatureCollection;
  labels: PolityLabel[];
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
  annotate(fc);
  return { fc, labels: computeLabels(fc) };
}

function annotate(fc: FeatureCollection): void {
  for (const f of fc.features) {
    const props = (f.properties || {}) as BorderProps;
    const key = groupKey(props);
    const name = (props.NAME || key || "").toString();
    (props as Record<string, unknown>).__group = key;
    (props as Record<string, unknown>).__color = colorForGroup(key);
    (props as Record<string, unknown>).__name = name;
    (props as Record<string, unknown>).__hasName = key ? 1 : 0;
    f.properties = props as Feature["properties"];
  }
}

// --- planar area + centroid, aggregated per sovereign group ---

function ringArea(ring: number[][]): number {
  let sum = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % n];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

function ringCentroid(ring: number[][]): [number, number, number] {
  // returns [cx, cy, area]
  let cx = 0,
    cy = 0,
    a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % n];
    const cross = x1 * y2 - x2 * y1;
    a += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  a = a / 2;
  if (Math.abs(a) < 1e-9) {
    // degenerate: fall back to vertex average
    const avg = ring.reduce(
      (acc, p) => [acc[0] + p[0], acc[1] + p[1]],
      [0, 0],
    );
    return [avg[0] / ring.length, avg[1] / ring.length, ringArea(ring)];
  }
  return [cx / (6 * a), cy / (6 * a), Math.abs(a)];
}

function polygonParts(geom: Polygon | MultiPolygon): number[][][] {
  // outer rings only
  if (geom.type === "Polygon") return [geom.coordinates[0] as number[][]];
  return (geom.coordinates as number[][][][]).map((poly) => poly[0] as number[][]);
}

interface LabelAcc {
  name: string;
  color: string;
  area: number; // total area of the whole group (drives visibility)
  // "home" = parts of features whose NAME equals the sovereign group. The label
  // sits on the homeland (Britain), not the area-weighted centre of a far-flung
  // empire (which would float into the ocean near its colonies).
  homeArea: number;
  homeCx: number;
  homeCy: number;
  bestPartArea: number; // largest single part, as a fallback anchor
  bestCx: number;
  bestCy: number;
}

function computeLabels(fc: FeatureCollection): PolityLabel[] {
  const acc = new Map<string, LabelAcc>();
  for (const f of fc.features) {
    const props = (f.properties || {}) as Record<string, unknown>;
    const group = (props.__group as string) || "";
    if (!group) continue;
    const geom = f.geometry as Polygon | MultiPolygon | null;
    if (!geom || (geom.type !== "Polygon" && geom.type !== "MultiPolygon")) continue;
    const isHome = ((props.NAME as string) || "") === group;
    let entry = acc.get(group);
    if (!entry) {
      entry = {
        name: (props.__name as string) || group,
        color: (props.__color as string) || "#888",
        area: 0,
        homeArea: 0,
        homeCx: 0,
        homeCy: 0,
        bestPartArea: 0,
        bestCx: 0,
        bestCy: 0,
      };
      acc.set(group, entry);
    }
    for (const ring of polygonParts(geom)) {
      const [cx, cy, a] = ringCentroid(ring);
      entry.area += a;
      if (isHome) {
        entry.homeArea += a;
        entry.homeCx += cx * a;
        entry.homeCy += cy * a;
      }
      if (a > entry.bestPartArea) {
        entry.bestPartArea = a;
        entry.bestCx = cx;
        entry.bestCy = cy;
      }
    }
  }
  const labels: PolityLabel[] = [];
  for (const [group, e] of acc) {
    if (e.area <= 0) continue;
    const useHome = e.homeArea > 0;
    labels.push({
      group,
      name: e.name,
      color: e.color,
      lng: useHome ? e.homeCx / e.homeArea : e.bestCx,
      lat: useHome ? e.homeCy / e.homeArea : e.bestCy,
      area: e.area,
    });
  }
  labels.sort((a, b) => b.area - a.area);
  return labels;
}
