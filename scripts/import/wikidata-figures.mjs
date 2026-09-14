import { sparql, val, qid, parseYear, parsePoint, prominenceFromSitelinks } from "./sparql.mjs";

// Occupation QID -> the app's field category (drives the marker glyph). Each is
// matched via P106/P279* so sub-occupations (e.g. "theoretical physicist") count.
const OCCUPATIONS = {
  Q1028181: "art", // painter
  Q1281618: "art", // sculptor
  Q483501: "art", // artist
  Q901: "science", // scientist
  Q169470: "science", // physicist
  Q593644: "science", // chemist
  Q864503: "science", // biologist
  Q11063: "science", // astronomer
  Q4964182: "philosophy", // philosopher
  Q36180: "literature", // writer
  Q49757: "literature", // poet
  Q214917: "music", // composer
  Q170790: "math", // mathematician
  Q205375: "invention", // inventor
  Q11900058: "invention", // engineer
  Q11631: "exploration", // explorer / astronaut? (explorer is Q11900105)
  Q11900105: "exploration", // explorer
  Q39631: "medicine", // physician
};

const query = (occQid, fromY, toY) => `
SELECT ?person ?personLabel ?birth ?death ?coord ?image ?sitelinks WHERE {
  ?person wdt:P31 wd:Q5 ; wdt:P106/wdt:P279* wd:${occQid} ;
          wdt:P569 ?birth ;
          wikibase:sitelinks ?sitelinks .
  FILTER(YEAR(?birth) >= ${fromY} && YEAR(?birth) < ${toY})
  FILTER(?sitelinks >= 22)
  OPTIONAL { ?person wdt:P570 ?death. }
  OPTIONAL { ?person wdt:P19 ?bp. ?bp wdt:P625 ?coord. }
  OPTIONAL { ?person wdt:P18 ?image. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
ORDER BY DESC(?sitelinks)
LIMIT 900`;

export async function fetchFigures() {
  const byId = new Map();
  for (const [occ, field] of Object.entries(OCCUPATIONS)) {
    for (let y = -800; y < 2010; y += 200) {
      const rows = await sparql(query(occ, y, y + 200));
      for (const b of rows) {
        const id = qid(val(b, "person"));
        if (!id) continue;
        const pt = parsePoint(val(b, "coord"));
        if (!pt) continue;
        const birth = parseYear(val(b, "birth"));
        if (birth === null) continue;
        const death = parseYear(val(b, "death")) ?? birth + 72;
        if (byId.has(id)) continue; // first (most-linked) occupation wins the glyph
        byId.set(id, {
          id,
          kind: "figure",
          name: val(b, "personLabel") || id,
          category: field,
          startYear: birth,
          endYear: death,
          lng: pt.lng,
          lat: pt.lat,
          prominence: prominenceFromSitelinks(val(b, "sitelinks")),
          image: val(b, "image"),
          source: `https://www.wikidata.org/wiki/${id}`,
        });
      }
    }
    console.log(`  figures after ${field} (${occ}): total ${byId.size}`);
  }
  return [...byId.values()];
}
