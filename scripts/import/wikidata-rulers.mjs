import { sparql, val, qid, parseYear, parsePoint, prominenceFromSitelinks } from "./sparql.mjs";

// People who held a position that is a kind of monarch (Q116) — kings, emperors,
// sultans, pharaohs, tsars, caliphs, etc. Chunked by reign-start century so no
// single query is too heavy for the public endpoint. Placement uses the realm's
// capital coordinates, falling back to the ruler's birthplace.
const query = (fromY, toY) => `
SELECT ?person ?personLabel ?start ?end ?capcoord ?bpcoord ?realmLabel ?image ?sitelinks WHERE {
  ?person wdt:P31 wd:Q5 ; p:P39 ?st .
  ?st ps:P39 ?pos .
  ?pos wdt:P279* wd:Q116 .
  ?st pq:P580 ?start .
  FILTER(YEAR(?start) >= ${fromY} && YEAR(?start) < ${toY})
  ?person wikibase:sitelinks ?sitelinks . FILTER(?sitelinks >= 6)
  OPTIONAL { ?st pq:P582 ?end. }
  OPTIONAL { ?pos wdt:P1001 ?realm. ?realm wdt:P36 ?cap. ?cap wdt:P625 ?capcoord. }
  OPTIONAL { ?person wdt:P19 ?bp. ?bp wdt:P625 ?bpcoord. }
  OPTIONAL { ?pos wdt:P1001 ?realm2. ?realm2 rdfs:label ?realmLabel FILTER(LANG(?realmLabel)="en") }
  OPTIONAL { ?person wdt:P18 ?image. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
ORDER BY DESC(?sitelinks)
LIMIT 2500`;

export async function fetchRulers() {
  const byId = new Map();
  for (let y = -1500; y < 2025; y += 100) {
    const rows = await sparql(query(y, y + 100));
    for (const b of rows) {
      const id = qid(val(b, "person"));
      if (!id) continue;
      const pt = parsePoint(val(b, "capcoord")) || parsePoint(val(b, "bpcoord"));
      if (!pt) continue; // no place -> can't map it
      const start = parseYear(val(b, "start"));
      if (start === null) continue;
      const end = parseYear(val(b, "end")) ?? start + 25;
      const existing = byId.get(id);
      if (existing) {
        // one person, several reigns: widen the span
        existing.startYear = Math.min(existing.startYear, start);
        existing.endYear = Math.max(existing.endYear, end);
        continue;
      }
      byId.set(id, {
        id,
        kind: "ruler",
        name: val(b, "personLabel") || id,
        category: val(b, "realmLabel") || undefined,
        startYear: start,
        endYear: end,
        lng: pt.lng,
        lat: pt.lat,
        prominence: prominenceFromSitelinks(val(b, "sitelinks")),
        image: val(b, "image"), // Commons URL; portraits step downloads it
        source: `https://www.wikidata.org/wiki/${id}`,
      });
    }
    console.log(`  rulers ${y}..${y + 100}: total ${byId.size}`);
  }
  return [...byId.values()];
}
