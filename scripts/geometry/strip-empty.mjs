/**
 * Drop features that carry a name but no shape.
 *
 * Simplification collapses the smallest polygons to nothing, and mapshaper
 * leaves the feature behind with a null geometry. Fourteen snapshots ship
 * between one and two hundred of them.
 *
 * They draw nothing, so on the map they are invisible. Everywhere else they
 * are not: the coverage panel counts features, and the absent-realms check
 * asks whether a snapshot contains a polity by name, so a shapeless "Magadha"
 * answers yes and suppresses the note saying the atlas cannot show it. A
 * record that claims a polity is on the map when it is not is the thing this
 * project is trying to stop doing.
 *
 * Dropping them is safe because every name involved is still on the map on
 * another feature — checked below, not assumed. Five names are not, and each
 * one turned out to be a defect in the source rather than a polity this step
 * was about to erase. They are listed so that the next person to notice one
 * missing does not go looking for a way to restore it:
 *
 *   West African cereal farmers, 900 — a four-vertex speck ten kilometres
 *     across at 42.4E 13.2N, which is Djibouti.
 *   Algiers, 1650 — a triangle in the Saharan interior at 32N, four hundred
 *     kilometres south of the city. The regency's actual coast is unmapped in
 *     this snapshot with or without it.
 *   Tunis, 1650 — a triangle inland at 33N. Tunis itself draws as Ottoman,
 *     which is what the regency was.
 *   Athabascan, 1600 and 1650 — two triangles in the Yukon.
 *   Savanna hunter-gatherers, 1783 — twenty-five vertices in four scraps
 *     scattered over three thousand kilometres of Brazil.
 *
 * Every one is a closed triangle or near enough: shapes that draw a hairline
 * at any zoom, carrying a name that suggests territory.
 *
 * Run: npm run strip:empty
 */
import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), "..", "..", "public", "data", "borders",
);

/** Names whose only geometry in the source is a defect (see above). */
const KNOWN_DEFECTS = new Set([
  "West African cereal farmers", "Algiers", "Tunis", "Athabascan",
  "Savanna hunter-gatherers",
]);

let files = 0, dropped = 0;
for (const file of (await readdir(DIR)).filter((f) => f.endsWith(".geojson"))) {
  const p = path.join(DIR, file);
  const fc = JSON.parse(await readFile(p, "utf8"));
  const kept = fc.features.filter((f) => f.geometry?.coordinates?.length);
  const n = fc.features.length - kept.length;
  if (n === 0) continue;
  const named = fc.features.filter(
    (f) => !f.geometry?.coordinates?.length && String(f.properties?.NAME ?? "").trim(),
  ).map((f) => f.properties.NAME.trim());
  // A name that leaves the snapshot entirely is a different matter from a
  // duplicate label losing one of its shapes, and is worth stopping for.
  const surviving = new Set(kept.map((f) => String(f.properties?.NAME ?? "").trim()));
  const vanished = [...new Set(named)].filter((n) => !surviving.has(n) && !KNOWN_DEFECTS.has(n));
  if (vanished.length) {
    console.error(`  ${file}: would remove the last shape named ${vanished.join(", ")} — stopping`);
    process.exitCode = 1;
    continue;
  }
  fc.features = kept;
  await writeFile(p, JSON.stringify(fc));
  files++; dropped += n;
  console.log(`  ${file.padEnd(22)} -${n}${named.length ? `  (named: ${named.join(", ")})` : ""}`);
}
console.log(`\n${dropped} shapeless features removed from ${files} snapshots`);
