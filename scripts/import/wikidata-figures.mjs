import { val, qid, parseYear, parsePoint, prominenceFromSitelinks } from "./sparql.mjs";
import { windowed, dt } from "./windows.mjs";

/**
 * Thinkers, makers and explorers, placed at their birthplace.
 *
 * Birthplace is a compromise and the app should not pretend otherwise: Leonardo
 * appears at Vinci, not wherever he was working in the year you are looking at.
 * It is the one location Wikidata records consistently for a person, and a
 * lifetime is the span the marker is shown across.
 *
 * All the occupations go in one query rather than one pass each. Seventeen
 * separate sweeps of 2,800 years came to roughly 950 queries, which would not
 * finish inside a job; binding them through VALUES cuts that to one sweep and
 * lets the window splitter deal with whatever is left.
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

const VALUES = Object.keys(FIELD).map((q) => `wd:${q}`).join(" ");

const build = (a, b) => `
SELECT ?person ?personLabel ?occ ?birth ?death ?coord ?image ?sitelinks WHERE {
  VALUES ?occ { ${VALUES} }
  ?person wdt:P106 ?occ ; wdt:P569 ?birth ; wikibase:sitelinks ?sitelinks .
  FILTER(?birth >= ${dt(a)} && ?birth < ${dt(b)})
  FILTER(?sitelinks >= ${MIN_SITELINKS})
  OPTIONAL { ?person wdt:P570 ?death. }
  OPTIONAL { ?person wdt:P19 ?bp. ?bp wdt:P625 ?coord. }
  OPTIONAL { ?person wdt:P18 ?image. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;

export async function fetchFigures({ from = -800, to = 2000, step = 50 } = {}) {
  const byId = new Map();
  let noPlace = 0;

  await windowed({
    from, to, step, label: "figures", build,
    onRows(rows) {
      for (const r of rows) {
        const id = qid(val(r, "person"));
        if (!id || byId.has(id)) continue; // first occupation seen wins the glyph
        const birth = parseYear(val(r, "birth"));
        if (birth === null) continue;
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

  console.log(`  figures: ${byId.size} kept, ${noPlace} dropped for no birthplace coordinate`);
  return [...byId.values()];
}
