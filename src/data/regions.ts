/**
 * Coarse world regions, used only to answer "what else was going on, somewhere
 * else?".
 *
 * Deliberately named for broad geography rather than for modern countries, since
 * the atlas covers five thousand years in which those countries mostly did not
 * exist. These are a navigational convenience, not a claim that history divides
 * along these lines.
 */
export type Region =
  | "Europe" | "North Africa" | "Sub-Saharan Africa" | "West Asia"
  | "Central Asia" | "South Asia" | "East Asia" | "Southeast Asia"
  | "The Americas" | "Oceania" | "Elsewhere";

export function regionOf(lng: number, lat: number): Region {
  if (lng <= -30) return "The Americas";
  if (lng >= 110 && lat <= 0) return "Oceania";
  if (lng >= 92 && lat >= -11 && lat < 25) return "Southeast Asia";
  if (lng >= 92) return "East Asia";
  if (lng >= 60 && lat >= 5 && lat < 38) return "South Asia";
  if (lng >= 46 && lat >= 35) return "Central Asia";
  if (lng >= 33 && lat >= 12 && lat < 45) return "West Asia";
  if (lat >= 35) return "Europe";
  if (lat >= 10) return "North Africa";
  if (lat >= -40) return "Sub-Saharan Africa";
  return "Elsewhere";
}
