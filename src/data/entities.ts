import type { Entity } from "../types";
import { asset } from "../util";
import highlights from "./highlights.json";
import cities from "./cities.json";

// Files the Wikidata importer writes (Phase B). Absent until then; fetch failures
// are expected and ignored so the app runs on curated highlights alone.
const IMPORTED = ["data/rulers.json", "data/figures.json", "data/events.json"];

async function fetchImported(path: string): Promise<Entity[]> {
  try {
    const res = await fetch(asset(path));
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? (data as Entity[]) : [];
  } catch {
    return [];
  }
}

let cached: Promise<Entity[]> | null = null;

export function loadEntities(): Promise<Entity[]> {
  if (!cached) cached = build();
  return cached;
}

async function build(): Promise<Entity[]> {
  const imported = (await Promise.all(IMPORTED.map(fetchImported))).flat();
  // Imported entries (keyed by id, e.g. a Wikidata QID) win over a curated
  // highlight with the same id; otherwise both are kept.
  const byId = new Map<string, Entity>();
  for (const e of highlights as Entity[]) byId.set(e.id, e);
  for (const c of cities as Entity[]) byId.set(c.id, c);
  for (const e of imported) byId.set(e.id, e);
  return [...byId.values()];
}
