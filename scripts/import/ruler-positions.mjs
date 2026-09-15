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

export async function rulerPositions({ minSitelinks = 25, cap = 1500 } = {}) {
  // Two queries, not one UNION with a LIMIT on it. A limit applies to the whole
  // result set, so the head of state closure — which alone runs to thousands —
  // filled the quota and the name sweep never contributed a row. Genghis Khan
  // and Mansa Musa stayed missing through a run that was supposed to find them.
  const ask = async (label, where, limit) => {
    try {
      const { rows, ms } = await sparql(
        `SELECT DISTINCT ?pos WHERE { ${where} } LIMIT ${limit}`,
        { label, retries: 2 },
      );
      const ids = rows.map((r) => qid(val(r, "pos"))).filter(Boolean);
      console.log(`  ${label}: ${ids.length} positions in ${ms}ms`);
      return ids;
    } catch (err) {
      console.warn(`  ${label} failed: ${err.message}`);
      return [];
    }
  };

  const [heads, named] = await Promise.all([
    ask("head of state closure", "?pos wdt:P279* wd:Q48352 .", cap),
    ask(
      "positions named as ruling",
      `?holder wdt:P31 wd:Q5 ; p:P39/ps:P39 ?pos ; wikibase:sitelinks ?s .
       FILTER(?s >= ${minSitelinks})
       ?pos rdfs:label ?l . FILTER(LANG(?l) = "en")
       FILTER(REGEX(?l, "\\\\b(${RULER_WORDS})\\\\b", "i"))`,
      cap,
    ),
  ]);

  const out = [...new Set([...heads, ...named])];
  if (out.length === 0) {
    console.warn("  no positions resolved; falling back to the inline closure");
    return null;
  }
  console.log(`  ruler positions: ${out.length} total (${named.length} from the name sweep)`);
  return out;
}
