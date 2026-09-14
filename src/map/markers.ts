import maplibregl from "maplibre-gl";
import type { Entity } from "../types";
import type { PolityLabel } from "./borders";
import { asset } from "../util";

export function portraitSrc(p: string): string {
  return /^https?:/.test(p) ? p : asset(p);
}

// Tuning in one place. Thresholds are deliberately gentle so a few marquee
// figures show at world zoom and the long tail appears as you zoom in.
const CFG = {
  entityBase: 70, // prominence needed at zoom 2
  entityPerZoom: 9, // threshold drops this much per zoom level
  maxEntityMarkers: 350,
  labelAreaBase: 240, // planar deg^2 needed at zoom 2
  maxLabels: 70,
  eventPad: 5, // point events are catchable within +/- this many years
  boundsPad: 0.18, // fraction to grow the viewport so markers don't pop at edges
};

const FIELD_GLYPH: Record<string, string> = {
  art: "\u{1F3A8}",
  science: "\u{1F52C}",
  philosophy: "\u{1F4DC}",
  music: "\u{1F3B5}",
  literature: "\u{270D}\u{FE0F}",
  math: "\u{1F4D0}",
  invention: "⚙\u{FE0F}",
  exploration: "\u{1F9ED}",
  medicine: "⚕\u{FE0F}",
};

const EVENT_GLYPH: Record<string, string> = {
  war: "⚔\u{FE0F}",
  battle: "⚔\u{FE0F}",
  treaty: "\u{1F54A}\u{FE0F}",
  invention: "\u{1F4A1}",
  discovery: "\u{1F9ED}",
  founding: "\u{1F3DB}\u{FE0F}",
  religion: "\u{1F4D6}",
};

function entityThreshold(zoom: number): number {
  return Math.max(0, Math.min(100, CFG.entityBase - (zoom - 2) * CFG.entityPerZoom));
}

function labelAreaThreshold(zoom: number): number {
  return CFG.labelAreaBase / Math.pow(2, zoom - 2);
}

function activeAt(e: Entity, year: number): boolean {
  if (e.kind === "event" && e.startYear === e.endYear) {
    return Math.abs(year - e.startYear) <= CFG.eventPad;
  }
  return e.startYear <= year && year <= e.endYear;
}

function glyphFor(e: Entity): string {
  if (e.kind === "ruler") return "\u{1F451}"; // crown
  if (e.kind === "figure") return FIELD_GLYPH[(e.category || "").toLowerCase()] || "⭐";
  return EVENT_GLYPH[(e.category ?? "").toLowerCase()] || "⭐";
}

function ringFor(e: Entity): string {
  if (e.kind === "ruler") return "#c9a227";
  if (e.kind === "figure") return "#2f7fae";
  return "#a2402f";
}

interface Live {
  marker: maplibregl.Marker;
  el: HTMLElement;
}

export class MarkerManager {
  private map: maplibregl.Map;
  private onSelectEntity: (e: Entity) => void;
  private entities: Entity[] = [];
  private labels: PolityLabel[] = [];
  private year = 0;
  private liveEntities = new Map<string, Live>();
  private liveLabels = new Map<string, Live>();
  private rafPending = false;

  constructor(map: maplibregl.Map, onSelectEntity: (e: Entity) => void) {
    this.map = map;
    this.onSelectEntity = onSelectEntity;
    const schedule = () => this.schedule();
    map.on("move", schedule);
    map.on("zoom", schedule);
  }

  setEntities(entities: Entity[]): void {
    this.entities = entities;
    this.schedule();
  }

  setLabels(labels: PolityLabel[]): void {
    this.labels = labels;
    // labels are per-snapshot; clear old ones so stale realms don't linger
    for (const [k, live] of this.liveLabels) {
      live.marker.remove();
      this.liveLabels.delete(k);
    }
    this.schedule();
  }

  setYear(year: number): void {
    this.year = year;
    this.schedule();
  }

  private schedule(): void {
    if (this.rafPending) return;
    this.rafPending = true;
    requestAnimationFrame(() => {
      this.rafPending = false;
      this.render();
    });
  }

