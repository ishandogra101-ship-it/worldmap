/**
 * The Atlas of Power canonical history schema.
 *
 * These types describe authored history, not imported records. The difference
 * that matters is `verification`: an imported row has a provenance of "some
 * query returned it", which is not a historical claim at all. A canonical
 * record says who asserted it, on what basis, and whether a person has checked.
 *
 * See RULES.md. The short version is that a record may only claim what was
 * actually done to it, and nothing automated may mark a record reviewed.
 */

/** A year, negative for BCE, with no year zero. */
export type Year = number;

/**
 * A date that history may not know precisely.
 *
 * This is not a confidence rating on a fact the atlas then displays with a
 * caveat. It is how the record stores what the scholarship says. A reign that
 * began in a known year carries `{ year }`; one placed within a range carries
 * `{ year, range }` and the year is the value the atlas draws, chosen
 * deliberately rather than averaged.
 */
export interface HistoricalDate {
  year: Year;
  /** earliest and latest the sources place it, when they differ */
  range?: [Year, Year];
  /** why this year and not another, when the choice needed making */
  note?: string;
}

export type VerificationMethod = "drafted" | "reviewed" | "cited";

export interface Verification {
  method: VerificationMethod;
  /**
   * Who did it. "claude" for drafted records. A real person for reviewed ones —
   * the validator rejects a reviewed record attributed to an assistant, which
   * is the single check that keeps this whole layer honest.
   */
  by: string;
  /** ISO date of the last time someone looked at this record */
  date: string;
  notes?: string;
}

export interface SourceRef {
  /** author or issuing body */
  author?: string;
  /** the work itself */
  title: string;
  /** edition, volume, year of publication */
  edition?: string;
  /** page, chapter, table — only present when someone actually looked */
  locator?: string;
  /** only ever present when someone opened it */
  url?: string;
}

export type PolityType =
  | "empire" | "kingdom" | "sultanate" | "caliphate" | "khanate"
  | "republic" | "confederation" | "city-state" | "dynasty"
  | "principality" | "state" | "theocracy" | "league";

export interface Capital {
  name: string;
  lng: number;
  lat: number;
  from?: Year;
  to?: Year;
  note?: string;
}

/**
 * A polity the atlas asserts existed.
 *
 * The point of this record is that it is independent of any import. When the
 * borders dataset omits the Ming from its 1400 snapshot, the atlas does not
 * conclude the Ming did not exist — it knows they did, from here, and reports
 * the snapshot as incomplete. An import can never delete a polity; it can only
 * fail to corroborate one, which is a different thing and is recorded as such.
 */
export interface Polity {
  id: string;
  canonicalName: string;
  alternativeNames?: string[];
  type: PolityType;
  /** broad region, for the coverage matrix — not a claim about geography */
  region: Region;
  founded: HistoricalDate;
  /** absent means it continues past the atlas's range */
  ended?: HistoricalDate;
  capitals?: Capital[];
  dynasty?: string;
  predecessors?: string[];
  successors?: string[];
  /**
   * Periods when this polity was under another's authority.
   *
   * The dimension the whole system was missing, and the reason the capital
   * test could not tell a real error from a correct one. Mysore's capital
   * drawn as Vijayanagara between 1399 and 1565 is right — Mysore was its
   * vassal. Mewar's capital drawn as the Sultanate of Delhi is wrong, because
   * Mewar never submitted to it. Both look identical to a test that knows only
   * which polities existed.
   *
   * `kind` matters because these are not the same relationship. A tributary
   * sent goods and kept its own government; a vassal owed service; a princely
   * state under paramountcy ran its internal affairs while another power held
   * its foreign policy. An atlas that flattens them into "part of" loses most
   * of how empires actually worked.
   */
  subordinateTo?: {
    polityId: string;
    from: Year;
    to: Year;
    kind: "vassal" | "tributary" | "protectorate" | "princely-state" | "personal-union" | "nominal";
    note?: string;
  }[];
  /** names this polity is known by in the borders dataset, for reconciliation */
  mapsTo?: string[];
  sources: SourceRef[];
  verification: Verification;
  notes?: string;
}

export type Region =
  | "East Asia" | "South Asia" | "Southeast Asia" | "Central Asia"
  | "West Asia" | "Europe" | "North Africa" | "Sub-Saharan Africa"
  | "The Americas" | "Oceania" | "Northern Eurasia";

/**
 * Roles a person held. Deliberately not a monarch flag.
 *
 * Caesar was never a king and mattered enormously; a model that asks only
 * "is this person a monarch" cannot see him, which is exactly how the import
 * lost him. Holding power and being historically decisive are different
 * questions and the schema keeps them apart.
 */
export type Role =
  | "emperor" | "empress" | "king" | "queen" | "sultan" | "caliph"
  | "shah" | "khan" | "khagan" | "mansa" | "pharaoh" | "tsar"
  | "consul" | "dictator" | "president" | "prime-minister"
  | "general" | "admiral" | "statesman"
  | "philosopher" | "scientist" | "mathematician" | "physician"
  | "artist" | "architect" | "writer" | "poet" | "composer"
  | "religious-leader" | "reformer" | "explorer" | "inventor" | "scholar";

/**
 * A person the atlas asserts is historically significant.
 *
 * Rulers are people who held a reign over a polity. Everyone else is a person
 * with roles and a lifetime. One type covers both, because the alternative is
 * two lists that disagree about Caesar.
 */
export interface Reign {
  polityId: string;
  start: HistoricalDate;
  end?: HistoricalDate;
  titles?: string[];
  predecessorId?: string;
  successorId?: string;
  dynasty?: string;
  /** why this reign is separate from the person's other reigns */
  note?: string;
}

export interface Person {
  id: string;
  canonicalName: string;
  alternativeNames?: string[];
  roles: Role[];
  born?: HistoricalDate;
  died?: HistoricalDate;
  /** where the atlas places the marker, and why that place */
  place: { lng: number; lat: number; name: string; why: string };
  /**
   * Every time this person held power, in order.
   *
   * A list rather than a single record, because the validator found two cases
   * on its first run that one record cannot express honestly. Kublai was
   * khagan of the Mongol Empire from 1260 and proclaimed the Yuan in 1271 —
   * two polities, one man. The Zhengtong Emperor reigned, was captured at
   * Tumu, and reigned again after eight years in which someone else held the
   * throne; flattening that into 1435–1464 makes the succession read backwards
   * and erases the Jingtai reign entirely.
   */
  reigns?: Reign[];
  region: Region;
  sources: SourceRef[];
  verification: Verification;
  notes?: string;
}

/** Whether a polity existed in a given year, by its own record. */
export function existsAt(p: Polity, year: Year): boolean {
  if (year < p.founded.year) return false;
  return p.ended === undefined || year <= p.ended.year;
}

/** Whether a person held power in a given year, by their own record. */
export function reignedAt(p: Person, year: Year): boolean {
  return (p.reigns ?? []).some(
    (r) => year >= r.start.year && (r.end === undefined || year <= r.end.year),
  );
}

/** The reign, if any, that covers this year. */
export function reignAt(p: Person, year: Year): Reign | undefined {
  return (p.reigns ?? []).find(
    (r) => year >= r.start.year && (r.end === undefined || year <= r.end.year),
  );
}
