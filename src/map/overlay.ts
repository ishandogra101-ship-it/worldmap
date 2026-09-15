import type maplibregl from "maplibre-gl";
import type { Entity, LayerId, PolitySummary } from "../types";
import { iconSvg, eventIcon, figureIcon } from "../design/icons";
import { asset } from "../util";
import { isCultureArea } from "./kinds";

/**
 * Everything drawn *above* the map canvas: realm labels, ruler and figure
 * markers, event markers.
 *
 * All of it lives in one absolutely-positioned overlay that we project and
 * place ourselves, rather than one MapLibre Marker per item. That buys three
 * things that matter at scale: real collision detection between labels, a
 * single priority ordering across every overlay type, and DOM nodes we can
 * recycle instead of rebuilding each frame.
 */

type Kind = "label" | "ruler" | "figure" | "event" | "city";

interface Candidate {
  key: string;
  kind: Kind;
  lng: number;
  lat: number;
  weight: number;      // higher wins a collision
  w: number;           // estimated on-screen box, px
  h: number;
  entity?: Entity;
  polity?: PolitySummary;
  tier?: 0 | 1 | 2;
  subject?: { name: string; group: string; color: string };
}

interface Placed extends Candidate { x: number; y: number }

export interface OverlayCallbacks {
  onSelectEntity: (e: Entity) => void;
  onSelectPolity: (p: PolitySummary) => void;
  onHover: (info: { name: string; subtitle?: string; detail?: string; color?: string; x: number; y: number } | null) => void;
}

/**
 * How many people, events and settlements the screen may carry at this zoom.
 *
 * This was an absolute prominence gate, and its arithmetic was wrong in a way
 * nothing on screen announced. Prominence is a logarithm against 350 sitelinks,
 * so a person documented in a hundred separate Wikipedias scores 79 — under the
 * world-view gate of 82.5. Measured against the imported data, exactly one
 * person alive in 1450 cleared it. An atlas of power opened on an empty world
 * and stayed empty until you zoomed to a continent.
 *
 * A budget fixes the arithmetic and the honesty together. The screen takes its
 * N best-documented candidates from whatever the year actually holds, so a thin
 * century shows its thin best instead of nothing, and prominence keeps exactly
 * the job it is described as having: deciding who is drawn first when space runs
 * out, never who mattered.
 */
function peopleBudget(zoom: number): number {
  if (zoom < 2.2) return 14;
  if (zoom < 3.2) return 34;
  if (zoom < 4.5) return 70;
  return MAX_MARKERS;
}
function eventBudget(zoom: number): number {
  if (zoom < 2.2) return 5;
  if (zoom < 3.2) return 12;
  return 40;
}
/** Settlements reveal earlier than events: at world scale only the handful
 *  anyone would name unprompted, then steadily more as the view closes in. */
function cityBudget(zoom: number): number {
  if (zoom < 2.2) return 6;
  if (zoom < 3.2) return 16;
  return 48;
}

/**
 * A realm is labelled once it actually occupies enough of the viewport — not at a
 * fixed zoom. This is why zooming into a crowded region keeps revealing smaller
 * polities: their share of the screen grows past the threshold.
 */
const LABEL_MIN_SCREEN_AREA = 2200;

/**
 * How much of the screen a realm must hold before it is named, by zoom.
 *
 * One sampling cell is 9,216px², so a flat 2,200 threshold let any realm that
 * caught a single cell write its name — which at world scale meant Jaru naming
 * a corner of Australia beside the Russian Empire, both in the same breath. A
 * name at world scale has to be earned by holding a real share of the world;
 * closer in, the bar drops back to where any visible territory can carry one.
 */
function labelMinArea(zoom: number): number {
  if (zoom < 2.2) return 16_000;
  if (zoom < 3.2) return 8_000;
  return LABEL_MIN_SCREEN_AREA;
}

const MAX_MARKERS = 130;
const MAX_LABELS = 60;
const EVENT_WINDOW = 6; // years either side, so events are catchable while scrubbing

