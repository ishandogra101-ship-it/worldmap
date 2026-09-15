// Minimal Wikidata SPARQL client with polite headers, POST, and retry/backoff.
//
// query.wikidata.org is blocked by network policy in some managed environments
// (including the one this repo is usually edited from), which is why the import
// runs in GitHub Actions — see .github/workflows/import.yml.

const ENDPOINT = "https://query.wikidata.org/sparql";
const UA =
  "worldmap-history-atlas/0.1 (https://github.com/ishandogra101-ship-it/worldmap) import script";

/** WDQS caps a query at 60s; leave room to notice it rather than hang. */
const TIMEOUT_MS = 90_000;

export class SparqlTimeout extends Error {}

export async function sparql(query, { retries = 3, label = "" } = {}) {
  let attempt = 0;
  for (;;) {
    const started = Date.now();
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      // POST: these queries are far past a comfortable URL length.
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          Accept: "application/sparql-results+json",
          "Content-Type": "application/sparql-query",
          "User-Agent": UA,
        },
        body: query,
        signal: ctl.signal,
      });
      const ms = Date.now() - started;
      if (res.status === 429) {
        const wait = Number(res.headers.get("retry-after") || 30) * 1000;
        throw Object.assign(new Error(`HTTP 429, retry-after ${wait}ms`), { wait });
      }
      if (res.status >= 500) throw new Error(`HTTP ${res.status} after ${ms}ms`);
      if (!res.ok) {
        const body = (await res.text()).slice(0, 400);
        // WDQS reports its own timeout as 400 with a QueryTimeoutException
        if (/TimeoutException|QueryTimeout/i.test(body)) {
          throw new SparqlTimeout(`query timed out after ${ms}ms${label ? ` (${label})` : ""}`);
        }
        throw new Error(`HTTP ${res.status}: ${body}`);
      }
      const json = await res.json();
      return { rows: json.results.bindings, ms };
    } catch (err) {
      if (err.name === "AbortError") {
        const e = new SparqlTimeout(`aborted after ${TIMEOUT_MS}ms${label ? ` (${label})` : ""}`);
        if (attempt >= retries) throw e;
        err.message = e.message;
      }
      // A query that is simply too heavy will not get lighter on a retry.
      if (err instanceof SparqlTimeout) throw err;
      attempt++;
      if (attempt > retries) throw err;
      const wait = err.wait ?? 3000 * 2 ** (attempt - 1);
      console.warn(`    retry ${attempt}/${retries} in ${wait}ms — ${err.message}`);
      await new Promise((r) => setTimeout(r, wait));
    } finally {
      clearTimeout(timer);
    }
  }
}

export const val = (b, k) => (b[k] ? b[k].value : undefined);
export const qid = (uri) => (uri ? uri.replace(/^.*\/(Q\d+)$/, "$1") : undefined);

// Sitelink count -> 0..100 on a log scale, so a handful of marquee names top out
// near 100 while the long tail spreads across the low-middle range. Labelled in
// the UI as a reference-count proxy, never as importance.
export function prominenceFromSitelinks(s) {
  const n = Number(s) || 0;
  return Math.max(3, Math.min(100, Math.round((100 * Math.log(n + 1)) / Math.log(350))));
}

/**
 * Wikidata time literals to the app's convention (negative = BCE, no year zero).
 *
 * Wikibase RDF writes BCE years with astronomical numbering, where 0000 is 1 BCE
 * and -0322 is 323 BCE. The probe checks this against known entities before any
 * real import runs, because a silent off-by-one would misdate every BCE record.
 */
export function parseYear(iso) {
  if (!iso) return null;
  const m = /^(-?\d+)/.exec(iso);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  if (!Number.isFinite(y)) return null;
  return y <= 0 ? y - 1 : y;
}

// "Point(lng lat)" -> {lng, lat}
export function parsePoint(wkt) {
  if (!wkt) return null;
  const m = /Point\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/.exec(wkt);
  if (!m) return null;
  const lng = parseFloat(m[1]);
  const lat = parseFloat(m[2]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lng, lat };
}
