/**
 * Historical facts the atlas must not lose again.
 *
 * Every case here was a real failure found by someone reading the map, not by
 * a test. That is the point of writing them down: the cost of each was a round
 * trip through a complaint, and none of them can come back silently now.
 *
 * Run: npm run test:history
 *
 * These test the canonical layer and the built output, not the import. An
 * import that fails to corroborate an anchor is a gap in the import; an anchor
 * that disappears from the canonical layer is a regression in the atlas.
 */
import { loadPolities, loadPeople, existsAt, reignedAt } from "../../scripts/canonical/load.mjs";

const polities = await loadPolities();
const people = await loadPeople();
const polity = (id) => polities.find((p) => p.id === id);
const person = (id) => people.find((p) => p.id === id);

const results = [];
const check = (name, fn, why) => {
  let pass = false, detail = "";
  try { const r = fn(); pass = r === true; detail = r === true ? "" : String(r); }
  catch (err) { detail = err.message; }
  results.push({ name, pass, detail, why });
};

// --- 1. Ming, 1400 ----------------------------------------------------------
check("Ming exists in 1400", () =>
  existsAt(polity("ming"), 1400) || "canonical layer does not have the Ming in 1400",
  "The border snapshot draws the whole of China as the Great Khanate in 1400, 32 years after the Ming took Beijing. The canonical layer must know better than the import.");

check("Ming covers every year from 1368 to 1644", () => {
  const p = polity("ming");
  for (const y of [1368, 1400, 1450, 1500, 1600, 1643]) if (!existsAt(p, y)) return `missing in ${y}`;
  return true;
}, "The atlas draws the nearest earlier snapshot, so a gap at 1400 silently covered 92 years.");

check("The Yuan does not extend past 1368 in China", () =>
  polity("yuan").ended.year === 1368 || `Yuan ends ${polity("yuan").ended.year}`,
  "The Northern Yuan continued in Mongolia and is a separate record; conflating them is what produced Mongol China in 1400.");

check("A Ming emperor is reigning in 1400", () => {
  const r = people.filter((p) => reignedAt(p, 1400) && (p.reigns ?? []).some((x) => x.polityId === "ming"));
  return r.length > 0 || "no Ming emperor recorded as reigning in 1400";
}, "Knowing the polity existed is not enough — the atlas has to be able to say who held it.");

// --- 2. Bundelkhand ---------------------------------------------------------
check("Bundelkhand is a regional state, not an empire", () => {
  const p = polity("bundelkhand");
  return p.type !== "empire" || "Bundelkhand is typed as an empire";
}, "The 1800 snapshot draws it from the Narmada to the Himalaya, over Delhi and Agra.");

check("Delhi in 1800 belongs to the Marathas, not Bundelkhand", () =>
  existsAt(polity("maratha"), 1800) || "Maratha Confederacy not recorded in 1800",
  "Scindia held Delhi with the Mughal emperor as figurehead until the British took it in 1803.");

// --- 3. Kashmir, Ladakh, Punjab --------------------------------------------
check("Ladakh is independent through 1815", () =>
  existsAt(polity("ladakh"), 1815) || "Ladakh not recorded in 1815",
  "The Namgyal kingdom stood until the Dogra conquest of 1834; the border data assigns it to Punjab powers.");

check("The Durrani hold Kashmir's period, and the Sikh Empire starts in 1799", () => {
  if (!existsAt(polity("durrani"), 1800)) return "Durrani not recorded in 1800";
  const sikh = polity("sikh-empire");
  if (sikh.founded.year > 1800) return `Sikh Empire founded ${sikh.founded.year}`;
  return true;
}, "Kashmir was Durrani until Ranjit Singh took it in 1819, and the 1800 snapshot draws it as Sikh.");

check("The Marathas never reach Kashmir's latitude in the record", () => {
  const p = polity("maratha");
  return /never held Kashmir/i.test(p.notes ?? "") || "the Maratha record does not state the northern limit";
}, "The 1815 snapshot draws them from the Deccan to the Karakoram.");

// --- 4. Timurid rulers ------------------------------------------------------
check("The Timurid succession is more than Timur", () => {
  const line = people.filter((p) => (p.reigns ?? []).some((r) => r.polityId === "timurid"));
  return line.length >= 5 || `only ${line.length} Timurid rulers recorded`;
}, "The import held Timur and not one successor, across 150 years of a mapped empire.");