/**
 * Buckets each entity into every decade its marker could appear in.
 *
 * An event is catchable for EVENT_WINDOW years either side of its date, so its
 * bucket range is widened to match — otherwise scrubbing past a decade boundary
 * would blink it out a few years early.
 */
function indexByDecade(entities: Entity[]): Map<number, Entity[]> {
  const out = new Map<number, Entity[]>();
  for (const e of entities) {
    const pad = e.kind === "event" && e.startYear === e.endYear ? EVENT_WINDOW : 0;
    const from = Math.floor((e.startYear - pad) / 10);
    const to = Math.floor((e.endYear + pad) / 10);
    // a record with a nonsense span would otherwise be inserted into thousands
    // of buckets; the importer drops those, and this is the second line
    if (to - from > 40) continue;
    for (let d = from; d <= to; d++) {
      const bucket = out.get(d);
      if (bucket) bucket.push(e);
      else out.set(d, [e]);
    }
  }
  return out;
}

/**
 * Whether a marker carries its name at this zoom.
 *
 * Everything drawn is named. An unlabelled portrait is a decoration: it tells
 * the reader a person was here and refuses to say which, so the only way to
 * learn anything is to click a circle at random. Withholding the name used to
 * be how crowding was managed, but the budget above already decides how many
 * people the screen takes, and the collision box below reserves room for the
 * name — so crowding is handled where it should be, by drawing fewer people
 * rather than by drawing anonymous ones.
 *
 * Collision sizing and rendering both call this, or the box reserved is not the
 * box drawn.
 */
function isNamed(_e: Entity, _zoom: number): boolean {
  return true;
}

function activeAt(e: Entity, year: number): boolean {
  if (e.kind === "event" && e.startYear === e.endYear) {
    return Math.abs(year - e.startYear) <= EVENT_WINDOW;
  }
  return e.startYear <= year && year <= e.endYear;
}

export class OverlayEngine {
  private map: maplibregl.Map;
  private cb: OverlayCallbacks;
  private root: HTMLDivElement;
  private nodes = new Map<string, HTMLElement>();
  private candidates: Candidate[] = [];
  /**
   * Entities bucketed by decade of their active span.
   *
   * rebuild() runs on every year change, and scrubbing changes the year every
   * frame. Walking the whole list was fine for fifty curated records and is not
   * fine for the tens of thousands the Wikidata import brings. Bucketing turns
   * that per-frame scan into a lookup plus a few hundred candidates.
   */
  private byDecade = new Map<number, Entity[]>();
  private polityByGroup = new Map<string, PolitySummary>();
  /** sovereign realms visible on screen, anchored inside the viewport */
  private visibleSov: Array<{ p: PolitySummary; lng: number; lat: number; cells: number; tier: 0 | 1 | 2 }> = [];
  /** territories whose own name differs from their sovereign: vassals, subject
   *  states, hordes. The source data carries these and they are most of what
   *  makes a zoomed-in view worth reading. */
  private visibleSub: Array<{ name: string; group: string; color: string; lng: number; lat: number; cells: number }> = [];
  private year = 0;
  private layers: Record<LayerId, boolean> = {
    political: true, rulers: true, figures: true, events: true, cities: true, labels: true,
  };
  private selectedKey: string | null = null;
  private frame = 0;
  private dirty = true;
  /** Horizontal window this overlay may place in, in canvas px. Compare mode
   *  gives each side of the split its own window so no label crosses the seam. */
  private xMin = -Infinity;
  private xMax = Infinity;
  /** Compare mode reads the shape of realms, not the people in them. */
  private labelsOnly = false;
  private hoveredKey: string | null = null;

