/** One shape for every historical actor on the map. */
export type EntityKind = "ruler" | "figure" | "event" | "city";

export interface Entity {
  id: string;
  kind: EntityKind;
  name: string;
  /** ruler -> realm, figure -> field, event -> type. */
  category?: string;
  startYear: number;
  endYear: number;
  lng: number;
  lat: number;
  /**
   * 0-100 visibility proxy. Imported records derive it from Wikipedia sitelink
   * count; curated records use an editorial score. It decides marker size and
   * the zoom at which a marker appears — it is NOT a claim about importance.
   */
  prominence: number;
  portrait?: string;
  portraitCredit?: string;
  description?: string;
  source?: string;
  /** true when the record came from the Wikidata import rather than the curated set. */
  imported?: boolean;
  /** a city still inhabited today, so its end year is a bound rather than a fall */
  continuing?: boolean;
}

export interface BorderManifestEntry {
  year: number;
  file: string;
  bytes: number;
}

/** Visual weight tier for a polity, derived from its mapped area. */
export type PolityTier = 0 | 1 | 2; // 0 = major, 1 = regional, 2 = minor

/** A sovereign grouping present in one snapshot, with its label anchor. */
export interface PolitySummary {
  group: string;
  name: string;
  color: string;
  tier: PolityTier;
  lng: number;
  lat: number;
  /** planar deg^2 — relative scale only, never shown as a real area figure. */
  area: number;
  /**
   * Whether the snapshot maps a territory that *is* this realm, rather than only
   * territories that answer to it. False for a sovereign that appears purely as
   * an overlord: in 1900 the group "United Kingdom" is anchored on British
   * India, which would otherwise place the United Kingdom in South Asia.
   */
  hasHome: boolean;
}

export interface PolitySelection {
  kind: "polity";
  name: string;
  group: string;
  /** the point the user actually asked about */
  lng: number;
  lat: number;
  subjectTo?: string;
  partOf?: string;
  color: string;
  tier: PolityTier;
  area: number;
  snapshotYear: number;
}

export type Selection =
  | PolitySelection
  | { kind: "entity"; entity: Entity };

export type LayerId = "political" | "rulers" | "figures" | "events" | "cities" | "labels";

export interface HoverInfo {
  name: string;
  subtitle?: string;
  detail?: string;
  color?: string;
  x: number;
  y: number;
  /** compare mode: what each of the two years holds under the cursor */
  rows?: Array<{ when: string; held: { name: string; group: string; color: string } | null }>;
  changed?: boolean;
}