check("A Timurid is reigning in 1450", () =>
  people.some((p) => reignedAt(p, 1450) && (p.reigns ?? []).some((r) => r.polityId === "timurid"))
  || "no Timurid recorded as reigning in 1450",
  "Clicking the Timurid Empire at 1450 gave a realm with nobody in it.");

check("Ulugh Beg is both a sovereign and an astronomer", () => {
  const u = person("timurid-ulughbeg");
  if (!u) return "Ulugh Beg is not in the canonical layer";
  const hasRule = (u.reigns ?? []).length > 0;
  const hasScience = u.roles.includes("mathematician") || u.roles.includes("scientist");
  return (hasRule && hasScience) || `roles ${u.roles.join("/")}, reigns ${(u.reigns ?? []).length}`;
}, "The import held him only as an astronomer, which is half of him.");

// --- 5. Mansa Musa ----------------------------------------------------------
check("Mansa Musa reigns over Mali in 1324", () => {
  const m = person("mali-musa");
  if (!m) return "Mansa Musa is not in the canonical layer";
  return reignedAt(m, 1324) || "not recorded as reigning in 1324";
}, "His pilgrimage that year is the best-documented event in medieval West African history.");

check("The Mali succession runs from Sundiata", () => {
  const line = people.filter((p) => (p.reigns ?? []).some((r) => r.polityId === "mali-empire"));
  return line.length >= 4 || `only ${line.length} mansas recorded`;
}, "A single famous ruler with no line around him is a curiosity, not history.");

// --- 6. Genghis Khan --------------------------------------------------------
check("Genghis Khan is recorded with the title he actually held", () => {
  const g = person("genghis-khan");
  if (!g) return "Genghis Khan is not in the canonical layer";
  return g.roles.includes("khagan") || `roles are ${g.roles.join("/")}`;
}, "He was khagan, not king or emperor, which is why a query for monarchs missed him through four imports.");

check("The Mongol khagans form a chain", () => {
  const line = people.filter((p) => (p.reigns ?? []).some((r) => r.polityId === "mongol-empire"));
  return line.length >= 4 || `only ${line.length} khagans recorded`;
}, "Genghis alone leaves the empire with no succession.");

// --- 7. Julius Caesar -------------------------------------------------------
check("Julius Caesar is in the atlas without being a monarch", () => {
  const c = person("julius-caesar");
  if (!c) return "Julius Caesar is not in the canonical layer";
  const monarchRoles = ["king", "emperor", "sultan", "caliph", "shah", "khan", "tsar", "pharaoh"];
  if (c.roles.some((r) => monarchRoles.includes(r))) return `wrongly given a monarch role: ${c.roles.join("/")}`;
  return c.roles.includes("dictator") || `roles are ${c.roles.join("/")}`;
}, "A model that asks only whether someone was a monarch cannot see him. He must be present, and must not be made a king to get there.");

check("Caesar holds power in 44 BCE", () =>
  reignedAt(person("julius-caesar"), -44) || "not recorded as holding power in 44 BCE",
  "The year he was killed is the one a reader is most likely to look up.");

// --- 8. global coverage -----------------------------------------------------
check("No region holds more than a third of the polity backbone", () => {
  const by = {};
  for (const p of polities) by[p.region] = (by[p.region] ?? 0) + 1;
  const worst = Object.entries(by).sort((a, b) => b[1] - a[1])[0];
  const share = worst[1] / polities.length;
  return share <= 0.34 || `${worst[0]} holds ${(share * 100).toFixed(0)}%`;
}, "The imported layer is 58% Europe. A backbone built deliberately must not repeat that.");

check("Every inhabited region has a backbone", () => {
  const need = ["East Asia", "South Asia", "Southeast Asia", "Central Asia", "West Asia",
                "Europe", "North Africa", "Sub-Saharan Africa", "The Americas"];
  const have = new Set(polities.map((p) => p.region));
  const missing = need.filter((r) => !have.has(r));
  return missing.length === 0 || `no polities for: ${missing.join(", ")}`;
}, "Coverage is measured against history, not against how much of Wikidata was imported.");

// --- report -----------------------------------------------------------------
const passed = results.filter((r) => r.pass).length;
console.log(`\nhistorical anchors: ${passed}/${results.length} passing\n`);
for (const r of results) {
  console.log(`  ${r.pass ? "PASS" : "FAIL"}  ${r.name}`);
  if (!r.pass) {
    console.log(`        ${r.detail}`);
    console.log(`        why this matters: ${r.why}`);
  }
}
console.log("");
process.exitCode = passed === results.length ? 0 : 1;
