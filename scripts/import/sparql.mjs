// Minimal Wikidata SPARQL client with polite headers and retry/backoff.
//
// NOTE: query.wikidata.org must be reachable. Some managed environments block it
// by network policy (the app's own README explains this). Run these scripts where
// Wikidata and Wikimedia Commons are allowed.

const ENDPOINT = "https://query.wikidata.org/sparql";
const UA =
  "worldmap-history-atlas/0.1 (https://github.com/ishandogra101-ship-it/worldmap) import script";

export async function sparql(query, { retries = 4 } = {}) {
  const url = `${ENDPOINT}?format=json&query=${encodeURIComponent(query)}`;
  let attempt = 0;
  for (;;) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/sparql-results+json", "User-Agent": UA },
      });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 180)}`);
      const json = await res.json();
      return json.results.bindings;
    } catch (err) {
      attempt++;
      if (attempt > retries) throw err;
      const wait = 2000 * 2 ** (attempt - 1);
      console.warn(`  sparql retry ${attempt}/${retries} in ${wait}ms (${err.message})`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

export const val = (b, k) => (b[k] ? b[k].value : undefined);

// Sitelink count -> 0..100 on a log scale, so a handful of marquee names top out
// near 100 while the long tail spreads across the low-middle range. Labelled in
// the UI as a fame proxy, not a measured importance.
export function prominenceFromSitelinks(s) {
  const n = Number(s) || 0;
  return Math.max(3, Math.min(100, Math.round((100 * Math.log(n + 1)) / Math.log(350))));
}

// Wikidata stores years in astronomical numbering (year 0 = 1 BCE). Convert to the
// "negative = BCE" convention the app uses (e.g. ISO -0322 -> 323 BCE -> -323).
export function parseYear(iso) {
  if (!iso) return null;
  const m = /^(-?\d+)/.exec(iso);
  if (!m) return null;
  const isoYear = parseInt(m[1], 10);
  return isoYear <= 0 ? isoYear - 1 : isoYear;
}

// "Point(lng lat)" -> {lng, lat}
export function parsePoint(wkt) {
  if (!wkt) return null;
  const m = /Point\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/.exec(wkt);
  if (!m) return null;
  return { lng: parseFloat(m[1]), lat: parseFloat(m[2]) };
}

export const qid = (uri) => (uri ? uri.replace(/^.*\/(Q\d+)$/, "$1") : undefined);
