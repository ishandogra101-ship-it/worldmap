import { useEffect, useReducer, useRef } from "react";
import type { Entity, LayerId, PolitySummary, Selection, HoverInfo } from "../types";

export type Theme = "dark" | "light";

export interface AtlasState {
  /** the year the user has chosen */
  year: number;
  /** the year actually drawn (nearest mapped snapshot <= year) */
  snapshotYear: number | null;
  theme: Theme;
  zoom: number;
  playing: boolean;
  selection: Selection | null;
  hover: HoverInfo | null;
  entities: Entity[];
  polities: PolitySummary[];
  layers: Record<LayerId, boolean>;
  commandOpen: boolean;
  aboutOpen: boolean;
  /** entity or polity the timeline is scoped to, if any */
  followed: { label: string; from: number; to: number } | null;
  booted: boolean;
  loadingMap: boolean;
}

const THEME_KEY = "atlas.theme";
const SEEN_KEY = "atlas.seen";

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch { /* private mode */ }
  return "dark";
}

export function hasVisitedBefore(): boolean {
  try { return localStorage.getItem(SEEN_KEY) === "1"; } catch { return false; }
}
export function markVisited(): void {
  try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* ignore */ }
}

const initial: AtlasState = {
  year: 1450,
  snapshotYear: null,
  theme: initialTheme(),
  zoom: 1.55,
  playing: false,
  selection: null,
  hover: null,
  entities: [],
  polities: [],
  layers: { political: true, rulers: true, figures: true, events: true, cities: true, labels: true },
  commandOpen: false,
  aboutOpen: false,
  followed: null,
  booted: false,
  loadingMap: true,
};

type Listener = () => void;

class AtlasStore {
  private state: AtlasState = initial;
  private listeners = new Set<Listener>();

  get(): AtlasState { return this.state; }

  set(patch: Partial<AtlasState> | ((s: AtlasState) => Partial<AtlasState>)): void {
    const next = typeof patch === "function" ? patch(this.state) : patch;
    let changed = false;
    for (const k of Object.keys(next) as (keyof AtlasState)[]) {
      if (!Object.is(this.state[k], next[k])) { changed = true; break; }
    }
    if (!changed) return;
    this.state = { ...this.state, ...next };
    this.listeners.forEach((l) => l());
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => { this.listeners.delete(l); };
  }
}

export const store = new AtlasStore();

/**
 * Subscribe to a slice. Components only re-render when their own slice changes,
 * so dragging the timeline doesn't rebuild the tree — the map reads the store
 * imperatively instead.
 */
export function useAtlas<S>(
  select: (s: AtlasState) => S,
  isEqual: (a: S, b: S) => boolean = Object.is,
): S {
  const [, force] = useReducer((c: number) => c + 1, 0);
  const selectRef = useRef(select);
  selectRef.current = select;
  const valueRef = useRef<S>(select(store.get()));

  const current = select(store.get());
  if (!isEqual(valueRef.current, current)) valueRef.current = current;

  useEffect(() => {
    return store.subscribe(() => {
      const next = selectRef.current(store.get());
      if (!isEqual(valueRef.current, next)) {
        valueRef.current = next;
        force();
      }
    });
  }, [isEqual]);

  return valueRef.current;
}

export function shallowArrayEqual<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
  return true;
}

// ---- actions ----

export const MIN_YEAR = -3000;
export const MAX_YEAR = 2026;

export function setYear(year: number): void {
  const clamped = Math.max(MIN_YEAR, Math.min(MAX_YEAR, Math.round(year)));
  store.set({ year: clamped });
}

export function setTheme(theme: Theme): void {
  store.set({ theme });
  document.documentElement.setAttribute("data-theme", theme);
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ }
}

export function toggleTheme(): void {
  setTheme(store.get().theme === "dark" ? "light" : "dark");
}

export function select(selection: Selection | null): void {
  store.set({ selection });
}

export function toggleLayer(id: LayerId): void {
  const layers = { ...store.get().layers, [id]: !store.get().layers[id] };
  store.set({ layers });
}

export function follow(label: string, from: number, to: number): void {
  store.set({ followed: { label, from, to } });
}
export function unfollow(): void {
  store.set({ followed: null });
}
