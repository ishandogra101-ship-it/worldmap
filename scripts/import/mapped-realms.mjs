import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BORDERS = path.join(ROOT, "public", "data", "borders");

/**
 * Every polity name the border layer draws.
 *
 * The two halves of this atlas were built without ever asking each other a
 * question, and it showed. The map draws the Timurid Empire across Central Asia
 * for a century and a half; the ruler layer holds Timur and not one of his
 * successors, so clicking it gave a realm with nobody in it. Wikidata knows who
 * ruled the Timurids. Nothing in the import had ever asked.
 *
 * These names are what the map actually shows, so they are the right thing to
 * ask about: positions whose jurisdiction is a realm on the map are exactly the
 * positions the atlas needs and does not have.
 *
 * Culture-area names are excluded. "Savanna hunter-gatherers" has no
 * jurisdiction to look up, and sending 93 of them costs query time for nothing.
 */
const DESCRIBES_A_PEOPLE =
  /\b(hunters?|hunter-gatherers?|gatherers?|foragers?|fishers?|fichers?|farmers?|herders?|pastoralists?|nomads?|nomadic|tribes?|cultures?|peoples?|speakers?|horticulturalists?)\b/i;

export async function mappedRealms({ minLength = 4 } = {}) {
  const names = new Set();
  for (const file of await readdir(BORDERS)) {
    if (!file.endsWith(".geojson")) continue;
    const fc = JSON.parse(await readFile(path.join(BORDERS, file), "utf8"));
    for (const f of fc.features) {
      const n = f.properties?.NAME;
      if (!n || typeof n !== "string") continue;
      const name = n.trim();
      if (name.length < minLength) continue;
      if (DESCRIBES_A_PEOPLE.test(name)) continue;
      // a SPARQL string literal cannot carry a raw quote or backslash
      if (/["\\]/.test(name)) continue;
      names.add(name);
    }
  }
  return [...names].sort();
}
