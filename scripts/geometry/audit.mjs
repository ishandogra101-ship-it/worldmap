/**
 * Where does each polygon on this map come from, and is it historical?
 *
 * Run: npm run audit:geometry
 *
 * The question this exists to answer is the one that decides whether the atlas
 * is a historical map or a modern map wearing historical labels:
 *
 *   Is the geometry itself varying through time, or is a present-day country
 *   outline being recoloured and renamed?
 *
 * A lot of historical-map projects commit that error and it is invisible from
 * the screen — a modern France with "Francia" written across it looks entirely
 * convincing. The only way to know is to compare vertex sequences against the
 * modern snapshot and to watch whether a polity's shape moves between years.
 *
 * Three checks:
 *
 *   1. MODERN REUSE. A polygon whose vertices exactly match a 2010 country.
 *      Islands are excluded: an island's outline is its coastline and does not
 *      change, so identity there is correct rather than suspicious. A land
 *      frontier is a different matter — frontiers move, and one that has not is
 *      either a genuinely stable border or a recycled modern shape.
 *
 *   2. STATIC POLITIES. A polity that appears in many snapshots with one
 *      unchanging shape. Empires expand and contract; a fixed outline across
 *      three centuries means the shape was pasted forward rather than
 *      reconstructed.
 *
 *   3. ANACHRONISM. A polygon named for a polity the canonical layer says did
 *      not exist in that year, or whose name is a modern state appearing
 *      centuries early.
 *
 * Nothing here is fixed automatically. Territorial history is exactly the thing
 * that should not be corrected by a script.
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPolities, existsAt, namesAt } from "../canonical/load.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = path.join(ROOT, "public", "data", "borders");

const yearOf = (f) => {
  const m = /world_(bc)?(\d+)\.geojson$/.exec(f);
  return m ? (m[1] ? -Number(m[2]) : Number(m[2])) : null;
};
const ringsOf = (g) => {
  if (!g) return [];
  const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
  return polys.map((p) => p[0]).filter(Boolean);
};
const shapeHash = (g) =>
  ringsOf(g).map((r) => r.map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join(";")).sort().join("||");
const areaOf = (g) => {
  let a = 0;
  for (const r of ringsOf(g)) {
    let t = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const lat = ((r[i][1] + r[j][1]) / 2) * (Math.PI / 180);
      t += (r[j][0] - r[i][0]) * ((r[i][1] + r[j][1]) / 2) * Math.cos(lat);
    }
    a += Math.abs(t);
  }
  return a;
};

/**
 * Polities whose outline is a coastline.
 *
 * Not a judgement about importance — it is the one case where a historical
 * shape matching a modern one is evidence of correctness rather than of
 * recycling. An island's frontier is the sea.
 */
const COASTAL = /sri lanka|saylan|sinhal|madagascar|antigua|dominica|philippin|brunei|cyprus|iceland|jamaica|haiti|cuba|bahrain|maldiv|mauritius|fiji|malta|barbados|grenada|saint |trinidad|comoros|cape verde|sao tome|seychelles|tonga|samoa|vanuatu|solomon|palau|nauru|tuvalu|kiribati|marshall|micronesia|japan|new zealand|singapore|bahamas|taiwan|greenland|montserrat|anguilla|turks and caicos|cayman|bermuda|falkland|aruba|curacao|guadeloupe|martinique|reunion|mayotte|guam|niue|cook islands/i;

const files = (await readdir(DIR)).filter((f) => f.endsWith(".geojson")).sort(
  (a, b) => yearOf(a) - yearOf(b),
);
const snapshots = [];
for (const f of files) {
  const year = yearOf(f);
  if (year === null) continue;
  snapshots.push({ year, fc: JSON.parse(await readFile(path.join(DIR, f), "utf8")) });
}
const latest = snapshots[snapshots.length - 1];
const modernByHash = new Map();
for (const f of latest.fc.features) {
  const h = shapeHash(f.geometry);
  if (h) modernByHash.set(h, f.properties.NAME);
}

// ---- 1. modern reuse --------------------------------------------------------
const reuse = [];
for (const { year, fc } of snapshots) {
  if (year >= latest.year - 50) continue; // the recent snapshots are meant to resemble today
  for (const f of fc.features) {
    const name = f.properties.NAME;
    if (!name) continue;
    const modern = modernByHash.get(shapeHash(f.geometry));
    if (!modern) continue;
    if (COASTAL.test(name) || COASTAL.test(modern)) continue;
    reuse.push({ year, name, modern });
  }
}

// ---- 2. static polities -----------------------------------------------------
const byName = new Map();
for (const { year, fc } of snapshots) {
  for (const f of fc.features) {
    const name = f.properties.NAME;
    if (!name) continue;
    const list = byName.get(name) ?? [];
    list.push({ year, hash: shapeHash(f.geometry), area: areaOf(f.geometry) });
    byName.set(name, list);
  }
}
/**
 * A region the source names for a people rather than a government.
 *
 * These are expected to hold one shape across centuries: the dataset draws
 * where a population lived, not a frontier that moved. Counting them as
 * suspicious buries the cases that are — the Empire of Ghana and Great
 * Zimbabwe holding a single outline for four hundred years is a real finding,
 * and it was sitting under 160 rows about Australian language groups.
 */
