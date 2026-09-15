import { val, qid, parseYear, parsePoint, prominenceFromSitelinks } from "./sparql.mjs";
import { windowed, dt } from "./windows.mjs";

/**
 * People who held a position that is a kind of monarch (Q116) — kings, emperors,
 * sultans, pharaohs, tsars, caliphs and so on.
 *
 * Placement walks a chain, best first: the capital of the realm the position
 * applies to, then that realm's own coordinates, then the capital of the
 * ruler's country of citizenship, then their birthplace, then their place of
 * death. The probe found the first link alone misses whole dynasties — neither
 * Ming emperor in a sample of forty had one — while a ruler with nothing in the
 * chain is dropped rather than guessed at. A marker in the wrong place is worse
 * than no marker.
 *
 * The sitelink floor is what keeps the result to people at least one reference
 * work has written about, and it is the same number that later decides at what
 * zoom the marker appears.
 */
const MIN_SITELINKS = 8;

const build = (a, b) => `
SELECT ?person ?personLabel ?start ?end ?capcoord ?realmcoord ?ctrycoord ?bpcoord ?dpcoord ?realmLabel ?image ?sitelinks WHERE {
  ?person wdt:P31 wd:Q5 ; p:P39 ?st .
  ?st ps:P39 ?pos ; pq:P580 ?start .
  ?pos wdt:P279* wd:Q116 .
  FILTER(?start >= ${dt(a)} && ?start < ${dt(b)})
  ?person wikibase:sitelinks ?sitelinks . FILTER(?sitelinks >= ${MIN_SITELINKS})
  OPTIONAL { ?st pq:P582 ?end. }
  OPTIONAL { ?pos wdt:P1001 ?realm. ?realm wdt:P36 ?cap. ?cap wdt:P625 ?capcoord. }
  OPTIONAL { ?pos wdt:P1001 ?r1. ?r1 wdt:P625 ?realmcoord. }
  OPTIONAL { ?pos wdt:P1001 ?r2. ?r2 rdfs:label ?realmLabel. FILTER(LANG(?realmLabel)="en") }
  OPTIONAL { ?person wdt:P27 ?ctry. ?ctry wdt:P36 ?ccap. ?ccap wdt:P625 ?ctrycoord. }
  OPTIONAL { ?person wdt:P19 ?bp. ?bp wdt:P625 ?bpcoord. }
  OPTIONAL { ?person wdt:P20 ?dp. ?dp wdt:P625 ?dpcoord. }
  OPTIONAL { ?person wdt:P18 ?image. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;

export async function fetchRulers({ from = -3000, to = 2026, step = 100 } = {}) {
  const byId = new Map();
  let noPlace = 0, noDate = 0;

  await windowed({
    from, to, step, label: "rulers", build,
    onRows(rows) {
      for (const r of rows) {
        const id = qid(val(r, "person"));
        if (!id) continue;
        const start = parseYear(val(r, "start"));
        if (start === null) { noDate++; continue; }
        const pt =
          parsePoint(val(r, "capcoord")) ||
          parsePoint(val(r, "realmcoord")) ||
          parsePoint(val(r, "ctrycoord")) ||
          parsePoint(val(r, "bpcoord")) ||
          parsePoint(val(r, "dpcoord"));
        if (!pt) { noPlace++; continue; }
        // an open-ended reign gets a conventional span rather than running to 2026
        const end = parseYear(val(r, "end")) ?? start + 25;
        const prev = byId.get(id);
        if (prev) {
          // one person, several reigns: widen the span, keep the first placement
          prev.startYear = Math.min(prev.startYear, start);
          prev.endYear = Math.max(prev.endYear, Math.max(end, start));
          if (!prev.category && val(r, "realmLabel")) prev.category = val(r, "realmLabel");
          continue;
        }
        byId.set(id, {
          id,
          kind: "ruler",
          name: val(r, "personLabel") || id,
          category: val(r, "realmLabel") || undefined,
          startYear: start,
          endYear: Math.max(end, start),
          lng: pt.lng,
          lat: pt.lat,
          prominence: prominenceFromSitelinks(val(r, "sitelinks")),
          image: val(r, "image"),
        });
      }
    },
  });

  console.log(`  rulers: ${byId.size} kept, ${noPlace} dropped for no coordinate, ${noDate} for no date`);
  return [...byId.values()];
}
