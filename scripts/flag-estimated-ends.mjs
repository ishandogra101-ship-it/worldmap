/**
 * Backfill endEstimated on ruler records already on disk.
 *
 * The importer now flags a reign whose end it invented, but the data shipped
 * before that change carries no flag, and regenerating it means another full
 * import. The invented span is exactly 25 years, so that is the test.
 *
 * It is a heuristic and it errs in the safe direction: a genuine 25-year reign
 * gets marked "end not recorded" when it was recorded, which understates what
 * the atlas knows. The opposite mistake — printing an invented date as fact —
 * is the one worth avoiding. The next import replaces every flag with the real
 * answer.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(ROOT, "public", "data", "rulers.json");
const rulers = JSON.parse(await readFile(file, "utf8"));

let flagged = 0;
for (const r of rulers) {
  if (r.endYear - r.startYear === 25) { r.endEstimated = true; flagged++; }
  else delete r.endEstimated;
}
await writeFile(file, JSON.stringify(rulers));
console.log(`flagged ${flagged} of ${rulers.length} rulers as having an unrecorded reign end`);