const DESCRIBES_A_PEOPLE =
  /\b(hunters?|hunter-gatherers?|gatherers?|foragers?|fishers?|fichers?|farmers?|herders?|pastoralists?|nomads?|nomadic|tribes?|cultures?|peoples?|speakers?|horticulturalists?)\b/i;

const statics = [];
const staticPeoples = [];
for (const [name, list] of byName) {
  // merge multi-feature polities within a year
  const perYear = new Map();
  for (const r of list) {
    const cur = perYear.get(r.year) ?? { hashes: [], area: 0 };
    cur.hashes.push(r.hash); cur.area += r.area;
    perYear.set(r.year, cur);
  }
  const years = [...perYear.keys()].sort((a, b) => a - b);
  if (years.length < 4) continue;
  const shapes = new Set(years.map((y) => perYear.get(y).hashes.sort().join("|")));
  const span = years[years.length - 1] - years[0];
  if (shapes.size === 1 && span >= 200) {
    const row = { name, years: years.length, span, from: years[0], to: years[years.length - 1] };
    (DESCRIBES_A_PEOPLE.test(name) ? staticPeoples : statics).push(row);
  }
}

// ---- 3. anachronism against the canonical layer -----------------------------
const canon = await loadPolities();
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
// A name is resolved against the year it appears in, so "Persia" in 300 CE
// reaches the Sasanians rather than whichever polity claimed the alias last.
const resolve = (name, year) =>
  canon.find((p) => namesAt(p, year).some((n) => norm(n) === norm(name)));
const anachronisms = [];
for (const { year, fc } of snapshots) {
  const seen = new Set();
  for (const f of fc.features) {
    const name = f.properties.NAME;
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const p = resolve(name, year) ?? canon.find((q) => namesAt(q, q.founded.year).some((n) => norm(n) === norm(name)));
    if (!p || existsAt(p, year)) continue;
    anachronisms.push({
      year, name, polity: p.canonicalName,
      window: `${p.founded.year}–${p.ended?.year ?? "present"}`,
      how: year < p.founded.year ? `${p.founded.year - year} years early` : `${year - p.ended.year} years late`,
    });
  }
}

// ---- report -----------------------------------------------------------------
const say = (h) => console.log(`\n${h}\n${"-".repeat(h.length)}`);
console.log(`\ngeometry audit — ${snapshots.length} snapshots, ${snapshots[0].year} to ${latest.year}`);

say("1. Land polygons reusing a present-day country outline");
console.log(`${reuse.length} across all snapshots before ${latest.year - 50}.`);
const byYear = new Map();
for (const r of reuse) byYear.set(r.year, (byYear.get(r.year) ?? 0) + 1);
for (const [y, n] of [...byYear].sort((a, b) => a[0] - b[0])) {
  const names = reuse.filter((r) => r.year === y).map((r) => r.name === r.modern ? r.name : `${r.name}→${r.modern}`);
  console.log(`  ${String(y).padStart(5)}: ${String(n).padStart(3)}   ${names.slice(0, 7).join(", ")}${names.length > 7 ? ` +${names.length - 7}` : ""}`);
}

say("2. Entities whose shape never changes across 200+ years");
console.log("(a fixed outline is correct for a region named after a people, and suspicious for a state)\n");
if (statics.length === 0) {
  console.log("  none");
} else {
  // 160 Aboriginal language groups all carrying "1600 to 1815, one shape" is
  // one layer someone added in bulk, not 160 separate findings. Collapsing by
  // signature is what lets the Empire of Ghana holding a single outline for
  // four centuries be visible at all.
  const groups = new Map();
  for (const s of statics) {
    const key = `${s.from}..${s.to}/${s.years}`;
    const g = groups.get(key) ?? [];
    g.push(s);
    groups.set(key, g);
  }
  const rows = [...groups.entries()].sort((a, b) => b[1][0].span - a[1][0].span);
  for (const [key, members] of rows) {
    const [from, to] = key.split("/")[0].split("..");
    if (members.length === 1) {
      console.log(`  ${members[0].name}: one shape from ${from} to ${to}`);
    } else {
      console.log(`  ${members.length} entities share one shape from ${from} to ${to} — added as a block, not ${members.length} findings`);
      console.log(`      ${members.slice(0, 6).map((m) => m.name).join(", ")}${members.length > 6 ? ", ..." : ""}`);
    }
  }
}
console.log(`\n  ${staticPeoples.length} of these are named for a people, where a fixed outline is expected.`);

say("3. Polities drawn outside the years the canonical layer gives them");
if (anachronisms.length === 0) console.log("  none among the polities the backbone covers");
for (const a of anachronisms) {
  console.log(`  ${String(a.year).padStart(5)}: "${a.name}" — ${a.polity} ran ${a.window}, drawn ${a.how}`);
}

console.log(`
Nothing above is corrected automatically. A large territorial change can be
real, a stable frontier can be real, and deciding which is which is research,
not arithmetic. These are review items.
`);
