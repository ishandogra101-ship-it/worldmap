import { val, qid, parseYear, parsePoint, prominenceFromSitelinks } from "./sparql.mjs";
import { chunked } from "./chunks.mjs";
import { expandSubclasses } from "./expand-types.mjs";

/**
 * Battles, treaties and the like.
 *
 * This is the thinnest of the three layers and will stay that way. Wikidata
 * models an event far more loosely than a person: many have no coordinate, many
 * no single date, and the type hierarchy is inconsistent. The app says as much
 * rather than implying the event layer is a record of what happened.
 *
 * "Occurrence" (Q1190554) is deliberately not a root here. It sits so high in
 * the hierarchy that its closure is most of Wikidata, which is the opposite of
 * selective.
 */
const MIN_SITELINKS = 18;

const ROOT_FIELD = {
  Q178561: "battle",     // battle
  Q198: "battle",        // war
  Q625298: "treaty",     // peace treaty
  Q131569: "treaty",     // treaty
  Q10931: "revolution",  // revolution
  Q3199915: "battle",    // siege
};

// P585 (point in time) or P580 (start time) — an event with neither is unusable.
//
// No date filter: it cannot be pushed down past the UNION, so asking for one
// costs a full scan and saves nothing. Dates are applied after the rows arrive.
const build = (types) => `
SELECT ?e ?eLabel ?type ?when ?coord ?sitelinks WHERE {
  VALUES ?type { ${types.map((q) => `wd:${q}`).join(" ")} }
  ?e wdt:P31 ?type ; wdt:P625 ?coord ; wikibase:sitelinks ?sitelinks .
  { ?e wdt:P585 ?when. } UNION { ?e wdt:P580 ?when. }
  FILTER(?sitelinks >= ${MIN_SITELINKS})
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;

export async function fetchEvents({ from = -3000, to = 2026 } = {}) {
  const roots = Object.keys(ROOT_FIELD);
  const types = await expandSubclasses(roots);

  // A subclass inherits the field of whichever root it descended from; the
  // closure query loses that, so anything outside the roots falls back to the
  // generic glyph rather than being assigned a category it may not deserve.
  const field = (q) => ROOT_FIELD[q] || "event";

  const byId = new Map();
  let outOfRange = 0;
  await chunked({
    items: types, size: 24, label: "events", build,
    onRows(rows) {
      for (const r of rows) {
        const id = qid(val(r, "e"));
        if (!id || byId.has(id)) continue;
        const year = parseYear(val(r, "when"));
        if (year === null) continue;
        if (year < from || year > to) { outOfRange++; continue; }
        const pt = parsePoint(val(r, "coord"));
        if (!pt) continue;
        byId.set(id, {
          id,
          kind: "event",
          name: val(r, "eLabel") || id,
          category: field(qid(val(r, "type"))),
          startYear: year,
          endYear: year,
          lng: pt.lng,
          lat: pt.lat,
          prominence: prominenceFromSitelinks(val(r, "sitelinks")),
        });
      }
    },
  });

  console.log(`  events: ${byId.size} kept, ${outOfRange} outside the atlas range`);
  return [...byId.values()];
}
