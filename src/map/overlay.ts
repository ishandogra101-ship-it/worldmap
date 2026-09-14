import type maplibregl from "maplibre-gl";
import type { Entity, LayerId, PolitySummary } from "../types";
import { iconSvg, eventIcon, figureIcon } from "../design/icons";
import { asset } from "../util";

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

type Kind = "label" | "ruler" | "figure" | "event";

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
}

interface Placed extends Candidate { x: number; y: number }

export interface OverlayCallbacks {
  onSelectEntity: (e: Entity) => void;
  onSelectPolity: (p: PolitySummary) => void;
  onHover: (info: { name: string; subtitle?: string; detail?: string; color?: string; x: number; y: number } | null) => void;
}

/** Visible-at-this-zoom thresholds. Tuned so world view stays calm. */
function peopleThreshold(zoom: number): number {
  return Math.max(0, Math.min(100, 78 - (zoom - 2) * 10));
}
function eventThreshold(zoom: number): number {
  return Math.max(0, Math.min(100, 84 - (zoom - 2) * 11));
}

/**
 * A realm is labelled once it actually occupies enough of the viewport — not at a
 * fixed zoom. This is why zooming into a crowded region keeps revealing smaller
 * polities: their share of the screen grows past the threshold.
 */
const LABEL_MIN_SCREEN_AREA = 2200;

const MAX_MARKERS = 130;
const MAX_LABELS = 60;
const EVENT_WINDOW = 6; // years either side, so events are catchable while scrubbing

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
  private entities: Entity[] = [];
  private polityByGroup = new Map<string, PolitySummary>();
  /** realms actually visible on screen, anchored to a point inside the viewport */
  private visibleLabels: Array<{ p: PolitySummary; lng: number; lat: number; cells: number }> = [];
  private year = 0;
  private layers: Record<LayerId, boolean> = {
    political: true, rulers: true, figures: true, events: true, labels: true,
  };
  private selectedKey: string | null = null;
  private frame = 0;
  private dirty = true;
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

  setEntities(entities: Entity[]): void { this.entities = entities; this.dirty = true; this.schedule(); }
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
    if (!map || !map.getLayer || !map.getLayer("polity-fill")) { this.visibleLabels = []; return; }
    const canvas = map.getCanvas();
    const vw = canvas.clientWidth;
    const vh = canvas.clientHeight;
    if (vw === 0 || vh === 0) return;

    const STEP = 96;
    const acc = new Map<string, { sx: number; sy: number; n: number }>();
    for (let x = STEP / 2; x < vw; x += STEP) {
      for (let y = STEP / 2; y < vh; y += STEP) {
        let feats;
        try {
          feats = map.queryRenderedFeatures([x, y], { layers: ["polity-fill"] });
        } catch { continue; }
        const f = feats && feats[0];
        if (!f) continue;
        const group = String((f.properties as Record<string, unknown>).__group || "");
        if (!group) continue;
        let e = acc.get(group);
        if (!e) { e = { sx: 0, sy: 0, n: 0 }; acc.set(group, e); }
        e.sx += x; e.sy += y; e.n++;
      }
    }

    const out: Array<{ p: PolitySummary; lng: number; lat: number; cells: number }> = [];
    for (const [group, e] of acc) {
      const p = this.polityByGroup.get(group);
      if (!p) continue;
      const ll = map.unproject([e.sx / e.n, e.sy / e.n]);
      out.push({ p, lng: ll.lng, lat: ll.lat, cells: e.n });
    }
    out.sort((a, b) => b.cells - a.cells);
    this.visibleLabels = out;
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
      for (const v of this.visibleLabels) {
        // must occupy a real share of the viewport to earn a name
        if (v.cells * CELL_AREA < LABEL_MIN_SCREEN_AREA) continue;
        const p = v.p;
        const base = p.tier === 0 ? 950 : p.tier === 1 ? 620 : 380;
        const est = p.name.length * (p.tier === 0 ? 6.4 : 5.8);
        c.push({
          key: `L:${p.group}`,
          kind: "label",
          lng: v.lng, lat: v.lat,
          weight: base + Math.min(120, v.cells * 6),
          w: est + 10, h: 16,
          polity: p,
        });
      }
    }

    for (const e of this.entities) {
      if (!activeAt(e, this.year)) continue;
      if (e.kind === "ruler" && !this.layers.rulers) continue;
      if (e.kind === "figure" && !this.layers.figures) continue;
      if (e.kind === "event" && !this.layers.events) continue;
      const size = e.kind === "event" ? 24 : 28 + (e.prominence / 100) * 12;
      const weight =
        e.kind === "ruler" ? 700 + e.prominence * 2
        : e.kind === "figure" ? 660 + e.prominence * 2
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

    const pThresh = peopleThreshold(zoom);
    const eThresh = eventThreshold(zoom);

    // 1. gate by zoom rules, project, cull to viewport
    const visible: Placed[] = [];
    for (const cand of this.candidates) {
      if (cand.kind === "event") {
        if (cand.entity!.prominence < eThresh) continue;
      } else if (cand.kind !== "label") {
        if (cand.entity!.prominence < pThresh) continue;
      }
      const pt = map.project([cand.lng, cand.lat]);
      if (cand.kind === "label") {
        // a label must fit fully on screen, or it reads as clipped text
        const m = 10;
        if (
          pt.x - cand.w / 2 < m || pt.x + cand.w / 2 > vw - m ||
          pt.y - cand.h / 2 < m || pt.y + cand.h / 2 > vh - m
        ) continue;
      } else if (pt.x < -pad || pt.y < -pad || pt.x > vw + pad || pt.y > vh + pad) {
        continue;
      }
      visible.push({ ...cand, x: pt.x, y: pt.y });
    }

    // 2. priority order, then greedy collision
    visible.sort((a, b) => b.weight - a.weight);
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
      if (item.entity) el.classList.toggle("is-named", item.entity.prominence >= 86);
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
    if (item.kind === "label") return this.buildLabel(item.polity!);
    return this.buildMarker(item.entity!, item.kind);
  }

  private buildLabel(p: PolitySummary): HTMLElement {
    const el = document.createElement("button");
    el.type = "button";
    el.className = `ov-label ov-label--t${p.tier}`;
    el.textContent = p.name;
    el.style.setProperty("--realm", p.color);
    el.addEventListener("click", (ev) => { ev.stopPropagation(); this.cb.onSelectPolity(p); });
    el.addEventListener("pointerenter", (ev) => {
      this.hoveredKey = `L:${p.group}`;
      this.cb.onHover({
        name: p.name,
        subtitle: p.tier === 0 ? "Major realm" : p.tier === 1 ? "Regional power" : "Minor polity",
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

    if (e.portrait) {
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
