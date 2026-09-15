export const MIN_YEAR = -3000;
export const MAX_YEAR = 2026;

declare const __BUILD_STAMP__: string;

/**
 * Resolve a path against the app base so it works locally and on Pages.
 *
 * Fetched files carry the build stamp so a rebuilt dataset actually reaches a
 * returning visitor; see vite.config.ts. Images are left alone — they are
 * content that does not change under a stable name, and a query string on a
 * portrait only costs a cache miss.
 */
export function asset(pathUnderPublic: string): string {
  const base = import.meta.env.BASE_URL || "/";
  const path = pathUnderPublic.replace(/^\//, "");
  const url = base.replace(/\/$/, "") + "/" + path;
  return /\.(json|geojson)$/.test(path) ? `${url}?v=${__BUILD_STAMP__}` : url;
}

export function formatYear(year: number): string {
  return year < 0 ? `${Math.abs(year)} BCE` : `${year} CE`;
}

/** Bare number for the big readout; the era line carries BCE/CE. */
export function yearNumber(year: number): string {
  return String(Math.abs(year));
}

export function yearSuffix(year: number): string {
  return year < 0 ? "BCE" : "CE";
}

export function formatYearShort(year: number): string {
  return year < 0 ? `${Math.abs(year)} BC` : String(year);
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

const ORDINAL = ["th", "st", "nd", "rd"];
function ordinal(n: number): string {
  const v = n % 100;
  return n + (ORDINAL[(v - 20) % 10] || ORDINAL[v] || ORDINAL[0]);
}

/** "Late 15th century" — a human descriptor beneath the year. */
export function centuryLabel(year: number): string {
  if (year === 0) return "1st century BCE";
  const bce = year < 0;
  const abs = Math.abs(year);
  const century = Math.floor((abs - 1) / 100) + 1;
  const within = ((abs - 1) % 100) + 1;
  let part: string;
  if (within <= 33) part = bce ? "Late" : "Early";
  else if (within <= 66) part = "Mid";
  else part = bce ? "Early" : "Late";
  return `${part} ${ordinal(century)} century${bce ? " BCE" : ""}`;
}

/**
 * Era names label the timeline and metadata only. They are a convenience for
 * navigation, not a visual theme and not a claim that history divides cleanly.
 */
export interface Era { id: string; name: string; start: number }

export const ERAS: Era[] = [
  { id: "antiquity", name: "Antiquity", start: -3000 },
  { id: "classical", name: "Classical", start: -800 },
  { id: "late-antiquity", name: "Late Antiquity", start: 300 },
  { id: "medieval", name: "Middle Ages", start: 700 },
  { id: "early-modern", name: "Early Modern", start: 1400 },
  { id: "revolutions", name: "Age of Revolutions", start: 1700 },
  { id: "industrial", name: "Industrial", start: 1815 },
  { id: "modern", name: "Modern", start: 1914 },
  { id: "contemporary", name: "Contemporary", start: 1991 },
];

export function eraForYear(year: number): Era {
  let found = ERAS[0];
  for (const e of ERAS) {
    if (year >= e.start) found = e;
    else break;
  }
  return found;
}

/**
 * Rough distance between two points on the globe, in degrees of latitude.
 *
 * Longitude is scaled by the cosine of the latitude, without which a degree
 * near the pole counts for as much as one at the equator and northern places
 * read as further apart than they are. Only ever used to order things by how
 * near they are, so the small-angle approximation costs nothing and the
 * square root is skipped.
 */
export function roughDistance(
  a: { lng: number; lat: number },
  b: { lng: number; lat: number },
): number {
  const dLat = a.lat - b.lat;
  const dLng = (a.lng - b.lng) * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  return dLat * dLat + dLng * dLng;
}
