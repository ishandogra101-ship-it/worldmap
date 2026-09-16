/**
 * Assemble the production dataset from canonical history and staged imports.
 *
 * This is the only thing that writes public/data/*.json. The rule it enforces
 * is the one the whole architecture rests on:
 *
 *   canonical wins. always.
 *
 * A staged import can fill in around the backbone — it holds tens of thousands
 * of people the canonical layer has not reached yet, and that breadth is worth
 * having. It cannot contradict a canonical record, cannot replace one, and
 * cannot delete one by failing to return it. An import that omits the Ming is
 * an import with a gap, not evidence that the Ming did not exist.
 *
 * Run: npm run build:atlas
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPolities, loadPeople, reignAt } from "./load.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const STAGING = path.join(ROOT, "staging");
const OUT = path.join(ROOT, "public", "data");

const readStaged = async (name) => {
  try { return JSON.parse(await readFile(path.join(STAGING, `${name}.json`), "utf8")); }
  catch { return []; }
};

const polities = await loadPolities();
const canonPeople = await loadPeople();

/**
 * Names a canonical record already covers, so a staged duplicate is dropped.
 *
 * Matching is on canonical name and every alternative name, normalised. It is
 * deliberately conservative: the cost of missing a duplicate is one extra
 * marker, and the cost of a false match is erasing a different person.
 */
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]/g, "");
const claimed = new Map();
for (const p of canonPeople) {
  for (const n of [p.canonicalName, ...(p.alternativeNames ?? [])]) claimed.set(norm(n), p.id);
}

/** A canonical person as the app's Entity shape. */
function toEntity(p) {
  const first = (p.reigns ?? [])[0];
  const last = (p.reigns ?? [])[(p.reigns ?? []).length - 1];
  const start = first ? first.start.year : p.born?.year;
  const end = first ? (last.end?.year ?? last.start.year) : p.died?.year;
  if (start === undefined || end === undefined) return null;
  const polity = first && polities.find((x) => x.id === first.polityId);
  return {
    id: p.id,
    kind: first ? "ruler" : "figure",
    name: p.canonicalName,
    category: polity ? polity.canonicalName : p.roles[0],
    startYear: start,
    endYear: Math.max(end, start),
    lng: p.place.lng,
    lat: p.place.lat,
    // Canonical records carry a fixed high prominence so the level-of-detail
    // system shows them first. This is a curation decision about what the atlas
    // has researched, not a claim that these people matter more than others.
    prominence: 95,
    canonical: true,
  };
}

const staged = {
  rulers: await readStaged("rulers"),
  figures: await readStaged("figures"),
  events: await readStaged("events"),
};

const canonEntities = canonPeople.map(toEntity).filter(Boolean);
const canonRulers = canonEntities.filter((e) => e.kind === "ruler");
const canonFigures = canonEntities.filter((e) => e.kind === "figure");

let dropped = 0;
const keep = (list) => list.filter((e) => {
  if (claimed.has(norm(e.name))) { dropped++; return false; }
  return true;
});

const out = {
  rulers: [...canonRulers, ...keep(staged.rulers)],
  figures: [...canonFigures, ...keep(staged.figures)],
  events: staged.events,
};

await mkdir(OUT, { recursive: true });
for (const [name, list] of Object.entries(out)) {
  await writeFile(path.join(OUT, `${name}.json`), JSON.stringify(list));
}

// The polity backbone ships too: the app needs it to know a realm exists even
// when the border snapshot for that year does not draw it.
await writeFile(path.join(OUT, "polities.json"), JSON.stringify(
  polities.map((p) => ({
    id: p.id, name: p.canonicalName, alternativeNames: p.alternativeNames ?? [],
    type: p.type, region: p.region,
    from: p.founded.year, to: p.ended?.year ?? null,
    capitals: p.capitals ?? [], mapsTo: (p.mapsTo ?? []).map((m) => m.name),
    sources: p.sources.map((s) => [s.author, s.title, s.edition].filter(Boolean).join(", ")),
    verification: p.verification.method,
    reviewed: p.verification.date,
    notes: p.notes,
  })),
));

console.log(`\ncanonical: ${polities.length} polities, ${canonPeople.length} people`);
console.log(`staged:    ${staged.rulers.length} rulers, ${staged.figures.length} figures, ${staged.events.length} events`);
console.log(`dropped:   ${dropped} staged records a canonical one already covers`);
console.log(`written:   ${out.rulers.length} rulers, ${out.figures.length} figures, ${out.events.length} events, ${polities.length} polities\n`);
