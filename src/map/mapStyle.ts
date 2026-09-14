import type { StyleSpecification } from "maplibre-gl";
import { asset } from "../util";

/** Filter sentinel meaning "match nothing" for the hover/selection layers. */
export const NO_MATCH = "__none__";

export interface MapTheme {
  ocean: string;
  land: string;
  landLine: string;
  boundary: string;
  boundaryStrong: string;
  selected: string;
}

export const MAP_THEMES: Record<"dark" | "light", MapTheme> = {
  dark: {
    ocean: "#070a0e",
    land: "#232932",
    landLine: "#3a424e",
    boundary: "rgba(255,255,255,0.30)",
    boundaryStrong: "rgba(255,255,255,0.55)",
    selected: "#f2f5f9",
  },
  light: {
    ocean: "#d7e2e8",
    land: "#f7f5f1",
    landLine: "#cfc8bb",
    boundary: "rgba(24,26,32,0.34)",
    boundaryStrong: "rgba(24,26,32,0.62)",
    selected: "#14171c",
  },
};

/**
 * A deliberately blank base: ocean, landmass, and whatever history we draw on
 * top. No modern place names or modern country lines bleeding through an ancient
 * map, and no tile-vendor styling. Text is rendered as DOM labels, so the style
 * needs no glyph server.
 */
export function baseStyle(theme: "dark" | "light"): StyleSpecification {
  const t = MAP_THEMES[theme];
  const dark = theme === "dark";
  return {
    version: 8,
    sources: {
      land: { type: "geojson", data: asset("data/land.geojson") },
      borders: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
    },
    layers: [
      { id: "ocean", type: "background", paint: { "background-color": t.ocean } },
      { id: "land", type: "fill", source: "land", paint: { "fill-color": t.land } },
      {
        id: "land-line",
        type: "line",
        source: "land",
        paint: { "line-color": t.landLine, "line-width": 0.7 },
      },
      {
        id: "polity-fill",
        type: "fill",
        source: "borders",
        paint: {
          "fill-color": ["get", "__color"],
          // Weight by tier: large realms sit forward, minor ones recede.
          "fill-opacity": [
            "case",
            ["==", ["get", "__tier"], 0], dark ? 0.52 : 0.46,
            ["==", ["get", "__tier"], 1], dark ? 0.38 : 0.34,
            dark ? 0.26 : 0.24,
          ],
          "fill-antialias": true,
        },
      },
      {
        id: "polity-line",
        type: "line",
        source: "borders",
        paint: {
          "line-color": t.boundary,
          "line-width": [
            "case",
            ["==", ["get", "__tier"], 0], 1.0,
            ["==", ["get", "__tier"], 1], 0.7,
            0.5,
          ],
          "line-opacity": 0.85,
        },
      },
      {
        id: "polity-hover",
        type: "line",
        source: "borders",
        filter: ["==", ["get", "__group"], NO_MATCH],
        paint: { "line-color": t.boundaryStrong, "line-width": 1.6 },
      },
      {
        id: "polity-selected",
        type: "line",
        source: "borders",
        filter: ["==", ["get", "__group"], NO_MATCH],
        paint: { "line-color": t.selected, "line-width": 2.2 },
      },
    ],
  };
}
