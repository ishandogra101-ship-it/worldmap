// Phase B: build the full people/events dataset from Wikidata and download
// portraits from Wikimedia Commons, then write the files the app reads.
//
//   node scripts/import/build-dataset.mjs
//
// Requires network access to query.wikidata.org, www.wikidata.org and
// commons.wikimedia.org / upload.wikimedia.org. If your environment blocks these
// (see README), run it somewhere they are reachable, then commit the output.
//
// Writes: public/data/rulers.json, figures.json, events.json  and  public/portraits/*.jpg
// The app merges these over src/data/highlights.json at runtime (by id).

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchRulers } from "./wikidata-rulers.mjs";
import { fetchFigures } from "./wikidata-figures.mjs";
import { fetchEvents } from "./wikidata-events.mjs";
import { fetchPortraits } from "./fetch-portraits.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const DATA_DIR = path.join(ROOT, "public", "data");
const PORTRAIT_DIR = path.join(ROOT, "public", "portraits");

async function main() {
  await mkdir(DATA_DIR, { recursive: true });

  console.log("Fetching rulers from Wikidata…");
  const rulers = await fetchRulers();
  console.log(`  -> ${rulers.length} rulers`);

  console.log("Fetching figures from Wikidata…");
  const figures = await fetchFigures();
  console.log(`  -> ${figures.length} figures`);

  console.log("Fetching events from Wikidata…");
  const events = await fetchEvents();
  console.log(`  -> ${events.length} events`);

  console.log("Downloading portraits from Wikimedia Commons…");
  const people = [...rulers, ...figures];
  const got = await fetchPortraits(people, PORTRAIT_DIR);
  console.log(`  -> ${got} portraits (people without a free image use a role icon)`);

  // fetchPortraits mutated people in place and stripped the temp `image` field.
  await writeFile(path.join(DATA_DIR, "rulers.json"), JSON.stringify(rulers));
  await writeFile(path.join(DATA_DIR, "figures.json"), JSON.stringify(figures));
  for (const e of events) delete e.image;
  await writeFile(path.join(DATA_DIR, "events.json"), JSON.stringify(events));

  console.log(
    `\nDone. rulers=${rulers.length} figures=${figures.length} events=${events.length} portraits=${got}.`,
  );
  console.log("Review the output, then commit public/data/*.json and public/portraits/.");
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
