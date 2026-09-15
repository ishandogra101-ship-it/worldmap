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

const FIELD = {
  Q178561: "battle",     // battle
  Q198: "battle",        // war
  Q625298: "treaty",     // peace treaty
  Q131569: "treaty",     // treaty
  Q10931: "revolution",  // revolution
  Q1190554: "event",     // occurrence
};

const VALUES = Object.keys(FIELD).map((q) => `wd:${q}`).join(" ");

// P585 (point in time) or P580 (start time) — an event with neither is unusable.
// The types are bound together for the same reason the occupations are: one
// sweep of the whole range instead of one per type. The subclass closure stays,
// because without it a naval battle is not a battle and most of the layer
// disappears; it makes each window heavier, which is what the splitter is for.
const build = (a, b) => `
SELECT ?e ?eLabel ?type ?when ?coord ?sitelinks WHERE {
  VALUES ?type { ${VALUES} }
  ?e wdt:P31/wdt:P279* ?type ; wdt:P625 ?coord ; wikibase:sitelinks ?sitelinks .
  { ?e wdt:P585 ?when. } UNION { ?e wdt:P580 ?when. }
  FILTER(?when >= ${dt(a)} && ?when < ${dt(b)})
  FILTER(?sitelinks >= ${MIN_SITELINKS})
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;

export async function fetchEvents({ from = -3000, to = 2026, step = 50 } = {}) {
  const byId = new Map();

  await windowed({
    from, to, step, label: "events", build,
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
          category: FIELD[qid(val(r, "type"))] || "event",
          startYear: year,
          endYear: year,
          lng: pt.lng,
          lat: pt.lat,
          prominence: prominenceFromSitelinks(val(r, "sitelinks")),
        });
      }
    },
  });

  console.log(`  events: ${byId.size} kept`);
  return [...byId.values()];
}
