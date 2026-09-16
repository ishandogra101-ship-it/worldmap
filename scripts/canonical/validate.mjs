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
import { loadClaims } from "./claims.mjs";

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

/**
 * The honesty rule, applied to any record that carries a verification block.
 *
 * Claims used to skip this entirely, which meant a claim could call itself
 * anything at all and the validator would agree. That was survivable while the
 * only levels were drafted and a person's review; it stopped being survivable
 * the moment an automated process could award itself `sourced`.
 */
function checkVerification(r, where) {
  const v = r.verification;
  if (!v) { fail(where, "no verification block"); return; }
  if (!["drafted", "sourced", "reviewed", "cited"].includes(v.method)) {
    fail(where, `verification.method "${v.method}" is not one of drafted/sourced/reviewed/cited`);
  }
  if (v.method === "reviewed" && ASSISTANTS.test(v.by ?? "")) {
    fail(where, `marked reviewed by "${v.by}" — a review needs a person. See canonical/RULES.md.`);
  }
  if (v.method === "cited" && !(r.sources ?? []).some((s) => s.locator)) {
    fail(where, "marked cited but no source carries a locator");
  }
  // `sourced` is the one level an automated process may award itself, and it
  // buys nothing on trust: it asserts a document was fetched, so it has to say
  // which one and at which revision, or it is just `drafted` wearing a better
  // word.
  if (v.method === "sourced") {
    const got = v.retrieved ?? [];
    if (!got.length) fail(where, "marked sourced but verification.retrieved is empty");
    for (const g of got) {
      if (!g.url) fail(where, "a sourced retrieval has no url");
      else if (!/^https?:\/\//.test(g.url)) fail(where, `sourced retrieval "${g.url}" is not a URL`);
      if (!g.date) fail(where, `sourced retrieval ${g.url ?? "(no url)"} has no date`);
    }
  }
}

/**
 * A URL means somebody opened it. That was the whole enforcement before
 * `sourced` existed, and it is why the seeded records name works without
 * linking them. A `sourced` record is the case the rule was waiting for: it
 * carries URLs precisely because they were fetched.
 */
function checkSourceUrls(r, where) {
  if (r.verification?.method !== "drafted") return;
  for (const s of r.sources ?? []) {
    if (s.url) {
      fail(where, `source "${s.title}" carries a URL on a drafted record — a URL means someone opened it`);
    }
  }
}

for (const r of [...polities, ...people]) {
  const where = `${r._file} ${r.id}`;
  checkVerification(r, where);
  if (!(r.sources ?? []).length) fail(where, "no sources named");
  checkSourceUrls(r, where);
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
const sourced = [...polities, ...people].filter((r) => r.verification?.method === "sourced").length;

console.log(`\ncanonical layer: ${polities.length} polities, ${people.length} people`);
// ---- claims answer to the same rule ----------------------------------------
const claims = await loadClaims();
for (const c of claims) {
  const cwhere = `claims/${c._file} ${c.polityId} ${c.from}..${c.to}`;
  checkVerification(c, cwhere);
  checkSourceUrls(c, cwhere);
  if (!byId.has(c.polityId)) fail(`claims/${c._file}`, `claim names unknown polity "${c.polityId}"`);
  else {
    const p = byId.get(c.polityId);
    if (c.from < p.founded.year) {
      fail(`claims/${c._file} ${c.polityId}`,
        `claim starts ${c.from} but the polity is founded ${p.founded.year}`);
    }
    if (p.ended && c.to > p.ended.year) {
      fail(`claims/${c._file} ${c.polityId}`,
        `claim runs to ${c.to} but the polity ends ${p.ended.year}`);
    }
  }
  if (!c.note) warn(`claims/${c._file} ${c.polityId}`, "no note saying why this extent");
}
const claimMethods = new Map();
for (const c of claims) claimMethods.set(c.verification?.method, (claimMethods.get(c.verification?.method) ?? 0) + 1);

console.log(`claims: ${claims.length} — ` +
  [...claimMethods].map(([m, n]) => `${n} ${m}`).join(", ") + `\n`);

console.log(`verification: ${drafted} drafted, ${sourced} sourced to a fetched document, ${reviewed} reviewed by a person, ${cited} cited to a locator\n`);

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
