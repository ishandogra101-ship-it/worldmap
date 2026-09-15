/**
 * Promote a staged record into the canonical layer.
 *
 * It refuses. That is the whole script.
 *
 * Promotion is a research act: someone reads the staged record against named
 * sources, decides what is true, and writes a canonical record by hand. There
 * is no automated path from staging to canonical, because the moment one
 * exists the canonical layer is just the import with extra steps, and every
 * guarantee this architecture makes becomes decoration.
 *
 * What this script does instead is print what a reviewer needs: the staged
 * record, what canonical already holds nearby, and the file to write into.
 */
import { loadPolities, loadPeople } from "./load.mjs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const query = process.argv.slice(2).join(" ").trim();
if (!query) {
  console.log("usage: node scripts/canonical/promote.mjs <name or QID>");
  process.exit(1);
}

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const staged = [];
for (const layer of ["rulers", "figures"]) {
  try {
    const rows = JSON.parse(await readFile(path.join(ROOT, "staging", `${layer}.json`), "utf8"));
    staged.push(...rows.map((r) => ({ ...r, _layer: layer })));
  } catch { /* nothing staged */ }
}

const hits = staged.filter((r) => r.id === query || norm(r.name).includes(norm(query)));
const people = await loadPeople();
const polities = await loadPolities();

console.log(`\nstaged records matching "${query}": ${hits.length}`);
for (const h of hits.slice(0, 8)) {
  console.log(`  ${h.id}  ${h.name}  ${h.startYear}–${h.endYear}  ${h.category ?? "(no realm)"}  [${h._layer}]`);
  console.log(`    https://www.wikidata.org/wiki/${h.id}`);
}

const already = people.filter((p) => norm(p.canonicalName).includes(norm(query)));
console.log(`\ncanonical records matching: ${already.length}`);
for (const p of already) console.log(`  ${p.id}  ${p.canonicalName}  (${p._file})`);

const realms = polities.filter((p) => norm(p.canonicalName).includes(norm(query)));
if (realms.length) {
  console.log(`\ncanonical polities matching: ${realms.map((r) => r.id).join(", ")}`);
}

console.log(`
This script will not write to canonical/. A canonical record is written by a
person who has read the sources, and is marked "reviewed" only by that person.
See canonical/RULES.md.
`);
