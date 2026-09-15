// Why does the ruler query miss people it obviously should catch?
//
// 4,397 rulers across 5,000 years is about fifty alive in any given year
// worldwide, and the set contains no Ottoman sultan, no Genghis Khan and no
// Mansa Musa. This dumps the P39 statements of people the query misses, and
// counts what each filter in it actually costs, so the fix is chosen against
// evidence rather than against a hunch.
//
//   node scripts/import/probe-rulers.mjs

import { sparql, val, qid } from "./sparql.mjs";

const line = (s) => console.log(s);
const head = (s) => console.log(`\n--- ${s} ---`);

async function run(label, query) {
  try {
    const { rows, ms } = await sparql(query, { label, retries: 1 });
    line(`${label}: ${rows.length} rows in ${ms}ms`);
    return rows;
  } catch (e) {
    line(`${label}: FAILED — ${e.message}`);
    return [];
  }
}

const MISSED = ["Genghis Khan", "Mansa Musa", "Suleiman the Magnificent", "Mehmed II", "Ashoka"];

async function main() {
  head("1. what positions do the missing people actually hold?");
  for (const name of MISSED) {
    const rows = await run(
      `  ${name}`,
      `SELECT ?p ?posLabel ?start ?end ?isMonarch ?isHeadOfState WHERE {
         ?p rdfs:label "${name}"@en ; wdt:P31 wd:Q5 ; p:P39 ?st .
         ?st ps:P39 ?pos .
         OPTIONAL { ?st pq:P580 ?start. }
         OPTIONAL { ?st pq:P582 ?end. }
         BIND(EXISTS { ?pos wdt:P279* wd:Q116 } AS ?isMonarch)
         BIND(EXISTS { ?pos wdt:P279* wd:Q48352 } AS ?isHeadOfState)
         SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
       } LIMIT 12`,
    );
    for (const r of rows) {
      line(`     pos="${val(r, "posLabel")}" start=${val(r, "start") || "—"} end=${val(r, "end") || "—"}`
        + ` monarch=${val(r, "isMonarch")} headOfState=${val(r, "isHeadOfState")}`);
    }
  }

  head("2. what each filter costs, over 1400-1600");
  const window = `FILTER(?start >= "1400-01-01"^^xsd:dateTime && ?start < "1600-01-01"^^xsd:dateTime)`;
  const variants = [
    ["monarch + P580 + sitelinks>=8 (current)",
     `?pos wdt:P279* wd:Q116 . ?st pq:P580 ?start . ${window}
      ?person wikibase:sitelinks ?s . FILTER(?s >= 8)`],
    ["monarch + P580, no fame floor",
     `?pos wdt:P279* wd:Q116 . ?st pq:P580 ?start . ${window}`],
    ["head of state + P580 + sitelinks>=8",
     `?pos wdt:P279* wd:Q48352 . ?st pq:P580 ?start . ${window}
      ?person wikibase:sitelinks ?s . FILTER(?s >= 8)`],
    ["monarch OR head of state + P580 + sitelinks>=8",
     `{ ?pos wdt:P279* wd:Q116 } UNION { ?pos wdt:P279* wd:Q48352 }
      ?st pq:P580 ?start . ${window}
      ?person wikibase:sitelinks ?s . FILTER(?s >= 8)`],
  ];
  for (const [label, body] of variants) {
    await run(`  ${label}`,
      `SELECT DISTINCT ?person WHERE {
         ?person wdt:P31 wd:Q5 ; p:P39 ?st . ?st ps:P39 ?pos .
         ${body}
       } LIMIT 20000`);
  }

  head("3. how many P39 monarch statements carry no start date at all");
  await run("  monarchs with a P580",
    `SELECT DISTINCT ?person WHERE {
       ?person wdt:P31 wd:Q5 ; p:P39 ?st . ?st ps:P39 ?pos .
       ?pos wdt:P279* wd:Q116 . ?st pq:P580 ?start .
       ?person wikibase:sitelinks ?s . FILTER(?s >= 8)
     } LIMIT 60000`);
  await run("  monarchs with no P580 but a birth year",
    `SELECT DISTINCT ?person WHERE {
       ?person wdt:P31 wd:Q5 ; p:P39 ?st ; wdt:P569 ?birth . ?st ps:P39 ?pos .
       ?pos wdt:P279* wd:Q116 .
       FILTER NOT EXISTS { ?st pq:P580 ?any. }
       ?person wikibase:sitelinks ?s . FILTER(?s >= 8)
     } LIMIT 60000`);

  line("\nprobe complete");
}

main().catch((e) => { console.error("crashed:", e); process.exit(1); });