  private paddedBounds() {
    const b = this.map.getBounds();
    const w = b.getWest(),
      e = b.getEast(),
      s = b.getSouth(),
      n = b.getNorth();
    const dx = (e - w) * CFG.boundsPad;
    const dy = (n - s) * CFG.boundsPad;
    return { w: w - dx, e: e + dx, s: s - dy, n: n + dy };
  }

  private inView(lng: number, lat: number, box: { w: number; e: number; s: number; n: number }): boolean {
    if (lat < box.s || lat > box.n) return false;
    // handle horizontal wrap loosely by also testing +/-360
    return (lng >= box.w && lng <= box.e) ||
      (lng - 360 >= box.w && lng - 360 <= box.e) ||
      (lng + 360 >= box.w && lng + 360 <= box.e);
  }

  private render(): void {
    if (!this.map || !this.map.getCanvas()) return;
    const zoom = this.map.getZoom();
    const box = this.paddedBounds();

    // --- entities ---
    const threshold = entityThreshold(zoom);
    const desired: Entity[] = [];
    for (const e of this.entities) {
      if (e.prominence < threshold) continue;
      if (!activeAt(e, this.year)) continue;
      if (!this.inView(e.lng, e.lat, box)) continue;
      desired.push(e);
    }
    desired.sort((a, b) => b.prominence - a.prominence);
    const keep = desired.slice(0, CFG.maxEntityMarkers);
    const keepIds = new Set(keep.map((e) => e.id));

    for (const [id, live] of this.liveEntities) {
      if (!keepIds.has(id)) {
        live.marker.remove();
        this.liveEntities.delete(id);
      }
    }
    for (const e of keep) {
      let live = this.liveEntities.get(e.id);
      if (!live) {
        const el = this.buildEntityEl(e);
        const marker = new maplibregl.Marker({ element: el, anchor: "center" })
          .setLngLat([e.lng, e.lat])
          .addTo(this.map);
        live = { marker, el };
        this.liveEntities.set(e.id, live);
      }
      live.el.classList.toggle("poi--named", zoom >= 4 || e.prominence >= 85);
    }

    // --- polity labels ---
    const areaMin = labelAreaThreshold(zoom);
    const wantedLabels = this.labels
      .filter((l) => l.area >= areaMin && this.inView(l.lng, l.lat, box))
      .slice(0, CFG.maxLabels);
    const wantedKeys = new Set(wantedLabels.map((l) => l.group));
    for (const [k, live] of this.liveLabels) {
      if (!wantedKeys.has(k)) {
        live.marker.remove();
        this.liveLabels.delete(k);
      }
    }
    for (const l of wantedLabels) {
      if (this.liveLabels.has(l.group)) continue;
      const el = document.createElement("div");
      el.className = "polity-label";
      el.textContent = l.name;
      el.style.setProperty("--dot", l.color);
      const marker = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([l.lng, l.lat])
        .addTo(this.map);
      this.liveLabels.set(l.group, { marker, el });
    }
  }

  private buildEntityEl(e: Entity): HTMLElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `poi poi--${e.kind}`;
    const size = 30 + (e.prominence / 100) * 20;
    btn.style.setProperty("--size", `${size.toFixed(0)}px`);
    btn.style.setProperty("--ring", ringFor(e));
    btn.setAttribute("aria-label", e.name);

    const dot = document.createElement("span");
    dot.className = e.kind === "event" ? "poi__pin" : "poi__dot";
    if (e.portrait) {
      const img = document.createElement("img");
      img.className = "poi__img";
      img.src = portraitSrc(e.portrait);
      img.alt = e.name;
      img.loading = "lazy";
      img.onerror = () => {
        img.remove();
        const g = document.createElement("span");
        g.className = "poi__glyph";
        g.textContent = glyphFor(e);
        dot.appendChild(g);
      };
      dot.appendChild(img);
    } else {
      const g = document.createElement("span");
      g.className = "poi__glyph";
      g.textContent = glyphFor(e);
      dot.appendChild(g);
    }
    btn.appendChild(dot);

    const label = document.createElement("span");
    label.className = "poi__label";
    label.textContent = e.name;
    btn.appendChild(label);

    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      this.onSelectEntity(e);
    });
    return btn;
  }

  destroy(): void {
    for (const live of this.liveEntities.values()) live.marker.remove();
    for (const live of this.liveLabels.values()) live.marker.remove();
    this.liveEntities.clear();
    this.liveLabels.clear();
  }
}
