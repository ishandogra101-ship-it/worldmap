import { asset } from "../util";

export interface Arc {
  /** [snapshot year, planar deg² held] for every snapshot the realm appears in */
  points: Array<[number, number]>;
  /** how many snapshots exist in total, so coverage can be stated honestly */
  snapshots: number;
}

interface ArcFile {
  snapshots: number[];
  groups: Record<string, Array<[number, number]>>;
}

let file: Promise<ArcFile> | null = null;

function load(): Promise<ArcFile> {
  if (!file) {
    file = fetch(asset("data/arcs.json"))
      .then((r) => (r.ok ? r.json() : { snapshots: [], groups: {} }))
      .catch(() => ({ snapshots: [], groups: {} }));
  }
  return file;
}

export async function arcFor(group: string): Promise<Arc | null> {
  const f = await load();
  const points = f.groups[group];
  if (!points || points.length === 0) return null;
  return { points, snapshots: f.snapshots.length };
}
