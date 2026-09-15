import { sparql, val, qid } from "./sparql.mjs";

/**
 * The set of P39 positions that count as ruling something.
 *
 * "Subclass of monarch" looked like the obvious test and quietly lost most of
 * the world. A probe against people the import demonstrably missed showed why:
 *
 *   Genghis Khan   Khagan of the Mongol Empire   not a monarch, not a head of state
 *   Mansa Musa     Mansa                         not a monarch, not a head of state
 *   Mehmed II      sultan of the Ottoman Empire  not a monarch, IS a head of state
 *
 * Wikidata's class hierarchy is uneven in ways that track which traditions
 * editors have modelled most carefully, so leaning on it alone builds that
 * unevenness straight into the atlas. Two sources are used instead: the head of
 * state closure, which is both broader and better maintained than monarch, and
 * an explicit sweep for positions whose own name says they rule — which is what
 * recovers the Khaganate and the Mansas.
 *
 * The name sweep is deliberately anchored: only positions actually held by
 * someone the record documents, so it returns offices rather than every string
 * in Wikidata containing the word "king".
 */
const RULER_WORDS =
  "emperor|empress|king|queen|sultan|sultana|khan|khagan|khagan|shah|shahanshah|tsar|czar|"
  + "tsarina|pharaoh|caliph|emir|amir|mansa|negus|inca|sapa|monarch|doge|dux|archon|"
  + "hegemon|maharaja|raja|rani|nizam|peshwa|shogun|daimyo|chief|paramount";

export async function rulerPositions({ minSitelinks = 15, cap = 2000 } = {}) {
  const { rows, ms } = await sparql(
    `SELECT DISTINCT ?pos WHERE {
       {
         ?pos wdt:P279* wd:Q48352 .
       } UNION {
         ?holder wdt:P31 wd:Q5 ; p:P39/ps:P39 ?pos ; wikibase:sitelinks ?s .
         FILTER(?s >= ${minSitelinks})
         ?pos rdfs:label ?l . FILTER(LANG(?l) = "en")
         FILTER(REGEX(?l, "\\\\b(${RULER_WORDS})\\\\b", "i"))
       }
     }`,
    { label: "ruler positions", retries: 2 },
  );
  const out = [...new Set(rows.map((r) => qid(val(r, "pos"))).filter(Boolean))];
  console.log(`  ruler positions: ${out.length} in ${ms}ms`);
  if (out.length > cap) {
    console.warn(`  over the ${cap} cap; falling back to the head of state closure alone`);
    return null; // caller keeps the inline P279* form
  }
  return out;
}
