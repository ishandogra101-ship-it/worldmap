// Build the border layer that the app ships.
//
// For each snapshot year it:
//   1. reads the raw historical-basemaps GeoJSON (from a local cache dir if
//      present, otherwise downloads it), and Natural Earth land,
//   2. simplifies geometry + trims coordinate precision + drops fields we
//      don't use, with mapshaper,
//   3. writes the result to public/data/borders/ and a manifest.json.
//
// Data: historical political boundaries © the historical-basemaps project
//   (https://github.com/aourednik/historical-basemaps), and Natural Earth
//   (public domain). See CREDITS.md.
//
// Usage:
//   node scripts/build-borders.mjs            # download sources as needed
//   INPUT_DIR=/path/to/raw node scripts/build-borders.mjs   # use a local cache
//
import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mapshaper from "mapshaper";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "public", "data", "borders");
const LAND_OUT = path.join(ROOT, "public", "data", "land.geojson");
const INPUT_DIR = process.env.INPUT_DIR || path.join(__dirname, ".cache", "borders");

const HB_BASE =
  "https://raw.githubusercontent.com/aourednik/historical-basemaps/master/geojson";
const NE_BASE =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson";

// The 49 snapshot years the app uses (3000 BCE -> 2010), from the project index.
const YEARS = [
  -3000, -2000, -1500, -1000, -700, -500, -400, -323, -300, -200, -100, -1,
  100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1279, 1300,
  1400, 1492, 1500, 1530, 1600, 1650, 1700, 1715, 1783, 1800, 1815, 1878,
  1880, 1900, 1914, 1920, 1930, 1938, 1945, 1960, 1994, 2000, 2010,
];

const fileForYear = (y) => (y < 0 ? `world_bc${-y}.geojson` : `world_${y}.geojson`);

async function loadSource(filename, baseUrl) {
  const cached = path.join(INPUT_DIR, filename);
  if (existsSync(cached)) return readFile(cached, "utf8");
  const url = `${baseUrl}/${filename}`;
  process.stdout.write(`  fetching ${url}\n`);
  const res = await fetch(url, { headers: { "User-Agent": "worldmap-build/0.1" } });
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return res.text();
}

async function run(commands, inputName, content) {
  const out = await mapshaper.applyCommands(commands, { [inputName]: content });
  const key = Object.keys(out)[0];
  return out[key];
}

async function buildBorders() {
  await mkdir(OUT_DIR, { recursive: true });
  const manifest = [];
  for (const year of YEARS) {
    const filename = fileForYear(year);
    let raw;
    try {
      raw = await loadSource(filename, HB_BASE);
    } catch (err) {
      console.warn(`  skip ${filename}: ${err.message}`);
      continue;
    }
    const cmd = [
      `-i input.geojson`,
      `-simplify visvalingam 12% keep-shapes`,
      `-filter-fields NAME,SUBJECTO,PARTOF`,
      `-o out.geojson format=geojson precision=0.01`,
    ].join(" ");
    const result = await run(cmd, "input.geojson", raw);
    const outName = filename;
    await writeFile(path.join(OUT_DIR, outName), result);
    const bytes = Buffer.byteLength(result);
    manifest.push({ year, file: `borders/${outName}`, bytes });
    console.log(`  ${filename}  ${(bytes / 1024).toFixed(0)} KB`);
  }
  manifest.sort((a, b) => a.year - b.year);
  await writeFile(
    path.join(OUT_DIR, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
  const total = manifest.reduce((s, m) => s + m.bytes, 0);
  console.log(`Borders: ${manifest.length} files, ${(total / 1024 / 1024).toFixed(1)} MB total`);
}

async function buildLand() {
  await mkdir(path.dirname(LAND_OUT), { recursive: true });
  // Prefer 50m for coastline detail; fall back to 110m.
  let raw, name;
  for (const candidate of ["ne_50m_land.geojson", "ne_110m_land.geojson"]) {
    try {
      raw = await loadSource(candidate, NE_BASE);
      name = candidate;
      break;
    } catch {
      /* try next */
    }
  }
  if (!raw) {
    console.warn("  no Natural Earth land source found; skipping land layer");
    return;
  }
  const detail = name.includes("50m") ? "30%" : "60%";
  const cmd = [
    `-i input.geojson`,
    `-simplify visvalingam ${detail} keep-shapes`,
    `-o out.geojson format=geojson precision=0.01`,
  ].join(" ");
  const result = await run(cmd, "input.geojson", raw);
  await writeFile(LAND_OUT, result);
  console.log(`Land: ${name} -> ${(Buffer.byteLength(result) / 1024).toFixed(0)} KB`);
}

console.log(`Input dir: ${INPUT_DIR} (downloads what is missing)`);
await buildLand();
await buildBorders();
console.log("Done.");