  constructor(map: maplibregl.Map, cb: OverlayCallbacks) {
    this.map = map;
    this.cb = cb;
    this.root = document.createElement("div");
    this.root.className = "overlay";
    map.getContainer().appendChild(this.root);

    const onMove = () => this.schedule();
    map.on("move", onMove);
    map.on("zoom", onMove);
    const onSettle = () => { this.sampleVisibleRealms(); this.schedule(); };
    map.on("moveend", onSettle);
    map.on("zoomend", onSettle);
    // setData is asynchronous: querying before the frame is drawn returns nothing,
    // so wait for the map to report itself fully rendered.
    map.on("idle", onSettle);
    map.on("resize", () => { this.sampleVisibleRealms(); this.schedule(); });
    this.schedule();
  }

  setEntities(entities: Entity[]): void {
    this.byDecade = indexByDecade(entities);
    this.dirty = true;
    this.schedule();
  }
  setPolities(polities: PolitySummary[]): void {
    this.polityByGroup = new Map(polities.map((p) => [p.group, p]));
    this.sampleVisibleRealms();
    this.dirty = true;
    this.schedule();
  }
  setYear(year: number): void {
    this.year = year;
    this.dirty = true;
    // a marker under the cursor may vanish with the year; don't strand its tooltip
    this.clearHover();
    this.schedule();
  }

  private clearHover(): void {
    if (this.hoveredKey !== null) {
      this.hoveredKey = null;
      this.cb.onHover(null);
    }
  }
  setLayers(layers: Record<LayerId, boolean>): void { this.layers = layers; this.dirty = true; this.schedule(); }

  setXRange(min: number, max: number): void {
    if (min === this.xMin && max === this.xMax) return;
    this.xMin = min; this.xMax = max;
    this.clearHover();
    this.schedule();
  }

  setLabelsOnly(on: boolean): void {
    if (on === this.labelsOnly) return;
    this.labelsOnly = on;
    this.dirty = true;
    this.clearHover();
    this.schedule();
  }
  setSelectedKey(key: string | null): void { this.selectedKey = key; this.schedule(); }

