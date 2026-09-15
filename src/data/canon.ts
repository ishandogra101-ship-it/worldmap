import { asset } from "../util";

/**
 * The canonical polity backbone, as the app sees it.
 *
 * This is the layer that makes a missing import survivable. The borders
 * dataset omits the Ming from its 1400 snapshot; without this, the atlas has
 * no way to know that is an omission rather than a fact, and 92 years of the
 * map say the Mongols ruled China. With it, the atlas knows the Ming existed
 * from 1368 to 1644 because a person wrote that down against named sources,
 * and can say so whatever the geometry does.
 *
 * It never draws anything. Inventing a boundary to fill the gap would be the
 * same failure in the opposite direction.
 */
export interface CanonPolity {
  id: string;
  name: string;
  alternativeNames: string[];
  type: string;
  region: string;
  from: number;
  to: number | null;
  capitals: { name: string; lng: number; lat: number; from?: number; to?: number }[];
  /** names the borders dataset uses for this polity */
  mapsTo: string[];
  sources: string[];
  verification: "drafted" | "reviewed" | "cited";
  reviewed: string;
  notes?: string;
}

let cached: Promise<CanonPolity[]> | null = null;

export function loadCanon(): Promise<CanonPolity[]> {
  if (!cached) {
    cached = fetch(asset("data/polities.json"))
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => []);
  }
  return cached;
}

export const canonExistsAt = (p: CanonPolity, year: number): boolean =>
  year >= p.from && (p.to === null || year <= p.to);

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Canonical polities that should be on screen for this year and are not.
 *
 * A polity counts as drawn when the snapshot uses any of the names it is known
 * by. The comparison is over `mapsTo` plus the canonical and alternative names,
 * because the border data and the history layer were written by different
 * people and call the same realm different things — "Ming Empire", "Ming
 * Chinese Empire", "Ming dynasty".
 *
 * A polity missing from one snapshot is not always an error: the atlas draws
 * nearest-earlier, so a realm founded between two snapshots is legitimately
 * absent from the earlier one. `foundedBefore` filters to realms that had
 * already existed for a decade when the snapshot was drawn, which is the case
 * where absence means the source is wrong.
 */
export function missingFrom(
  canon: CanonPolity[],
  drawnNames: readonly string[],
  snapshotYear: number,
  { foundedBefore = 10, near }: { foundedBefore?: number; near?: string } = {},
): CanonPolity[] {
  const drawn = new Set(drawnNames.map(norm));
  const missing = canon.filter((p) => {
    if (!canonExistsAt(p, snapshotYear)) return false;
    if (snapshotYear - p.from < foundedBefore) return false;
    const names = [p.name, ...p.alternativeNames, ...p.mapsTo].map(norm);
    return !names.some((n) => drawn.has(n));
  });
  // A reader looking at China wants to hear about the Ming, not the Oyo. Same
  // region first, because a gap next to where you are standing is the one you
  // are in a position to notice — and on the first run of this list the Ming
  // was pushed off the end by realms three continents away.
  if (!near) return missing;
  return missing.sort((a, b) =>
    (a.region === near ? 0 : 1) - (b.region === near ? 0 : 1));
}

/**
 * A polity the snapshot names that the research layer says had already ended.
 *
 * Stronger than a missing realm: the map is not merely incomplete, it is
 * showing a state that no longer existed. "Great Khanate" over China in 1400
 * is the case — the Yuan ended in 1368 and the name should not be on that map
 * at all.
 */
export function endedBefore(
  canon: CanonPolity[],
  drawnName: string,
  year: number,
): CanonPolity | undefined {
  const n = norm(drawnName);
  return canon.find(
    (p) =>
      p.to !== null && p.to < year &&
      [p.name, ...p.alternativeNames, ...p.mapsTo].map(norm).includes(n),
  );
}

/** The canonical record for a name the borders dataset uses, if there is one. */
export function canonFor(
  canon: CanonPolity[],
  drawnName: string,
  year: number,
): CanonPolity | undefined {
  const n = norm(drawnName);
  return canon.find(
    (p) =>
      canonExistsAt(p, year) &&
      [p.name, ...p.alternativeNames, ...p.mapsTo].map(norm).includes(n),
  );
}
