import { sparql, val, qid } from "./sparql.mjs";
import { WATCHLIST, spellingsOf } from "./watchlist.mjs";
import { chunked } from "./chunks.mjs";
import { mappedRealms } from "./mapped-realms.mjs";

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
  "emperor|empress|king|queen|sultan|sultana|khan|khagan|shah|shahanshah|padishah|tsar|"
  + "czar|tsarina|pharaoh|caliph|emir|amir|mansa|negus|inca|sapa inca|monarch|doge|dux|"
  + "archon|hegemon|maharaja|maharana|raja|rani|nizam|peshwa|shogun|daimyo|"
  + "paramount chief|high chief|princely|sovereign|regnant";

/**
 * Words that make a position sound like rule without being it.
 *
 * "chief" alone dragged in chief executives and chiefs of staff, which would
 * have put company founders on a map of who governed what. The exclusion runs
 * after the title match, so a genuine paramount chief still passes.
 */
const NOT_RULING =
  "executive officer|chief of staff|editor|justice|prosecut|constable|"
  + "chief minister|police|scout|fire chief|chief engineer|chief scientist";

export async function rulerPositions({ cap = 4000 } = {}) {
  const ask = async (label, query) => {
    try {
      const { rows, ms } = await sparql(query, { label, retries: 2 });
      const ids = rows.map((r) => qid(val(r, "pos"))).filter(Boolean);
      console.log(`  ${label}: ${ids.length} positions in ${ms}ms`);
      return ids;
    } catch (err) {
      console.warn(`  ${label} failed: ${err.message}`);
      return [];
    }
  };

  // Every accepted spelling, not just the one this project happens to use.
  // The seed matches Wikidata's English label exactly, and Wikidata calls
  // Sundiata "Sunjata Keïta" — so seeding on our spelling alone asked for a
  // label that is not there and quietly contributed nothing for that person.
  const names = WATCHLIST.rulers
    .flatMap((n) => spellingsOf(n))
    .map((n) => `"${n}"@en`)
    .join(" ");

  const [heads, named, seeded] = await Promise.all([
    ask("head of state closure",
      `SELECT DISTINCT ?pos WHERE { ?pos wdt:P279* wd:Q48352 . } LIMIT ${cap}`),

    // Regex over the positions themselves. Going through their holders meant
    // scanning every human with any P39 statement before the filter could bite,
    // and the endpoint answered 502 in seven seconds. There are far fewer
    // offices than officeholders.
    ask("positions named as ruling",
      `SELECT DISTINCT ?pos WHERE {
         ?pos wdt:P31/wdt:P279* wd:Q4164871 ; rdfs:label ?l .
         FILTER(LANG(?l) = "en")
         FILTER(REGEX(?l, "\\\\b(${RULER_WORDS})\\\\b", "i"))
         FILTER(!REGEX(?l, "(${NOT_RULING})", "i"))
       } LIMIT ${cap}`),

    // Whatever office the watchlist actually held. Small, exact, and the only
    // branch that cannot quietly return nothing without it being obvious.
    ask("positions held by the watchlist",
      `SELECT DISTINCT ?pos WHERE {
         VALUES ?n { ${names} }
         ?person rdfs:label ?n ; wdt:P31 wd:Q5 ; p:P39/ps:P39 ?pos .
       }`),
  ]);

  /**
   * Positions whose jurisdiction is a realm the map draws.
   *
   * The closure and the title regex both ask Wikidata to describe itself. This
   * asks the other half of the atlas instead: here are 2,857 names the border
   * layer puts on screen, which of them does Wikidata know an office for. It is
   * the branch that reaches a realm like the Timurid Empire — drawn across
   * Central Asia for a century and a half, and represented in the ruler layer
   * by Timur and nobody after him.
   *
   * Chunked because the VALUES block cannot hold 2,857 literals, and tolerant
   * of a chunk failing: a query that dies takes its own 200 names down and
   * leaves the rest.
   */
  const realms = await mappedRealms();
  const fromMap = [];
  try {
    await chunked({
      items: realms,
      size: 200,
      label: "positions over realms the map draws",
      build: (chunk) => `
        SELECT DISTINCT ?pos WHERE {
          VALUES ?realmName { ${chunk.map((n) => `"${n}"@en`).join(" ")} }
          ?realm rdfs:label ?realmName .
          ?pos wdt:P1001 ?realm .
        }`,
      onRows(rows) {
        for (const r of rows) {
          const id = qid(val(r, "pos"));
          if (id) fromMap.push(id);
        }
      },
    });
  } catch (err) {
    console.warn(`  realm-jurisdiction sweep failed: ${err.message}`);
  }
  console.log(`  positions over mapped realms: ${new Set(fromMap).size} from ${realms.length} names`);

  const out = [...new Set([...heads, ...named, ...seeded, ...fromMap])];
  if (out.length === 0) {
    console.warn("  no positions resolved; falling back to the inline closure");
    return null;
  }
  console.log(
    `  ruler positions: ${out.length} total `
    + `(${named.length} by title, ${seeded.length} from the watchlist, `
    + `${new Set(fromMap).size} from realms the map draws)`,
  );
  return out;
}
