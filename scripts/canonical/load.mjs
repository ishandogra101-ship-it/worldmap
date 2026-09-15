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

export async function loadPolities() {
  const out = [];
  for (const { file, data } of await readDir(path.join(CANONICAL, "polities"))) {
    for (const p of data.polities) {
      out.push({
        ...p,
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
