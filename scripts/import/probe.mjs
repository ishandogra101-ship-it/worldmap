// Reports what Wikidata actually returns, before any real import runs.
//
// The environment this repo is edited from cannot reach query.wikidata.org, so
// the queries below have never been executed locally. This prints raw values and
// timings for a handful of cheap cases so the full import can be calibrated
// against fact rather than assumption — in particular the BCE year convention,
// where a silent off-by-one would misdate every ancient record.
//
//   node scripts/import/probe.mjs

import { sparql, val, qid, parseYear, parsePoint, prominenceFromSitelinks } from "./sparql.mjs";

const line = (s) => console.log(s);
const head = (s) => console.log(`\n--- ${s} ---`);

async function timed(label, query) {
  try {
    const { rows, ms } = await sparql(query, { label, retries: 1 });
    line(`${label}: ${rows.length} rows in ${ms}ms`);
    return rows;
  } catch (err) {
    line(`${label}: FAILED — ${err.constructor.name}: ${err.message}`);
    return null;
  }
}

async function main() {
  head("1. BCE year convention");
  // Alexander the Great (Q8409): born 356 BCE, died 323 BCE.
  // Cyrus the Great (Q8423): died 530 BCE. Augustus (Q1405): born 63 BCE.
  const known = await timed(
    "known BCE dates",
    `SELECT ?p ?pLabel ?birth ?death WHERE {
       VALUES ?p { wd:Q8409 wd:Q8423 wd:Q1405 }
       OPTIONAL { ?p wdt:P569 ?birth. }
       OPTIONAL { ?p wdt:P570 ?death. }
       SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
     }`,
  );
  const EXPECT = {
    Q8409: { name: "Alexander the Great", birth: -356, death: -323 },
    Q8423: { name: "Cyrus the Great", death: -530 },
    Q1405: { name: "Augustus", birth: -63, death: 14 },
  };
  if (known) {
    for (const b of known) {
      const id = qid(val(b, "p"));
      const rawB = val(b, "birth"), rawD = val(b, "death");
      line(`  ${id} ${val(b, "pLabel")}`);
      line(`    raw birth=${rawB}  death=${rawD}`);
      line(`    parsed birth=${parseYear(rawB)}  death=${parseYear(rawD)}`);
      const e = EXPECT[id];
      if (e) {
        for (const k of ["birth", "death"]) {
          if (e[k] === undefined) continue;
          const got = parseYear(k === "birth" ? rawB : rawD);
          line(`    CHECK ${k}: expected ${e[k]}, got ${got} — ${got === e[k] ? "OK" : "MISMATCH"}`);
        }
      }
    }
  }

  head("2. sitelinks and prominence");
  const sl = await timed(
    "sitelinks",
    `SELECT ?p ?pLabel ?sitelinks WHERE {
       VALUES ?p { wd:Q8409 wd:Q1405 wd:Q9438 wd:Q7226 }
       ?p wikibase:sitelinks ?sitelinks .
       SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
     }`,
  );
  if (sl) for (const b of sl) {
    const n = val(b, "sitelinks");
    line(`  ${val(b, "pLabel")}: ${n} sitelinks -> prominence ${prominenceFromSitelinks(n)}`);
  }

  head("3. rulers query shape (one narrow window)");
  const rulers = await timed(
    "rulers 1500-1550",
    `SELECT ?person ?personLabel ?start ?end ?realmLabel ?capcoord ?image ?sitelinks WHERE {
       ?person wdt:P31 wd:Q5 ; p:P39 ?st .
       ?st ps:P39 ?pos ; pq:P580 ?start .
       ?pos wdt:P279* wd:Q116 .
       FILTER(?start >= "1500-01-01"^^xsd:dateTime && ?start < "1550-01-01"^^xsd:dateTime)
       ?person wikibase:sitelinks ?sitelinks . FILTER(?sitelinks >= 15)
       OPTIONAL { ?st pq:P582 ?end. }
       OPTIONAL { ?pos wdt:P1001 ?realm. ?realm wdt:P36 ?cap. ?cap wdt:P625 ?capcoord. }
       OPTIONAL { ?pos wdt:P1001 ?r2. ?r2 rdfs:label ?realmLabel. FILTER(LANG(?realmLabel)="en") }
       OPTIONAL { ?person wdt:P18 ?image. }
       SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
     } LIMIT 40`,
  );
  if (rulers) for (const b of rulers.slice(0, 8)) {
    line(`  ${qid(val(b, "person"))} ${val(b, "personLabel")} | ${parseYear(val(b, "start"))}–${parseYear(val(b, "end"))} | realm=${val(b, "realmLabel")} | pt=${JSON.stringify(parsePoint(val(b, "capcoord")))} | img=${val(b, "image") ? "y" : "n"}`);
  }
  if (rulers) {
    const withPt = rulers.filter((b) => parsePoint(val(b, "capcoord"))).length;
    line(`  of ${rulers.length} rows, ${withPt} carry a capital coordinate`);
  }

  head("4. a heavier rulers window, to see where the endpoint gives up");
  await timed(
    "rulers 1200-1400 (200y)",
    `SELECT ?person ?start WHERE {
       ?person wdt:P31 wd:Q5 ; p:P39 ?st .
       ?st ps:P39 ?pos ; pq:P580 ?start .
       ?pos wdt:P279* wd:Q116 .
       FILTER(?start >= "1200-01-01"^^xsd:dateTime && ?start < "1400-01-01"^^xsd:dateTime)
       ?person wikibase:sitelinks ?sitelinks . FILTER(?sitelinks >= 15)
     } LIMIT 3000`,
  );

  head("5. figures query shape");
  const figs = await timed(
    "figures painters 1400-1600",
    `SELECT ?person ?personLabel ?birth ?death ?coord ?image ?sitelinks WHERE {
       ?person wdt:P31 wd:Q5 ; wdt:P106 wd:Q1028181 ; wdt:P569 ?birth ;
               wikibase:sitelinks ?sitelinks .
       FILTER(?birth >= "1400-01-01"^^xsd:dateTime && ?birth < "1600-01-01"^^xsd:dateTime)
       FILTER(?sitelinks >= 30)
       OPTIONAL { ?person wdt:P570 ?death. }
       OPTIONAL { ?person wdt:P19 ?bp. ?bp wdt:P625 ?coord. }
       OPTIONAL { ?person wdt:P18 ?image. }
       SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
     } LIMIT 40`,
  );
  if (figs) for (const b of figs.slice(0, 6)) {
    line(`  ${val(b, "personLabel")} ${parseYear(val(b, "birth"))}–${parseYear(val(b, "death"))} pt=${JSON.stringify(parsePoint(val(b, "coord")))}`);
  }

  head("6. events query shape");
  const ev = await timed(
    "battles with a date and a place",
    `SELECT ?e ?eLabel ?when ?coord ?sitelinks WHERE {
       ?e wdt:P31/wdt:P279* wd:Q178561 ; wdt:P585 ?when ; wdt:P625 ?coord ;
          wikibase:sitelinks ?sitelinks .
       FILTER(?sitelinks >= 25)
       SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
     } LIMIT 30`,
  );
  if (ev) for (const b of ev.slice(0, 6)) {
    line(`  ${val(b, "eLabel")} ${parseYear(val(b, "when"))} pt=${JSON.stringify(parsePoint(val(b, "coord")))}`);
  }

  head("7. Commons imageinfo shape");
  try {
    const u = new URL("https://commons.wikimedia.org/w/api.php");
    u.searchParams.set("action", "query");
    u.searchParams.set("format", "json");
    u.searchParams.set("titles", "File:Alexander the Great mosaic.jpg");
    u.searchParams.set("prop", "imageinfo");
    u.searchParams.set("iiprop", "url|extmetadata");
    u.searchParams.set("iiurlwidth", "160");
    const res = await fetch(u, {
      headers: { "User-Agent": "worldmap-history-atlas/0.1 (https://github.com/ishandogra101-ship-it/worldmap) probe" },
    });
    line(`  commons HTTP ${res.status}`);
    const j = await res.json();
    const page = Object.values(j.query?.pages || {})[0];
    const info = page?.imageinfo?.[0];
    line(`  thumburl: ${info?.thumburl}`);
    const em = info?.extmetadata || {};
    line(`  LicenseShortName: ${em.LicenseShortName?.value}`);
    line(`  Artist: ${(em.Artist?.value || "").replace(/<[^>]+>/g, "").slice(0, 80)}`);
  } catch (err) {
    line(`  commons FAILED — ${err.message}`);
  }

  line("\nprobe complete");
}

main().catch((e) => { console.error("probe crashed:", e); process.exit(1); });
