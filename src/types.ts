// One shape for every point-of-interest on the map. Rulers, figures and events
// differ only in `kind` and what `category` means, which keeps the marker engine
// and the Wikidata importer simple: they all emit this.
export type EntityKind = "ruler" | "figure" | "event";

export interface Entity {
  id: string;
  kind: EntityKind;
  name: string;
  /** ruler -> polity/realm, figure -> field, event -> type. */
  category?: string;
  startYear: number; // reign start / birth (or floruit start) / event start
  endYear: number; // reign end / death (or floruit end) / event end
  lng: number;
  lat: number;
  /**
   * 0-100. For curated highlights this is an editorial score; for imported data
   * it is a Wikipedia-sitelink-count proxy rescaled to 0-100. It drives marker
   * size and the zoom at which a marker becomes visible — nothing more.
   */
  prominence: number;
  portrait?: string; // URL/path to a portrait image, if a real one exists
  portraitCredit?: string;
  description?: string;
  source?: string; // a real, checkable URL
}

export interface BorderManifestEntry {
  year: number;
  file: string; // relative to public/data/, e.g. "borders/world_1500.geojson"
  bytes: number;
}

// A polity selected on the map (from a border polygon's properties).
export interface PolitySelection {
  name: string;
  subjectTo?: string;
  partOf?: string;
  color: string;
  snapshotYear: number;
}
