/**
 * Read the canonical layer off disk and expand it into full records.
 *
 * The region files are written compactly so a person can read and correct them.
 * This turns `founded: 1368` into `{ year: 1368 }`, fills the region, sources
 * and verification a record inherits from its file, and hands back something
 * that matches canonical/schema.ts.
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const CANONICAL = path.join(ROOT, "canonical");

const asDate = (v) =>
  v === undefined ? undefined : typeof v === "number" ? { year: v } : v;

async function readDir(dir) {
  let files;
  try { files = await readdir(dir); } catch { return []; }
  const out = [];
  for (const f of files.filter((f) => f.endsWith(".json"))) {
    out.push({ file: f, data: JSON.parse(await readFile(path.join(dir, f), "utf8")) });
  }
  return out;
}

/**
 * Names the border dataset uses for a polity, each with the years it applies.
 *
 * A place name belongs to different polities at different times, which is the
 * whole subject of this project. "Persia" is the Achaemenids, then the
 * Sasanians, then the Safavids, then the Qajars. A flat list of aliases either
 * lets the Qajars claim every Persia back to 550 BCE, or — if the generic names
 * are stripped to prevent that — makes the map look wrong everywhere it is
 * actually right.
 *
 * So an entry may be a bare string, or "name@from..to" scoping it to a window.
 */
function parseMapsTo(list) {
  return (list ?? []).map((raw) => {
    const m = /^(.*)@(-?\d+)\.\.(-?\d+)$/.exec(raw);
    return m
      ? { name: m[1], from: Number(m[2]), to: Number(m[3]) }
      : { name: raw, from: -Infinity, to: Infinity };
  });
}

export async function loadPolities() {
  const out = [];
  for (const { file, data } of await readDir(path.join(CANONICAL, "polities"))) {
    for (const p of data.polities) {
      out.push({
        ...p,
        mapsTo: parseMapsTo(p.mapsTo),
        region: p.region ?? data.region,
        founded: asDate(p.founded),
        ended: asDate(p.ended),
        sources: p.sources ?? data.sources,
        verification: p.verification ?? data.verification,
        _file: file,
      });
    }
  }
  return out;
}

export async function loadPeople() {
  const out = [];
  for (const dir of ["rulers", "people"]) {
    for (const { file, data } of await readDir(path.join(CANONICAL, dir))) {
      for (const p of data.people ?? []) {
        const reigns = (p.reigns ?? []).map((r) => ({
          ...r, start: asDate(r.start), end: asDate(r.end),
        }));
        out.push({
          ...p,
          reigns,
          born: asDate(p.born),
          died: asDate(p.died),
          region: p.region ?? data.region,
          sources: p.sources ?? data.sources,
          verification: p.verification ?? data.verification,
          _file: file,
        });
      }
    }
  }
  return out;
}

export const existsAt = (p, year) =>
  year >= p.founded.year && (p.ended === undefined || year <= p.ended.year);

export const reignedAt = (p, year) =>
  (p.reigns ?? []).some(
    (r) => year >= r.start.year && (r.end === undefined || year <= r.end.year),
  );

export const reignAt = (p, year) =>
  (p.reigns ?? []).find(
    (r) => year >= r.start.year && (r.end === undefined || year <= r.end.year),
  );

/** Every name this polity may legitimately be drawn under in a given year. */
export function namesAt(p, year) {
  const out = [p.canonicalName, ...(p.alternativeNames ?? [])];
  for (const m of p.mapsTo ?? []) {
    if (year >= m.from && year <= m.to) out.push(m.name);
  }
  return out;
}

/** Who this polity answered to in a given year, if anyone. */
export function overlordAt(p, year) {
  return (p.subordinateTo ?? []).find((s) => year >= s.from && year <= s.to);
}

/**
 * Group labels the border layer draws in place of naming a single polity.
 *
 * Returns a lookup from a normalised drawn name to the set of polity ids that
 * label legitimately covers. See canonical/collectives.json for why a
 * collective is a pass that still gets reported.
 */
export async function loadCollectives() {
  const raw = JSON.parse(
    await readFile(path.join(CANONICAL, "collectives.json"), "utf8"),
  );
  const byName = new Map();
  for (const c of raw.collectives) {
    for (const n of [c.name, ...(c.alsoDrawnAs ?? [])]) {
      byName.set(normName(n), { label: c.name, members: new Set(c.members) });
    }
  }
  return byName;
}

/** The name comparison the reconciliation uses everywhere: fold case and punctuation. */
export const normName = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
