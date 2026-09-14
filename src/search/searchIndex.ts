import type { Entity, PolitySummary } from "../types";
import { MIN_YEAR, MAX_YEAR, formatYear } from "../util";

export type ResultKind = "year" | "ruler" | "figure" | "event" | "city" | "polity" | "action";

export interface SearchResult {
  id: string;
  kind: ResultKind;
  title: string;
  subtitle?: string;
  detail?: string;
  score: number;
  entity?: Entity;
  polity?: PolitySummary;
  year?: number;
  action?: string;
}

/** "1492", "44 bce", "go to 1066", "year 800" */
export function parseYearQuery(q: string): number | null {
  const m = q.match(/(-?\d{1,4})\s*(bce?|ce|ad)?/i);
  if (!m) return null;
  // ignore stray digits inside a longer word query
  if (!/^\s*(go\s*to\s*|year\s*|jump\s*to\s*)?-?\d{1,4}\s*(bce?|ce|ad)?\s*$/i.test(q)) return null;
  let year = parseInt(m[1], 10);
  const suffix = (m[2] || "").toLowerCase();
  if (suffix.startsWith("b")) year = -Math.abs(year);
  if (year < MIN_YEAR || year > MAX_YEAR) return null;
  return year;
}

function scoreMatch(haystack: string, needle: string): number {
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  if (!n) return 0;
  const idx = h.indexOf(n);
  if (idx === -1) return 0;
  let s = 60 - Math.min(idx, 30);
  if (idx === 0) s += 30;                        // prefix
  else if (/\s|-/.test(h[idx - 1])) s += 18;     // word start
  if (h.length === n.length) s += 20;            // exact
  return s;
}

export interface BuildArgs {
  query: string;
  entities: Entity[];
  polities: PolitySummary[];
  limit?: number;
}

export function search({ query, entities, polities, limit = 24 }: BuildArgs): SearchResult[] {
  const q = query.trim();
  const out: SearchResult[] = [];

  if (!q) return out;

  const y = parseYearQuery(q);
  if (y !== null) {
    out.push({
      id: `year:${y}`,
      kind: "year",
      title: formatYear(y),
      subtitle: "Move the map to this year",
      score: 1000,
      year: y,
    });
  }

  for (const e of entities) {
    let s = scoreMatch(e.name, q);
    if (!s && e.category) s = scoreMatch(e.category, q) * 0.5;
    if (!s) continue;
    // prominence nudges ties, so famous names surface first
    s += e.prominence * 0.25;
    const span =
      e.kind === "event" && e.startYear === e.endYear
        ? formatYear(e.startYear)
        : `${formatYear(e.startYear)} – ${formatYear(e.endYear)}`;
    out.push({
      id: `e:${e.id}`,
      kind: e.kind,
      title: e.name,
      subtitle: e.category,
      detail: span,
      score: s,
      entity: e,
    });
  }

  const seen = new Set<string>();
  for (const p of polities) {
    if (seen.has(p.group)) continue;
    const s = scoreMatch(p.name, q);
    if (!s) continue;
    seen.add(p.group);
    out.push({
      id: `p:${p.group}`,
      kind: "polity",
      title: p.name,
      subtitle: p.tier === 0 ? "Large realm" : p.tier === 1 ? "Regional realm" : "Small realm",
      detail: "In the current snapshot",
      score: s + (p.tier === 0 ? 24 : p.tier === 1 ? 10 : 0),
      polity: p,
    });
  }

  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

export const GROUP_LABEL: Record<ResultKind, string> = {
  year: "Time",
  ruler: "Rulers",
  figure: "Figures",
  event: "Events",
  city: "Cities",
  polity: "Realms",
  action: "Actions",
};
