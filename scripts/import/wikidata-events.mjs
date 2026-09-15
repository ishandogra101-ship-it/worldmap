import { val, qid, parseYear, parsePoint, prominenceFromSitelinks } from "./sparql.mjs";
import { windowed, dt } from "./windows.mjs";

/**
 * Battles, treaties and the like.
 *
 * This is the thinnest of the three layers and will stay that way. Wikidata
 * models an event far more loosely than a person: many have no coordinate, many
 * no single date, and the type hierarchy is inconsistent. The app says as much
 * rather than implying the event layer is a complete record of what happened.
 */
const MIN_SITELINKS = 18;

const TYPES = [
  ["Q178561", "battle"],     // battle
  ["Q198", "battle"],        // war
  ["Q625298", "treaty"],     // peace treaty
  ["Q131569", "treaty"],     // treaty
  ["Q10931", "revolution"],  // revolution
  ["Q3199915", "event"],     // massacre  (kept for its dating, not for drama)
  ["Q1190554", "event"],     // occurrence
];

// P585 (point in time) or P580 (start time) — an event with neither is unusable.
const build = (type) => (a, b) => `
SELECT ?e ?eLabel ?when ?coord ?sitelinks WHERE {
  ?e wdt:P31/wdt:P279* wd:${type} ; wdt:P625 ?coord ;
     wikibase:sitelinks ?sitelinks .
  { ?e wdt:P585 ?when. } UNION { ?e wdt:P580 ?when. }
  FILTER(?when >= ${dt(a)} && ?when < ${dt(b)})
  FILTER(?sitelinks >= ${MIN_SITELINKS})
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;

export async function fetchEvents({ from = -3000, to = 2026, step = 100 } = {}) {
  const byId = new Map();

  for (const [type, category] of TYPES) {
    await windowed({
      from, to, step, label: `events/${category}`, build: build(type),
      onRows(rows) {
        for (const r of rows) {
          const id = qid(val(r, "e"));
          if (!id || byId.has(id)) continue;
          const year = parseYear(val(r, "when"));
          if (year === null) continue;
          const pt = parsePoint(val(r, "coord"));
          if (!pt) continue;
          byId.set(id, {
            id,
            kind: "event",
            name: val(r, "eLabel") || id,
            category,
            startYear: year,
            endYear: year,
            lng: pt.lng,
            lat: pt.lat,
            prominence: prominenceFromSitelinks(val(r, "sitelinks")),
            imported: true,
            source: `https://www.wikidata.org/wiki/${id}`,
          });
        }
      },
    });
    console.log(`  events after ${category}: ${byId.size} total`);
  }

  console.log(`  events: ${byId.size} kept`);
  return [...byId.values()];
}
