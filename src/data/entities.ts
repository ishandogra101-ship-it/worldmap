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

/** A bare QID is enough to point at the item page it came from. */
function withSource(e: Entity): Entity {
  if (e.source || !/^Q\d+$/.test(e.id)) return e;
  return { ...e, source: `https://www.wikidata.org/wiki/${e.id}` };
}

/**
 * Wikidata records a peer under their full style — "Edward de Vere, 17th Earl
 * of Oxford" — which is correct and far too long for a label beside a 30px
 * marker. Only the part before the title is kept. 41 records are affected.
 */
function shortName(name: string): string {
  const m = /^(.+?),\s+\d+(?:st|nd|rd|th)\s+(?:Duke|Earl|Baron|Marquess|Viscount|Count|Baronet)\b/.exec(name);
  return m ? m[1] : name;
}

const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

const HONORIFIC = /^(queen|king|emperor|empress|saint|st|sir|dame|prince|princess|pope|sultan|shah|tsar|czar|lord|lady)\s+/i;

/** Every spelling of a name worth comparing against another record's. */
function aliases(name: string): string[] {
  const out = new Set<string>();
  const add = (v: string) => { const n = norm(v); if (n.length >= 4) out.add(n); };
  add(name);
  add(name.replace(HONORIFIC, ""));
  // "Ibn Sina (Avicenna)" is one person under two names
  const paren = /\(([^)]+)\)/.exec(name);
  if (paren) add(paren[1]);
  add(name.replace(/\s*\([^)]*\)\s*/g, " "));
  return [...out];
}

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
 *
 * Matching runs over every spelling of each name, which is what catches "Queen
 * Victoria" against "Victoria" and "Avicenna" against "Ibn Sina (Avicenna)".
 * It deliberately stops short of a plain substring test: that would fold Hans
 * Albert Einstein into his father, and losing a real person is a worse fault
 * than drawing one twice.
 */
function sameRecord(a: Entity, b: Entity): boolean {
  if (a.kind !== b.kind) return false;
  if (a.startYear > b.endYear || b.startYear > a.endYear) return false;
  for (const x of aliases(a.name)) {
    for (const y of aliases(b.name)) {
      if (x === y || x.startsWith(y) || y.startsWith(x)) return true;
    }
  }
  return false;
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
    const short = shortName(e.name);
    byId.set(e.id, withSource(short === e.name ? e : { ...e, name: short }));
  }

  if (imported.length > 0) {
    console.info(
      `atlas: ${curated.length} curated + ${imported.length} imported, ` +
      `${suppressed} imported duplicates suppressed`,
    );
  }
  return [...byId.values()];
}