  /**
   * Label placement from what is actually on screen.
   *
   * A realm's geometric centre is the wrong anchor once you zoom in: the centre
   * of Russia is nowhere near the screen when you are looking at Moscow, so the
   * label would vanish precisely when it matters. Instead we sample a coarse grid
   * of screen points, ask the map which realm sits under each, and anchor the
   * label at the mean of the points we actually hit. That also gives a true
   * measure of how much of the viewport a realm occupies, which is what decides
   * whether it earns a label at all.
   *
   * Run on moveend rather than per frame — it queries rendered features.
   */
  private sampleVisibleRealms(): void {
    const map = this.map;
    if (!map || !map.getLayer || !map.getLayer("polity-fill")) {
      this.visibleSov = []; this.visibleSub = []; return;
    }
    const canvas = map.getCanvas();
    const vw = canvas.clientWidth;
    const vh = canvas.clientHeight;
    if (vw === 0 || vh === 0) return;

    const zoom = map.getZoom();
    const STEP = 96;
    // Two accumulators per realm: every cell it occupies, and only the cells of
    // its homeland. A maritime empire's cells average out somewhere it does not
    // govern from — in 1850 that put "Portugal" across Brazil, "Denmark" across
    // Greenland and "Spain" across Mexico, each reading as a plain mistake.
    type Cell = { sx: number; sy: number; n: number; hx: number; hy: number; hn: number };
    const sov = new Map<string, Cell>();
    const sub = new Map<string, { sx: number; sy: number; n: number; name: string; group: string }>();

    for (let x = STEP / 2; x < vw; x += STEP) {
      for (let y = STEP / 2; y < vh; y += STEP) {
        let feats;
        try {
          feats = map.queryRenderedFeatures([x, y], { layers: ["polity-fill"] });
        } catch { continue; }
        const f = feats && feats[0];
        if (!f) continue;
        const props = f.properties as Record<string, unknown>;
        const group = String(props.__group || "");
        if (!group) continue;
        let e = sov.get(group);
        if (!e) { e = { sx: 0, sy: 0, n: 0, hx: 0, hy: 0, hn: 0 }; sov.set(group, e); }
        e.sx += x; e.sy += y; e.n++;

        const own = String(props.NAME || "");
        if (own === group) { e.hx += x; e.hy += y; e.hn++; }
        if (own && own !== group) {
          const key = group + "|" + own;
          let t = sub.get(key);
          if (!t) { t = { sx: 0, sy: 0, n: 0, name: own, group }; sub.set(key, t); }
          t.sx += x; t.sy += y; t.n++;
        }
      }
    }

    let maxCells = 0;
    for (const e of sov.values()) if (e.n > maxCells) maxCells = e.n;

    const outSov: typeof this.visibleSov = [];
    for (const [group, e] of sov) {
      const p = this.polityByGroup.get(group);
      if (!p) continue;
      // Where the name sits, best source first.
      //
      // The realm's true homeland centroid is exact, computed from the geometry
      // rather than from a 96px sampling grid that misses Portugal entirely at
      // world scale — which is how "Portugal" ended up written across Brazil.
      // It is only usable while it is actually on screen, so sampled homeland
      // cells come next, and the mean of everything held is the last resort.
      let ll: { lng: number; lat: number };
      const homePt = p.hasHome ? map.project([p.lng, p.lat]) : null;
      const onScreen = homePt
        && homePt.x > 0 && homePt.x < vw && homePt.y > 0 && homePt.y < vh;
      if (onScreen) ll = { lng: p.lng, lat: p.lat };
      else if (e.hn > 0) ll = map.unproject([e.hx / e.hn, e.hy / e.hn]);
      else ll = map.unproject([e.sx / e.n, e.sy / e.n]);
      // Tier by share of *this view*, not of the whole world. Otherwise France
      // reads as minor next to a bold Kalmar Union while you are looking at France.
      const share = maxCells ? e.n / maxCells : 0;
      const tier: 0 | 1 | 2 = share >= 0.45 ? 0 : share >= 0.14 ? 1 : 2;
      outSov.push({ p, lng: ll.lng, lat: ll.lat, cells: e.n, tier });
    }
    outSov.sort((a, b) => b.cells - a.cells);
    this.visibleSov = outSov;

    const outSub: typeof this.visibleSub = [];
    for (const t of sub.values()) {
      // A vassal earns its name with real presence, and at world scale not at
      // all: "Jaru" naming the whole of Australia is the right name at entirely
      // the wrong altitude.
      // At world scale a subject does not name itself at all: "Jaru" written
      // across Australia is the right name at entirely the wrong altitude.
      if (zoom < 2.4) continue;
      if (t.n < (zoom < 3.2 ? 3 : 2)) continue;
      const p = this.polityByGroup.get(t.group);
      const ll = map.unproject([t.sx / t.n, t.sy / t.n]);
      outSub.push({
        name: t.name, group: t.group, color: p ? p.color : "#888",
        lng: ll.lng, lat: ll.lat, cells: t.n,
      });
    }
    outSub.sort((a, b) => b.cells - a.cells);
    this.visibleSub = outSub;

    this.dirty = true;
  }

