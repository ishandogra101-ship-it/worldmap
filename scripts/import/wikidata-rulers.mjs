import { val, qid, parseYear, parsePoint, prominenceFromSitelinks } from "./sparql.mjs";
import { windowed, dt } from "./windows.mjs";
import { rulerPositions } from "./ruler-positions.mjs";

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
 * The sitelink floor keeps the result to people at least one reference work has
 * written about, and is the same number that later decides at what zoom a
 * marker appears. It sits low because nothing obscure reaches a crowded screen
 * anyway: the level-of-detail system hides it until someone zooms to the region
 * and asks. Raising it buys no legibility and costs whole traditions.
 */
const MIN_SITELINKS = 4;

const build = (positions) => (a, b) => `
SELECT ?person ?personLabel ?start ?end ?capcoord ?realmcoord ?ctrycoord ?bpcoord ?dpcoord ?realmLabel ?posLabel ?image ?sitelinks WHERE {
  ${positions ? `VALUES ?pos { ${positions.map((q) => `wd:${q}`).join(" ")} }` : ""}
  ?person wdt:P31 wd:Q5 ; p:P39 ?st .
  ?st ps:P39 ?pos ; pq:P580 ?start .
  ${positions ? "" : "?pos wdt:P279* wd:Q48352 ."}
  FILTER(?start >= ${dt(a)} && ?start < ${dt(b)})
  ?person wikibase:sitelinks ?sitelinks . FILTER(?sitelinks >= ${MIN_SITELINKS})
  OPTIONAL { ?st pq:P582 ?end. }
  OPTIONAL { ?pos wdt:P1001 ?realm. ?realm wdt:P36 ?cap. ?cap wdt:P625 ?capcoord. }
  OPTIONAL { ?pos wdt:P1001 ?r1. ?r1 wdt:P625 ?realmcoord. }
  OPTIONAL { ?pos wdt:P1001 ?r2. ?r2 rdfs:label ?realmLabel. FILTER(LANG(?realmLabel)="en") }
  # A third of rulers had no realm at all, because P1001 is often absent and it
  # was the only thing asked. The office names the realm in most cases anyway —
  # "King of France", "Emir of the Timurid Empire" — so take that where the
  # jurisdiction is missing rather than leaving the record unable to say what
  # the person ruled.
  OPTIONAL { ?pos rdfs:label ?posLabel. FILTER(LANG(?posLabel)="en") }
  OPTIONAL { ?person wdt:P27 ?ctry. ?ctry wdt:P36 ?ccap. ?ccap wdt:P625 ?ctrycoord. }
  OPTIONAL { ?person wdt:P19 ?bp. ?bp wdt:P625 ?bpcoord. }
  OPTIONAL { ?person wdt:P20 ?dp. ?dp wdt:P625 ?dpcoord. }
  OPTIONAL { ?person wdt:P18 ?image. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;

/**
 * What this person ruled.
 *
 * The position's jurisdiction if Wikidata records one, otherwise the realm read
 * out of the office's own name. "King of France" and "Emperor of the Ming
 * dynasty" name their realm in the title; a bare office like "monarch" does
 * not, and is left blank rather than filled with a word that says nothing.
 */
const OF_A_REALM = /\b(?:of|de|von|van)\s+(?:the\s+)?(.+)$/i;

function realmOf(r) {
  const jurisdiction = val(r, "realmLabel");
  if (jurisdiction) return jurisdiction;
  const office = val(r, "posLabel");
  if (!office) return undefined;
  const m = OF_A_REALM.exec(office);
  if (!m) return undefined;
  const realm = m[1].trim();
  // "King of Kings" and the like name a style, not a place
  if (/^(kings?|queens?|emperors?|state|the\s|arms)\b/i.test(realm)) return undefined;
  return realm.length >= 3 ? realm : undefined;
}

export async function fetchRulers({ from = -3000, to = 2026, step = 100 } = {}) {
  const positions = await rulerPositions();
  const byId = new Map();
  let noPlace = 0, noDate = 0;

  await windowed({
    from, to, step, label: "rulers", build: build(positions),
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
        // A reign with no recorded end gets a conventional span so its marker has
        // something to be drawn across. That span is invented, so it is flagged
        // and every surface that shows a date range says so. Running to 2026
        // instead would be a different invention and a louder one.
        const recordedEnd = parseYear(val(r, "end"));
        const end = recordedEnd ?? start + 25;
        const prev = byId.get(id);
        if (prev) {
          // one person, several reigns: widen the span, keep the first placement
          prev.startYear = Math.min(prev.startYear, start);
          prev.endYear = Math.max(prev.endYear, Math.max(end, start));
          // one recorded end anywhere in the reigns makes the span real
          if (recordedEnd !== null) delete prev.endEstimated;
          if (!prev.category) prev.category = realmOf(r);
          continue;
        }
        byId.set(id, {
          id,
          kind: "ruler",
          name: val(r, "personLabel") || id,
          category: realmOf(r),
          startYear: start,
          endYear: Math.max(end, start),
          ...(recordedEnd === null ? { endEstimated: true } : {}),
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
