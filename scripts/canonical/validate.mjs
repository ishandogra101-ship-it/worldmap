/**
 * Check the canonical layer against itself.
 *
 * Three kinds of check, in order of how much they matter.
 *
 * The honesty rule comes first: no automated process may mark a record
 * reviewed or cited. Everything else in this project depends on that label
 * meaning what it says, and a canonical layer that launders its own guesses is
 * worse than none.
 *
 * Then referential integrity — a ruler pointing at a polity that does not
 * exist, a succession pointing at nobody.
 *
 * Then chronology, which is where real historical errors surface. A reign
 * outside its polity's lifetime, a successor who started before their
 * predecessor, a dynasty that vanishes for a century. These are the checks that
 * catch mistakes individual-record review misses.
 */
import { loadPolities, loadPeople } from "./load.mjs";

const problems = [];
const warnings = [];
const fail = (where, msg) => problems.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

const polities = await loadPolities();
const people = await loadPeople();
const byId = new Map(polities.map((p) => [p.id, p]));
const personById = new Map(people.map((p) => [p.id, p]));

// ---- the honesty rule -------------------------------------------------------
const ASSISTANTS = /^(claude|gpt|assistant|ai|model|bot)\b/i;
for (const r of [...polities, ...people]) {
  const v = r.verification;
  const where = `${r._file} ${r.id}`;
  if (!v) { fail(where, "no verification block"); continue; }
  if (!["drafted", "reviewed", "cited"].includes(v.method)) {
    fail(where, `verification.method "${v.method}" is not one of drafted/reviewed/cited`);
  }
  if (v.method === "reviewed" && ASSISTANTS.test(v.by ?? "")) {
    fail(where, `marked reviewed by "${v.by}" — a review needs a person. See canonical/RULES.md.`);
  }
  if (v.method === "cited" && !(r.sources ?? []).some((s) => s.locator)) {
    fail(where, "marked cited but no source carries a locator");
  }
  if (!(r.sources ?? []).length) fail(where, "no sources named");
  for (const s of r.sources ?? []) {
    if (s.url && v.method === "drafted") {
      fail(where, `source "${s.title}" carries a URL on a drafted record — a URL means someone opened it`);
    }
  }
}

// ---- referential integrity --------------------------------------------------
const seen = new Set();
for (const p of [...polities, ...people]) {
  if (seen.has(p.id)) fail(p._file, `duplicate id "${p.id}"`);
  seen.add(p.id);
}
for (const p of polities) {
  for (const key of ["predecessors", "successors"]) {
    for (const id of p[key] ?? []) {
      if (!byId.has(id)) fail(`polity ${p.id}`, `${key} names unknown polity "${id}"`);
    }
  }
}
for (const r of people) {
  for (const reign of r.reigns ?? []) {
    const pol = byId.get(reign.polityId);
    if (!pol) { fail(`person ${r.id}`, `reigns over unknown polity "${reign.polityId}"`); continue; }
    for (const key of ["predecessorId", "successorId"]) {
      const id = reign[key];
      if (id && !personById.has(id)) fail(`person ${r.id}`, `${key} names unknown person "${id}"`);
    }
  }
}

// ---- chronology -------------------------------------------------------------
for (const p of polities) {
  if (p.ended && p.ended.year < p.founded.year) {
    fail(`polity ${p.id}`, `ends ${p.ended.year} before it is founded ${p.founded.year}`);
  }
  for (const c of p.capitals ?? []) {
    if (c.from !== undefined && c.to !== undefined && c.to < c.from) {
      fail(`polity ${p.id}`, `capital ${c.name} ends before it starts`);
    }
  }
}
for (const r of people) {
  const where = `person ${r.id}`;
  if (r.born && r.died && r.died.year < r.born.year) fail(where, "dies before birth");
  for (const { start, end, polityId, successorId } of r.reigns ?? []) {
    if (end && end.year < start.year) fail(where, "reign ends before it starts");
    const pol = byId.get(polityId);
    if (!pol) continue;
    if (start.year < pol.founded.year) {
      fail(where, `reign over ${pol.canonicalName} starts ${start.year}, before it is founded ${pol.founded.year}`);
    }
    if (pol.ended && (end?.year ?? start.year) > pol.ended.year) {
      fail(where, `reign over ${pol.canonicalName} runs to ${end?.year ?? start.year}, past its end in ${pol.ended.year}`);
    }
    if (r.born && start.year < r.born.year) fail(where, "reigns before being born");
    // a successor starting before this reign is only wrong when it is not a
    // restoration — Zhengtong legitimately succeeds the man who succeeded him
    const succ = successorId && personById.get(successorId);
    const earliest = succ && Math.min(...(succ.reigns ?? []).map((x) => x.start.year));
    if (succ && earliest < start.year && !(succ.reigns ?? []).some((x) => x.start.year >= (end?.year ?? start.year))) {
      warn(where, `successor ${succ.canonicalName} starts ${earliest}, before this reign begins ${start.year}`);
    }
  }
}

// a dynasty that disappears for a long stretch is usually a gap in the record
const byPolity = new Map();
for (const r of people) {
  for (const reign of r.reigns ?? []) {
    const list = byPolity.get(reign.polityId) ?? [];
    list.push({ person: r, reign });
    byPolity.set(reign.polityId, list);
  }
}
for (const [id, list] of byPolity) {
  const pol = byId.get(id);
  if (!pol || list.length < 2) continue;
  list.sort((a, b) => a.reign.start.year - b.reign.start.year);
  for (let i = 1; i < list.length; i++) {
    const prevEnd = list[i - 1].reign.end?.year ?? list[i - 1].reign.start.year;
    const gap = list[i].reign.start.year - prevEnd;
    if (gap > 25) {
      warn(`polity ${id}`, `${gap} years unaccounted between ${list[i - 1].person.canonicalName} and ${list[i].person.canonicalName}`);
    }
  }
}

// ---- report -----------------------------------------------------------------
const drafted = [...polities, ...people].filter((r) => r.verification?.method === "drafted").length;
const reviewed = [...polities, ...people].filter((r) => r.verification?.method === "reviewed").length;
const cited = [...polities, ...people].filter((r) => r.verification?.method === "cited").length;

console.log(`\ncanonical layer: ${polities.length} polities, ${people.length} people`);
console.log(`verification: ${drafted} drafted, ${reviewed} reviewed by a person, ${cited} cited to a locator\n`);

if (warnings.length) {
  console.log(`${warnings.length} to look at:`);
  for (const w of warnings) console.log(`  ${w}`);
  console.log("");
}
if (problems.length) {
  console.log(`${problems.length} PROBLEMS:`);
  for (const p of problems) console.log(`  ${p}`);
  process.exitCode = 1;
} else {
  console.log("no integrity or chronology problems");
}
