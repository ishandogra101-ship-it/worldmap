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
  | "Central Asia" | "Northern Eurasia" | "South Asia" | "East Asia"
  | "Southeast Asia" | "The Americas" | "Oceania" | "Elsewhere";

export function regionOf(lng: number, lat: number): Region {
  if (lng <= -30) return "The Americas";
  if (lng >= 110 && lat <= 0) return "Oceania";
  if (lng >= 92 && lat >= -11 && lat < 25) return "Southeast Asia";
  // The Urals and north: without this, Muscovy's centre reads as Central Asia.
  if (lat >= 50 && lng >= 55) return "Northern Eurasia";
  if (lng >= 92) return "East Asia";
  // 37°N rather than 38° keeps the Amu Darya khanates out of South Asia.
  if (lng >= 60 && lat >= 5 && lat < 37) return "South Asia";
  if (lng >= 46 && lat >= 35 && lat < 50) return "Central Asia";
  // Anatolia and the Levant reach west to about 28°E; below 30°N the divide
  // from Africa is the Suez isthmus instead. Without the first of these, the
  // Ottoman Empire — whose mapped centre sits near Sinai — reads as North Africa.
  if (lng >= 28 && lat >= 30 && lat < 45) return "West Asia";
  if (lng >= 34 && lat >= 12 && lat < 30) return "West Asia";
  if (lat >= 35) return "Europe";
  if (lat >= 10) return "North Africa";
  if (lat >= -40) return "Sub-Saharan Africa";
  return "Elsewhere";
}
