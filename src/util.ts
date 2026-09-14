// Timeline bounds. Border data runs to 2010; the slider reaches 2026 and shows
// the 2010 snapshot for those recent years (labelled honestly in the UI).
export const MIN_YEAR = -3000;
export const MAX_YEAR = 2026;

// Resolve a path against the app's base URL so fetches work both locally ("/")
// and on GitHub Pages ("/worldmap/").
export function asset(pathUnderPublic: string): string {
  const base = import.meta.env.BASE_URL || "/";
  return base.replace(/\/$/, "") + "/" + pathUnderPublic.replace(/^\//, "");
}

export function formatYear(year: number): string {
  if (year < 0) return `${Math.abs(year).toLocaleString()} BCE`;
  return `${year.toLocaleString()} CE`;
}

// Short form for tight spaces (axis ticks): "1500", "500 BC".
export function formatYearShort(year: number): string {
  if (year < 0) return `${Math.abs(year)} BC`;
  return `${year}`;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
