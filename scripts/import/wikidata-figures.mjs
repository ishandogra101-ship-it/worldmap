import { val, qid, parseYear, parsePoint, prominenceFromSitelinks } from "./sparql.mjs";
import { chunked } from "./chunks.mjs";

/**
 * Thinkers, makers and explorers, placed at their birthplace.
 *
 * Birthplace is a compromise and the app should not pretend otherwise: Leonardo
 * appears at Vinci, not wherever he was working in the year you are looking at.
 * It is the one location Wikidata records consistently for a person, and a
 * lifetime is the span the marker is shown across.
 *
 * Chunked by occupation rather than by date, for the reason the events layer
 * found the hard way: the cost here is the scan over everyone holding these
 * occupations, and a date filter does not reduce it. Windowing by century spent
 * forty to sixty seconds per window whether the window held four people or
 * three hundred, and timed out at 1250 CE with two thirds of the range unread.
 * Chunking along P106, which is indexed, asks for something the endpoint can
 * look up. Dates are applied after the rows arrive, where they are free.
 *
 * The sitelink floor sits low for the same reason it does for rulers: the
 * level-of-detail system decides what reaches a crowded screen, so a high floor
 * buys no legibility and costs coverage where documentation is thinnest.
 *
 * Occupations are matched exactly rather than through P279*, because the
 * subclass closure under "scientist" or "artist" is enormous and on its own
 * drags the query past the endpoint's time budget.
 */
const MIN_SITELINKS = 14;

const FIELD = {
  Q1028181: "art",          // painter
  Q1281618: "art",          // sculptor
  Q42973: "art",            // architect
  Q901: "science",          // scientist
  Q169470: "science",       // physicist
  Q593644: "science",       // chemist
  Q864503: "science",       // biologist
  Q11063: "science",        // astronomer
  Q4964182: "philosophy",   // philosopher
  Q36180: "literature",     // writer
  Q49757: "literature",     // poet
  Q214917: "music",         // composer
  Q170790: "math",          // mathematician
  Q205375: "invention",     // inventor
  Q81096: "invention",      // engineer
  Q11900105: "exploration", // explorer
  Q39631: "medicine",       // physician
};

const build = (occs) => `
SELECT ?person ?personLabel ?occ ?birth ?death ?coord ?image ?sitelinks WHERE {
  VALUES ?occ { ${occs.map((q) => `wd:${q}`).join(" ")} }
  ?person wdt:P106 ?occ ; wdt:P569 ?birth ; wdt:P19 ?bp ;
          wikibase:sitelinks ?sitelinks .
  ?bp wdt:P625 ?coord .
  FILTER(?sitelinks >= ${MIN_SITELINKS})
  OPTIONAL { ?person wdt:P570 ?death. }
  OPTIONAL { ?person wdt:P18 ?image. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;

export async function fetchFigures({ from = -3000, to = 2026 } = {}) {
  const byId = new Map();
  let noPlace = 0, outOfRange = 0;

  await chunked({
    items: Object.keys(FIELD), size: 2, label: "figures", build,
    onRows(rows) {
      for (const r of rows) {
        const id = qid(val(r, "person"));
        if (!id || byId.has(id)) continue; // first occupation seen wins the glyph
        const birth = parseYear(val(r, "birth"));
        if (birth === null) continue;
        if (birth < from || birth > to) { outOfRange++; continue; }
        const pt = parsePoint(val(r, "coord"));
        if (!pt) { noPlace++; continue; }
        const death = parseYear(val(r, "death"));
        byId.set(id, {
          id,
          kind: "figure",
          name: val(r, "personLabel") || id,
          category: FIELD[qid(val(r, "occ"))] || "science",
          startYear: birth,
          // someone still living gets a span, not an end date the data lacks
          endYear: death !== null && death >= birth ? death : birth + 72,
          lng: pt.lng,
          lat: pt.lat,
          prominence: prominenceFromSitelinks(val(r, "sitelinks")),
          image: val(r, "image"),
        });
      }
    },
  });

  console.log(
    `  figures: ${byId.size} kept, ${noPlace} dropped for no birthplace coordinate, `
    + `${outOfRange} outside the atlas range`,
  );
  return [...byId.values()];
}
