import type { Entity } from "../types";
import { asset } from "../util";
import highlights from "./highlights.json";
import cities from "./cities.json";

// Files the Wikidata import writes (see .github/workflows/import.yml). Absent
// until it has run; fetch failures are expected and ignored so the app works on
// the curated highlights alone.
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

const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * True when an imported record is the same person or event as a curated one.
 *
 * The two sets are keyed differently — curated records use hand-written ids,
 * imported ones a Wikidata QID — so nothing stops both from being drawn, and
 * two Augustus markers side by side is exactly the kind of fault that makes a
 * map look untrustworthy.
 *
 * Wikidata's label is often the shorter form of the same name ("Akbar" against
 * the curated "Akbar the Great"), so one name being a prefix of the other
 * counts as a match — but only when the two also overlap in time, which is what
 * keeps a Henry from swallowing a different Henry three centuries away.
 */
function sameRecord(a: Entity, b: Entity): boolean {
  if (a.kind !== b.kind) return false;
  if (a.startYear > b.endYear || b.startYear > a.endYear) return false;
  const x = norm(a.name), y = norm(b.name);
  if (x.length < 4 || y.length < 4) return false;
  return x === y || x.startsWith(y) || y.startsWith(x);
}

let cached: Promise<Entity[]> | null = null;

export function loadEntities(): Promise<Entity[]> {
  if (!cached) cached = build();
  return cached;
}

async function build(): Promise<Entity[]> {
  const curated = [...(highlights as Entity[]), ...(cities as Entity[])];
  const imported = (await Promise.all(IMPORTED.map(fetchImported))).flat();

  const byId = new Map<string, Entity>();
  for (const e of curated) byId.set(e.id, e);

  // A curated record carries a written description and a chosen source, so it
  // wins; the imported twin is dropped rather than drawn beside it.
  let suppressed = 0;
  const byKind = new Map<string, Entity[]>();
  for (const e of curated) {
    const list = byKind.get(e.kind);
    if (list) list.push(e); else byKind.set(e.kind, [e]);
  }
  for (const e of imported) {
    if (byId.has(e.id)) continue;
    const peers = byKind.get(e.kind) ?? [];
    if (peers.some((c) => sameRecord(c, e))) { suppressed++; continue; }
    byId.set(e.id, e);
  }

  if (imported.length > 0) {
    console.info(
      `atlas: ${curated.length} curated + ${imported.length} imported, ` +
      `${suppressed} imported duplicates suppressed`,
    );
  }
  return [...byId.values()];
}
