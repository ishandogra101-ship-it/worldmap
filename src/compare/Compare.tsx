import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { baseStyle } from "../map/mapStyle";
import { loadSnapshot } from "../map/borders";
import { OverlayEngine } from "../map/overlay";
import { loadManifest, nearestSnapshot } from "../data/snapshots";
import { mapController } from "../map/HistoricalMap";
import { store, useAtlas, select } from "../app/store";
import { Icon } from "../design/icons";
import { formatYear } from "../util";

/** Keeps a little of each side visible however far the seam is dragged. */
const MIN_SPLIT = 0.06;
const MAX_SPLIT = 0.94;

interface Held { name: string; group: string; color: string }

function polityAt(m: maplibregl.Map, lngLat: maplibregl.LngLat): Held | null {
  if (!m.getLayer("polity-fill")) return null;
  const f = m.queryRenderedFeatures(m.project(lngLat), { layers: ["polity-fill"] })[0];
  if (!f) return null;
  const p = (f.properties || {}) as Record<string, string>;
  const group = String(p.__group || "");
  if (!group) return null;
  return { name: String(p.__name || p.NAME || group), group, color: String(p.__color || "") };
}

export default function Compare() {
  const on = useAtlas((s) => s.compareYear !== null);
  return on ? <Split /> : null;
}