  private schedule(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.render();
    });
  }

  /** Rebuild the candidate pool. Only when year / data / layers change. */
  private rebuild(): void {
    const c: Candidate[] = [];

    if (this.layers.labels) {
      const CELL_AREA = 96 * 96;
      const minArea = labelMinArea(this.map.getZoom());
      for (const v of this.visibleSov) {
        // A realm is named if it fills enough of this view, or if it is one of
        // the handful of world powers of its year by total extent. The second
        // test is what keeps Britain and France on a world map where they are
        // physically small but politically anything but.
        const isWorldPower = v.p.tier === 0;
        if (!isWorldPower && v.tier > 0 && v.cells * CELL_AREA < minArea) continue;
        const base = v.tier === 0 ? 950 : v.tier === 1 ? 640 : 420;
        // tier 0 renders uppercase with wide tracking, so it needs a much
        // larger allowance than a mixed-case label of the same length
        const est = v.p.name.length * (v.tier === 0 ? 8.9 : v.tier === 1 ? 6.7 : 6.0);
        c.push({
          key: `L:${v.p.group}`,
          kind: "label",
          lng: v.lng, lat: v.lat,
          weight: base + Math.min(110, v.cells * 6),
          w: est + 10, h: 16,
          polity: v.p,
          tier: v.tier,
        });
      }
      // subjects sit beneath every sovereign in the ordering, so they fill in
      // only once the sovereigns have taken the space they need
      for (const v of this.visibleSub) {
        c.push({
          key: `S:${v.group}|${v.name}`,
          kind: "label",
          lng: v.lng, lat: v.lat,
          weight: 300 + Math.min(80, v.cells * 5),
          w: v.name.length * 5.2 + 10, h: 15,
          subject: v,
        });
      }
    }

    for (const e of this.byDecade.get(Math.floor(this.year / 10)) ?? []) {
      if (!activeAt(e, this.year)) continue;
      if (e.kind === "ruler" && !this.layers.rulers) continue;
      if (e.kind === "figure" && !this.layers.figures) continue;
      if (e.kind === "event" && !this.layers.events) continue;
      if (e.kind === "city" && !this.layers.cities) continue;
      const size = e.kind === "event" ? 24 : e.kind === "city" ? 16 : 28 + (e.prominence / 100) * 12;
      const weight =
        e.kind === "ruler" ? 700 + e.prominence * 2
        : e.kind === "figure" ? 660 + e.prominence * 2
        : e.kind === "city" ? 700 + e.prominence * 2
        : 520 + e.prominence * 1.5;
      c.push({
        key: `${e.kind[0].toUpperCase()}:${e.id}`,
        kind: e.kind as Kind,
        lng: e.lng, lat: e.lat,
        weight,
        w: size + 6, h: size + 6,
        entity: e,
      });
    }

    // Sorted so the render pass can stop as soon as a budget is filled: the
    // best-documented candidates are the ones it reaches first. Labels sort
    // above everything because they carry no prominence and are budgeted
    // separately, by MAX_LABELS.
    c.sort((a, b) => {
      if ((a.kind === "label") !== (b.kind === "label")) return a.kind === "label" ? -1 : 1;
      return (b.entity?.prominence ?? 0) - (a.entity?.prominence ?? 0);
    });

    this.candidates = c;
    this.dirty = false;
  }

  private render(): void {
    const map = this.map;
    if (!map || !map.getCanvas()) return;
    if (this.dirty) this.rebuild();

    const zoom = map.getZoom();
    const canvas = map.getCanvas();
    const vw = canvas.clientWidth;
    const vh = canvas.clientHeight;
    const pad = 80;

    // 1. project, cull to viewport, and take each kind's best until its budget
    //    is spent. Candidates arrive in prominence order (see rebuild), so the
    //    walk can stop early: at world scale it settles after a few dozen
    //    projections however many people the year holds.
    const budget = {
      person: peopleBudget(zoom),
      event: eventBudget(zoom),
      city: cityBudget(zoom),
    };
    const taken = { person: 0, event: 0, city: 0 };
    const slot = (k: Candidate["kind"]) =>
      k === "event" ? "event" as const : k === "city" ? "city" as const : "person" as const;

    const xLo = Math.max(0, this.xMin);
    const xHi = Math.min(vw, this.xMax);

    const visible: Placed[] = [];
    for (let cand of this.candidates) {
      if (this.labelsOnly && cand.kind !== "label") continue;
      const s = cand.kind === "label" ? null : slot(cand.kind);
      if (s && taken[s] >= budget[s]) continue;
      const pt = map.project([cand.lng, cand.lat]);
      if (cand.entity && isNamed(cand.entity, zoom)) {
        // The circle was the whole collision box, so two markers could sit a
        // comfortable distance apart and still have their names written across
        // each other. With fifty curated records that almost never happened;
        // with eighteen thousand it is constant. 150px is the CSS clamp on a
        // marker name, 5.6px a per-character estimate at its size.
        const nameW = Math.min(150, cand.entity.name.length * 5.6) + 8;
        cand = { ...cand, w: Math.max(cand.w, nameW), h: cand.h + 15 };
      }
      if (cand.kind === "label") {
        // a label must fit fully inside its window, or it reads as clipped text
        const m = 10;
        if (
          pt.x - cand.w / 2 < xLo + m || pt.x + cand.w / 2 > xHi - m ||
          pt.y - cand.h / 2 < m || pt.y + cand.h / 2 > vh - m
        ) continue;
      } else if (
        pt.x < Math.max(-pad, xLo) || pt.x > Math.min(vw + pad, xHi) ||
        pt.y < -pad || pt.y > vh + pad
      ) {
        continue;
      }
      if (s) taken[s]++;
      visible.push({ ...cand, x: pt.x, y: pt.y });
    }

    // 2. priority order, then greedy collision.
    //
    // Once the view is regional, a settlement outranks the realm label: the
    // realm is already obvious from the fill, and the city is the new fact.
    // Without this, "Aztec Empire" sits exactly on Tenochtitlan and hides it.
    const cityBoost = zoom >= 3.5 ? 420 : 0;
    // At world and continental scale the political geography outranks any one
    // person: a portrait of Lincoln was winning the space over "United States
    // of America", leaving the country it sits in unnamed. Close in, that
    // inverts — the realm is obvious from the fill and the person is the fact.
    const labelBoost = zoom < 3 ? 520 : 0;
    const rank = (c: Placed) =>
      c.weight
      + (c.kind === "city" ? cityBoost : 0)
      + (c.kind === "label" ? labelBoost : 0);
    visible.sort((a, b) => rank(b) - rank(a));
    const placed: Placed[] = [];
    let markerCount = 0;
    let labelCount = 0;

    for (const item of visible) {
      const isLabel = item.kind === "label";
      if (isLabel && labelCount >= MAX_LABELS) continue;
      if (!isLabel && markerCount >= MAX_MARKERS) continue;

      const left = item.x - item.w / 2;
      const top = item.y - item.h / 2;
      let hit = false;
      for (const q of placed) {
        if (
          left < q.x + q.w / 2 && left + item.w > q.x - q.w / 2 &&
          top < q.y + q.h / 2 && top + item.h > q.y - q.h / 2
        ) { hit = true; break; }
      }
      // the selected item always survives collision
      if (hit && item.key !== this.selectedKey) continue;
      placed.push(item);
      if (isLabel) labelCount++; else markerCount++;
    }

    // 3. reconcile DOM
    const keep = new Set<string>();
    for (const item of placed) {
      keep.add(item.key);
      let el = this.nodes.get(item.key);
      if (!el) {
        el = this.build(item);
        this.nodes.set(item.key, el);
        this.root.appendChild(el);
      }
      el.style.transform = `translate3d(${Math.round(item.x)}px, ${Math.round(item.y)}px, 0) translate(-50%, -50%)`;
      el.classList.toggle("is-selected", item.key === this.selectedKey);
      // A bare symbol on a map means nothing. Name the marquee figures always,
      // and everyone else as soon as the view is close enough to have room.
      if (item.entity) {
        el.classList.toggle("is-named", isNamed(item.entity, zoom));
      }
    }
    for (const [key, el] of this.nodes) {
      if (!keep.has(key)) {
        if (this.hoveredKey === key) this.clearHover();
        el.remove();
        this.nodes.delete(key);
      }
    }
  }

  private build(item: Candidate): HTMLElement {
    if (item.kind === "label") {
      return item.subject
        ? this.buildSubjectLabel(item.subject)
        : this.buildLabel(item.polity!, item.tier ?? 2);
    }
    return this.buildMarker(item.entity!, item.kind);
  }

  private buildSubjectLabel(v: { name: string; group: string; color: string }): HTMLElement {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "ov-label ov-label--sub";
    el.textContent = v.name;
    el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const p = this.polityByGroup.get(v.group);
      if (p) this.cb.onSelectPolity({ ...p, name: v.name, group: v.group });
    });
    el.addEventListener("pointerenter", (ev) => {
      this.hoveredKey = `S:${v.group}|${v.name}`;
      this.cb.onHover({
        name: v.name,
        subtitle: v.group !== v.name ? `Subject to ${v.group}` : undefined,
        color: v.color,
        x: (ev as PointerEvent).clientX,
        y: (ev as PointerEvent).clientY,
      });
    });
    el.addEventListener("pointerleave", () => this.clearHover());
    return el;
  }

  private buildLabel(p: PolitySummary, tier: 0 | 1 | 2): HTMLElement {
    const el = document.createElement("button");
    el.type = "button";
    const people = isCultureArea(p.name);
    el.className = `ov-label ov-label--t${tier}${people ? " ov-label--people" : ""}`;
    el.textContent = p.name;
    el.style.setProperty("--realm", p.color);
    el.addEventListener("click", (ev) => { ev.stopPropagation(); this.cb.onSelectPolity(p); });
    el.addEventListener("pointerenter", (ev) => {
      this.hoveredKey = `L:${p.group}`;
      this.cb.onHover({
        name: p.name,
        subtitle: people
          ? "A people, not a state"
          : p.tier === 0 ? "Large realm" : p.tier === 1 ? "Regional realm" : "Small realm",
        detail: undefined,
        color: p.color,
        x: (ev as PointerEvent).clientX,
        y: (ev as PointerEvent).clientY,
      });
    });
    el.addEventListener("pointerleave", () => this.clearHover());
    return el;
  }

  private buildMarker(e: Entity, kind: Kind): HTMLElement {
    const el = document.createElement("button");
    el.type = "button";
    el.className = `ov-marker ov-marker--${kind}`;
    const size = kind === "event" ? 24 : 28 + (e.prominence / 100) * 12;
    el.style.setProperty("--size", `${Math.round(size)}px`);
    el.setAttribute("aria-label", e.name);

    const dot = document.createElement("span");
    dot.className = "ov-marker__shape";

    if (kind === "city") {
      // a settlement reads as a place, not a person: a survey dot, always named
      dot.classList.add("ov-marker__dot");
    } else if (e.portrait) {
      const img = document.createElement("img");
      img.className = "ov-marker__img";
      img.src = /^https?:/.test(e.portrait) ? e.portrait : asset(e.portrait);
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      img.onerror = () => {
        img.remove();
        dot.insertAdjacentHTML("beforeend", iconSvg(kind === "ruler" ? "ruler" : figureIcon(e.category), 15));
      };
      dot.appendChild(img);
    } else {
      const name = kind === "ruler" ? "ruler" : kind === "event" ? eventIcon(e.category) : figureIcon(e.category);
      dot.insertAdjacentHTML("beforeend", iconSvg(name, kind === "event" ? 13 : 15));
    }
    el.appendChild(dot);

    const label = document.createElement("span");
    label.className = "ov-marker__name";
    label.textContent = e.name;
    el.appendChild(label);

    el.addEventListener("click", (ev) => { ev.stopPropagation(); this.cb.onSelectEntity(e); });
    el.addEventListener("pointerenter", (ev) => {
      this.hoveredKey = `${e.kind[0].toUpperCase()}:${e.id}`;
      const years = e.kind === "event" && e.startYear === e.endYear
        ? undefined
        : `${Math.abs(e.startYear)}${e.startYear < 0 ? " BCE" : ""} – ${Math.abs(e.endYear)}${e.endYear < 0 ? " BCE" : ""}`;
      this.cb.onHover({
        name: e.name,
        subtitle: e.category,
        detail: years,
        x: (ev as PointerEvent).clientX,
        y: (ev as PointerEvent).clientY,
      });
    });
    el.addEventListener("pointerleave", () => this.clearHover());
    return el;
  }

  destroy(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.nodes.forEach((el) => el.remove());
    this.nodes.clear();
    this.root.remove();
  }
}
