import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { baseStyle, NO_MATCH } from "./mapStyle";
import { loadSnapshot } from "./borders";
import { OverlayEngine } from "./overlay";
import { loadManifest, nearestSnapshot } from "../data/snapshots";
import { store, select } from "../app/store";
import type { Entity, PolitySummary } from "../types";

/** Imperative handle so search, the palette and panels can drive the camera. */
export const mapController = {
  map: null as maplibregl.Map | null,
  overlay: null as OverlayEngine | null,
  flyTo(lng: number, lat: number, zoom?: number) {
    const m = this.map;
    if (!m) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const target = { center: [lng, lat] as [number, number], zoom: zoom ?? Math.max(m.getZoom(), 4.2) };
    if (reduce) m.jumpTo(target);
    else m.flyTo({ ...target, speed: 1.1, curve: 1.42, essential: true });
  },
  /** Frame a realm using its label anchor; area gives a sensible zoom. */
  frameEntity(e: Entity) { this.flyTo(e.lng, e.lat, 4.6); },
  framePolity(p: PolitySummary) {
    const z = p.area > 400 ? 2.6 : p.area > 80 ? 3.6 : p.area > 12 ? 4.6 : 5.6;
    this.flyTo(p.lng, p.lat, z);
  },
};

export default function HistoricalMap() {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<OverlayEngine | null>(null);
  const shownSnapshot = useRef<number | null>(null);
  const currentTheme = useRef(store.get().theme);

  useEffect(() => {
    if (!ref.current) return;
    const s = store.get();

    const map = new maplibregl.Map({
      container: ref.current,
      style: baseStyle(s.theme),
      center: [12, 22],
      zoom: s.zoom,
      minZoom: 1.0,
      maxZoom: 9,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      maxPitch: 0,
    });
    mapRef.current = map;
    mapController.map = map;
    (window as unknown as { __map?: maplibregl.Map }).__map = map;
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

    const overlay = new OverlayEngine(map, {
      onSelectEntity: (e) => select({ kind: "entity", entity: e }),
      onSelectPolity: (p) => {
        select({
          kind: "polity", name: p.name, group: p.group, color: p.color,
          tier: p.tier, area: p.area, lng: p.lng, lat: p.lat,
          snapshotYear: shownSnapshot.current ?? store.get().year,
        });
      },
      onHover: (info) => store.set({ hover: info }),
    });
    overlayRef.current = overlay;
    mapController.overlay = overlay;

    map.on("zoom", () => store.set({ zoom: map.getZoom() }));

    map.on("click", "polity-fill", (ev) => {
      const f = ev.features && ev.features[0];
      if (!f) return;
      const p = f.properties as Record<string, string | number>;
      const group = String(p.__group || "");
      if (!group) return;
      select({
        kind: "polity",
        name: String(p.__name || p.NAME || group),
        group,
        subjectTo: p.SUBJECTO ? String(p.SUBJECTO) : undefined,
        partOf: p.PARTOF ? String(p.PARTOF) : undefined,
        color: String(p.__color || "#888"),
        // tier 0 is the largest band, so `||` would read it as missing and
        // relabel every major realm as a small one
        tier: (p.__tier === undefined ? 2 : Number(p.__tier)) as 0 | 1 | 2,
        area: 0,
        lng: ev.lngLat.lng,
        lat: ev.lngLat.lat,
        snapshotYear: shownSnapshot.current ?? store.get().year,
      });
    });
    map.on("click", (ev) => {
      // clicking bare ocean clears the selection
      const hits = map.queryRenderedFeatures(ev.point, { layers: ["polity-fill"] });
      if (hits.length === 0) select(null);
    });

    let hoverGroup = "";
    map.on("mousemove", "polity-fill", (ev) => {
      const f = ev.features && ev.features[0];
      const p = (f?.properties || {}) as Record<string, string>;
      const group = String(p.__group || "");
      map.getCanvas().style.cursor = group ? "pointer" : "";
      if (group !== hoverGroup) {
        hoverGroup = group;
        if (map.getLayer("polity-hover")) {
          map.setFilter("polity-hover", ["==", ["get", "__group"], group || NO_MATCH]);
        }
      }
      if (group && store.get().compareYear === null) {
        store.set({
          hover: {
            name: String(p.__name || p.NAME || group),
            subtitle: p.SUBJECTO && p.SUBJECTO !== p.NAME ? `Subject to ${p.SUBJECTO}` : undefined,
            color: String(p.__color || ""),
            x: ev.originalEvent.clientX,
            y: ev.originalEvent.clientY,
          },
        });
      }
    });
    map.on("mouseleave", "polity-fill", () => {
      hoverGroup = "";
      map.getCanvas().style.cursor = "";
      if (map.getLayer("polity-hover")) {
        map.setFilter("polity-hover", ["==", ["get", "__group"], NO_MATCH]);
      }
      if (store.get().compareYear === null) store.set({ hover: null });
    });

    // --- react to store changes imperatively (no React re-render on scrub) ---
    let lastYear = -Infinity;
    let lastTheme = s.theme;
    let lastLayers = s.layers;
    let lastSelection = s.selection;

    /**
     * Swap the borders to the snapshot nearest this year.
     *
     * Every await here is a chance for the answer to arrive out of order, and
     * it did. Scrubbing 1815 -> 1790 -> 1815 started a fetch for 1800 that
     * landed after the one for 1815, so the map drew 1800 while the readout,
     * the panel headers and the before-and-after rows all said 1815. The atlas
     * was stating a year it was not showing, which is the one failure that
     * makes every other fact on screen unsafe: the Sikh Empire appeared under a
     * header reading "As drawn in 1815 CE" beside a note saying it is mapped
     * only in 1800.
     *
     * Two rules fix it. A sequence token taken before the first await, so a
     * superseded load cannot write anything. And shownSnapshot moves only once
     * the geometry is actually on the map, so it always names what is drawn —
     * previously it was set on intent, which let the early-return path keep
     * re-asserting a year whose data had been overwritten.
     */
    let loadSeq = 0;
    const applyYear = async (year: number) => {
      const seq = ++loadSeq;
      overlay.setYear(year);
      const manifest = await loadManifest();
      if (seq !== loadSeq) return;
      const snap = nearestSnapshot(manifest, year);
      if (snap.year === shownSnapshot.current) {
        store.set({ snapshotYear: snap.year, loadingMap: false });
        return;
      }
      const { fc, polities } = await loadSnapshot(snap.file);
      if (seq !== loadSeq) return;
      shownSnapshot.current = snap.year;
      const src = map.getSource("borders") as maplibregl.GeoJSONSource | undefined;
      if (src) src.setData(fc as GeoJSON.FeatureCollection);
      overlay.setPolities(polities);
      store.set({ snapshotYear: snap.year, polities, loadingMap: false });
    };

    const unsub = store.subscribe(() => {
      const st = store.get();
      if (st.year !== lastYear) { lastYear = st.year; void applyYear(st.year); }
      if (st.layers !== lastLayers) {
        lastLayers = st.layers;
        overlay.setLayers(st.layers);
        if (map.getLayer("polity-fill")) {
          const vis = st.layers.political ? "visible" : "none";
          map.setLayoutProperty("polity-fill", "visibility", vis);
          map.setLayoutProperty("polity-line", "visibility", vis);
        }
      }
      if (st.selection !== lastSelection) {
        lastSelection = st.selection;
        const sel = st.selection;
        if (map.getLayer("polity-selected")) {
          const g = sel && sel.kind === "polity" ? sel.group : NO_MATCH;
          map.setFilter("polity-selected", ["==", ["get", "__group"], g]);
        }
        overlay.setSelectedKey(
          sel
            ? sel.kind === "polity"
              ? `L:${sel.group}`
              : `${sel.entity.kind[0].toUpperCase()}:${sel.entity.id}`
            : null,
        );
      }
      if (st.theme !== lastTheme) {
        lastTheme = st.theme;
        currentTheme.current = st.theme;
        map.setStyle(baseStyle(st.theme));
        map.once("styledata", () => {
          shownSnapshot.current = null;
          void applyYear(store.get().year);
        });
      }
    });

    map.on("load", () => {
      overlay.setEntities(store.get().entities);
      void applyYear(store.get().year);
    });

    return () => {
      unsub();
      overlay.destroy();
      map.remove();
      mapRef.current = null;
      mapController.map = null;
      mapController.overlay = null;
    };
  }, []);

  // entities arrive asynchronously after first paint
  useEffect(() => {
    let last = store.get().entities;
    return store.subscribe(() => {
      const st = store.get();
      if (st.entities !== last) {
        last = st.entities;
        overlayRef.current?.setEntities(st.entities);
      }
    });
  }, []);

  return <div className="map" ref={ref} />;
}
