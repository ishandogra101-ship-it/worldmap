/**
 * Re-check every mapsTo name against Wikipedia. Needs network.
 *
 * Run: npm run verify:aliases
 *
 * mapsTo says "the border layer calls this polity X". That is a claim about the
 * dataset, not about history, but it is still a claim that can be wrong, and a
 * wrong one is expensive: it makes the capital test accept a map that names the
 * wrong polity, which is precisely the error the capital test exists to catch.
 *
 * The check: resolve the alias as a Wikipedia title, following redirects, and
 * resolve the polity's own name the same way. If both land on the same article,
 * the alias is corroborated by something outside this repository. That test is
 * sufficient, not necessary — most names here are the border layer's own
 * coinages ("Mahratta states", "Islamic and Hindu states") and will never
 * resolve. So this script reports and does not fail the build.
 *
 * What it is really for is the third outcome. DIFFERENT means the alias
 * resolves to a real article that is NOT this polity, and that is worth a look
 * every time. It caught two while this file was being written: "Principality of
 * Kyiv" resolves to Principality of Kiev, a successor of Kievan Rus rather than
 * another name for it, and "Tsardom of Muscovy" resolves to the Tsardom of
 * Russia, the state that followed the Grand Duchy of Moscow. Both would have
 * been wrong to accept, and both look obviously fine to a reader in a hurry.
 */
import { loadPolities } from "./load.mjs";

const UA = "worldmap-atlas/1.0 (https://github.com/ishandogra101-ship-it/worldmap)";
const API = "https://en.wikipedia.org/w/api.php";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cache = new Map();

async function resolveAll(titles) {
  const todo = titles.filter((t) => !cache.has(t));
  for (let i = 0; i < todo.length; i += 20) {
    const chunk = todo.slice(i, i + 20);
    const url = `${API}?${new URLSearchParams({
      action: "query", titles: chunk.join("|"), redirects: "1",
      format: "json", formatversion: "2",
    })}`;
    let data;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await fetch(url, { headers: { "User-Agent": UA } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        data = await res.json();
        break;
      } catch (err) {
        if (attempt === 3) throw err;
        await sleep(2000 * (attempt + 1));
      }
    }
    const q = data.query;
    const hop = new Map();
    for (const n of q.normalized ?? []) hop.set(n.from, n.to);
    for (const r of q.redirects ?? []) hop.set(r.from, r.to);
    const pages = new Map((q.pages ?? []).map((p) => [p.title, p]));
    for (const t of chunk) {
      let cur = t;
      for (let k = 0; k < 4 && hop.has(cur); k++) cur = hop.get(cur);
      const pg = pages.get(cur);
      cache.set(t, pg && !pg.missing ? pg.title : null);
    }
    await sleep(1500);
  }
  return titles.map((t) => cache.get(t));
}

const polities = await loadPolities();
// strip the @from..to window; it scopes when a name applies, not which page it is
const bare = (n) => n.replace(/@-?\d+\.\.-?\d+$/, "");

const wanted = new Set();
for (const p of polities) {
  wanted.add(p.canonicalName);
  for (const m of p.mapsTo ?? []) wanted.add(bare(m.name));
}
console.log(`resolving ${wanted.size} titles against Wikipedia…\n`);
await resolveAll([...wanted]);

// The dangerous case is narrow. Most aliases resolve somewhere other than the
// polity's own article — "Zhou" lands on a disambiguation page, "Zulu" on the
// people rather than the kingdom — and none of that can fool anything. What can
// is an alias that resolves to the article of a DIFFERENT polity in this
// canonical layer, because that is one polity laying claim to another's name,
// and the capital test would then accept the wrong map at that capital.
const articleOwner = new Map();
for (const p of polities) {
  const t = cache.get(p.canonicalName);
  if (t) articleOwner.set(t, p);
}

const same = [], collides = [], other = [];
for (const p of polities) {
  const self = cache.get(p.canonicalName);
  for (const m of p.mapsTo ?? []) {
    const name = bare(m.name);
    if (name === p.canonicalName) continue;
    const got = cache.get(name);
    const row = { polity: p.canonicalName, alias: m.name, self, got };
    if (got && self && got === self) same.push(row);
    else if (got && articleOwner.has(got) && articleOwner.get(got).id !== p.id) {
      row.owner = articleOwner.get(got).canonicalName;
      collides.push(row);
    } else other.push(row);
  }
}

console.log(`  ${same.length} corroborated — alias and polity resolve to one article`);
console.log(`  ${collides.length} COLLIDE with another canonical polity's article`);
console.log(`  ${other.length} resolve elsewhere or not at all — no way to fool the test\n`);

if (collides.length) {
  console.log("THIS ALIAS IS ANOTHER CANONICAL POLITY'S NAME");
  console.log("(the capital test will accept that polity's name at this one's capital.");
  console.log(" Sometimes right — an empire and its ruling dynasty share an article —");
  console.log(" and sometimes it is one polity quietly swallowing another.)\n");
  for (const r of collides.sort((a, b) => a.polity.localeCompare(b.polity))) {
    console.log(`  ${r.polity}  mapsTo "${r.alias}"`);
    console.log(`      resolves to ${r.got}, which is ${r.owner}`);
  }
  console.log("");
}

if (process.argv.includes("--verbose")) {
  console.log("CORROBORATED");
  for (const r of same) console.log(`  ${r.polity} <- "${r.alias}" (${r.got})`);
  console.log("\nRESOLVED ELSEWHERE OR NOT AT ALL");
  for (const r of other) console.log(`  ${r.polity} <- "${r.alias}" -> ${r.got ?? "(no article)"}`);
}
