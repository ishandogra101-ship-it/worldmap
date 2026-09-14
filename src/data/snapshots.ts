import type { BorderManifestEntry } from "../types";
import { asset } from "../util";

let manifestPromise: Promise<BorderManifestEntry[]> | null = null;

export function loadManifest(): Promise<BorderManifestEntry[]> {
  if (!manifestPromise) {
    manifestPromise = fetch(asset("data/borders/manifest.json"))
      .then((r) => {
        if (!r.ok) throw new Error(`manifest ${r.status}`);
        return r.json();
      })
      .then((rows: BorderManifestEntry[]) =>
        [...rows].sort((a, b) => a.year - b.year),
      );
  }
  return manifestPromise;
}

// The snapshot whose year is the latest one <= the requested year; if the
// requested year predates the first snapshot, use the first.
export function nearestSnapshot(
  manifest: BorderManifestEntry[],
  year: number,
): BorderManifestEntry {
  let chosen = manifest[0];
  for (const entry of manifest) {
    if (entry.year <= year) chosen = entry;
    else break;
  }
  return chosen;
}