function Split() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const seamRef = useRef<HTMLDivElement | null>(null);
  const leftTagRef = useRef<HTMLDivElement | null>(null);
  const rightTagRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<OverlayEngine | null>(null);
  const shown = useRef<number | null>(null);
  const split = useRef(0.5);

  // --- build the second map once, tear it down when compare closes ---
  useEffect(() => {
    const host = hostRef.current;
    const a = mapController.map;
    if (!host || !a) return;

    const map = new maplibregl.Map({
      container: host,
      style: baseStyle(store.get().theme),
      center: a.getCenter(),
      zoom: a.getZoom(),
      minZoom: 1.0,
      maxZoom: 9,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      maxPitch: 0,
    });
    mapRef.current = map;
    map.touchZoomRotate.disableRotation();

    const overlay = new OverlayEngine(map, {
      onSelectEntity: () => {},
      onSelectPolity: (p) => {
        select({
          kind: "polity", name: p.name, group: p.group, color: p.color,
          tier: p.tier, area: p.area, lng: p.lng, lat: p.lat,
          snapshotYear: shown.current ?? store.get().compareYear ?? store.get().year,
        });
      },
      onHover: () => {},
    });
    overlay.setLabelsOnly(true);
    overlayRef.current = overlay;
    mapController.overlay?.setLabelsOnly(true);

    // --- one camera, two renderings ---
    let syncing = false;
    const mirror = (from: maplibregl.Map, to: maplibregl.Map) => () => {
      if (syncing) return;
      syncing = true;
      to.jumpTo({ center: from.getCenter(), zoom: from.getZoom() });
      syncing = false;
    };
    const aMoved = mirror(a, map);
    const bMoved = mirror(map, a);
    a.on("move", aMoved);
    map.on("move", bMoved);

    // --- the readout: what each year holds under the cursor, wherever it is ---
    const readout = (ev: maplibregl.MapMouseEvent) => {
      const left = polityAt(a, ev.lngLat);
      const right = polityAt(map, ev.lngLat);
      if (!left && !right) { store.set({ hover: null }); return; }
      const s = store.get();
      store.set({
        hover: {
          name: "",
          x: ev.originalEvent.clientX,
          y: ev.originalEvent.clientY,
          rows: [
            { when: formatYear(s.year), held: left },
            { when: formatYear(s.compareYear ?? s.year), held: right },
          ],
          changed: (left?.group || "") !== (right?.group || ""),
        },
      });
    };
    a.on("mousemove", readout);
    map.on("mousemove", readout);
    const leave = () => store.set({ hover: null });
    a.on("mouseout", leave);
    map.on("mouseout", leave);

    // --- the seam ---
    const applySplit = () => {
      const f = split.current;
      const w = host.clientWidth || window.innerWidth;
      const px = f * w;
      host.style.clipPath = `inset(0 0 0 ${(f * 100).toFixed(3)}%)`;
      if (seamRef.current) seamRef.current.style.left = `${px}px`;
      if (leftTagRef.current) leftTagRef.current.style.right = `${w - px + 12}px`;
      if (rightTagRef.current) rightTagRef.current.style.left = `${px + 12}px`;
      mapController.overlay?.setXRange(0, px);
      overlay.setXRange(px, w);
    };
    applySplit();
    const onResize = () => applySplit();
    window.addEventListener("resize", onResize);

    const seam = seamRef.current;
    let dragging = false;
    const move = (clientX: number) => {
      const w = host.clientWidth || window.innerWidth;
      split.current = Math.max(MIN_SPLIT, Math.min(MAX_SPLIT, clientX / w));
      applySplit();
    };
    const down = (e: PointerEvent) => {
      dragging = true;
      seam?.setPointerCapture(e.pointerId);
      seam?.classList.add("is-dragging");
      move(e.clientX);
    };
    const drag = (e: PointerEvent) => { if (dragging) move(e.clientX); };
    const up = (e: PointerEvent) => {
      dragging = false;
      seam?.releasePointerCapture(e.pointerId);
      seam?.classList.remove("is-dragging");
    };
    const key = (e: KeyboardEvent) => {
      const step = e.shiftKey ? 0.05 : 0.01;
      if (e.key === "ArrowLeft") { e.preventDefault(); move((split.current - step) * (host.clientWidth || window.innerWidth)); }
      if (e.key === "ArrowRight") { e.preventDefault(); move((split.current + step) * (host.clientWidth || window.innerWidth)); }
    };
    seam?.addEventListener("pointerdown", down);
    seam?.addEventListener("pointermove", drag);
    seam?.addEventListener("pointerup", up);
    seam?.addEventListener("pointercancel", up);
    seam?.addEventListener("keydown", key);

    // --- the right-hand year's borders ---
    const applyYear = async (year: number) => {
      overlay.setYear(year);
      const manifest = await loadManifest();
      const snap = nearestSnapshot(manifest, year);
      if (snap.year === shown.current) return;
      shown.current = snap.year;
      const { fc, polities } = await loadSnapshot(snap.file);
      const src = map.getSource("borders") as maplibregl.GeoJSONSource | undefined;
      if (src) src.setData(fc as GeoJSON.FeatureCollection);
      overlay.setPolities(polities);
    };

    let lastCompare = store.get().compareYear;
    let lastTheme = store.get().theme;
    const unsub = store.subscribe(() => {
      const s = store.get();
      if (s.compareYear !== null && s.compareYear !== lastCompare) {
        lastCompare = s.compareYear;
        void applyYear(s.compareYear);
      }
      if (s.theme !== lastTheme) {
        lastTheme = s.theme;
        map.setStyle(baseStyle(s.theme));
        map.once("styledata", () => {
          shown.current = null;
          void applyYear(store.get().compareYear ?? store.get().year);
        });
      }
    });

    map.on("load", () => {
      overlay.setEntities(store.get().entities);
      void applyYear(store.get().compareYear ?? store.get().year);
    });

    return () => {
      unsub();
      window.removeEventListener("resize", onResize);
      seam?.removeEventListener("pointerdown", down);
      seam?.removeEventListener("pointermove", drag);
      seam?.removeEventListener("pointerup", up);
      seam?.removeEventListener("pointercancel", up);
      seam?.removeEventListener("keydown", key);
      a.off("move", aMoved);
      a.off("mousemove", readout);
      a.off("mouseout", leave);
      overlay.destroy();
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
      mapController.overlay?.setXRange(-Infinity, Infinity);
      mapController.overlay?.setLabelsOnly(false);
      store.set({ hover: null });
    };
  }, []);

  const year = useAtlas((s) => s.year);
  const compareYear = useAtlas((s) => s.compareYear);

  return (
    <>
      <div className="cmp" ref={hostRef} />
      <div className="cmp__tag cmp__tag--l" ref={leftTagRef}>
        <span className="cmp__tagYear tnum">{formatYear(year)}</span>
      </div>
      <div className="cmp__tag cmp__tag--r" ref={rightTagRef}>
        <span className="cmp__tagYear tnum">{formatYear(compareYear ?? year)}</span>
      </div>
      <div
        className="cmp__seam"
        ref={seamRef}
        role="separator"
        tabIndex={0}
        aria-label="Drag to move the split between the two years"
        aria-orientation="vertical"
      >
        <span className="cmp__grip">
          <Icon name="compare" size={13} />
        </span>
      </div>
    </>
  );
}
