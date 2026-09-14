import { sparql, val, qid, parseYear, parsePoint, prominenceFromSitelinks } from "./sparql.mjs";

// Wikidata's modelling of "events" is looser than people, so this layer is the
// least complete by design. We pull a few well-defined types with a date and a
// location and keep the most-linked.
const TYPES = {
  Q198: "war",
  Q178561: "battle",
  Q188055: "battle", // siege
  Q131569: "treaty",
  Q10931: "war", // revolution -> shown with the war glyph
  Q1190554: "discovery", // occurrence/discovery-ish; kept broad, filtered by sitelinks
};

const query = (typeQid) => `
SELECT ?event ?eventLabel ?date ?start ?end ?coord ?sitelinks WHERE {
  ?event wdt:P31/wdt:P279* wd:${typeQid} ;
         wikibase:sitelinks ?sitelinks .
  FILTER(?sitelinks >= 14)
  OPTIONAL { ?event wdt:P585 ?date. }
  OPTIONAL { ?event wdt:P580 ?start. }
  OPTIONAL { ?event wdt:P582 ?end. }
  OPTIONAL { ?event wdt:P625 ?c1. }
  OPTIONAL { ?event wdt:P276 ?loc. ?loc wdt:P625 ?c2. }
  BIND(COALESCE(?c1, ?c2) AS ?coord)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
ORDER BY DESC(?sitelinks)
LIMIT 700`;

export async function fetchEvents() {
  const byId = new Map();
  for (const [type, category] of Object.entries(TYPES)) {
    const rows = await sparql(query(type));
    for (const b of rows) {
      const id = qid(val(b, "event"));
      if (!id) continue;
      const pt = parsePoint(val(b, "coord"));
      if (!pt) continue;
      const year = parseYear(val(b, "date")) ?? parseYear(val(b, "start"));
      if (year === null) continue;
      const end = parseYear(val(b, "end")) ?? year;
      if (byId.has(id)) continue;
      byId.set(id, {
        id,
        kind: "event",
        name: val(b, "eventLabel") || id,
        category,
        startYear: year,
        endYear: end,
        lng: pt.lng,
        lat: pt.lat,
        prominence: prominenceFromSitelinks(val(b, "sitelinks")),
        source: `https://www.wikidata.org/wiki/${id}`,
      });
    }
    console.log(`  events after ${category} (${type}): total ${byId.size}`);
  }
  return [...byId.values()];
}
