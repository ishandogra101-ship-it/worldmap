/**
 * Political colour system.
 *
 * Not a rainbow: eighteen hues at deliberately similar chroma and lightness, so
 * a map of 200 polities still reads as one composition. Colour identifies a
 * realm; visual *weight* (opacity, stroke, label) communicates scale, and that
 * is handled by tier rather than by making big empires louder in hue.
 *
 * A realm keeps its colour across every year, because assignment is hashed from
 * its name rather than from its index in a snapshot.
 */
import type { PolityTier } from "../types";

export interface BorderProps {
  NAME?: string | null;
  SUBJECTO?: string | null;
  PARTOF?: string | null;
  [k: string]: unknown;
}

const PALETTE = [
  "#b2654c", "#bd8842", "#8c9750", "#6d9776", "#4f8d8b", "#5d84ad",
  "#6f72a9", "#8d6497", "#ad6170", "#a45553", "#618457", "#a68f71",
  "#6f8290", "#89607a", "#527c63", "#ad7a4d", "#7c7fa3", "#917f52",
];

/**
 * Hues that would otherwise sit adjacent in the list are pushed apart, so two
 * neighbouring realms rarely land on near-identical colours.
 */
const SCATTER = [0, 7, 14, 3, 10, 17, 6, 13, 2, 9, 16, 5, 12, 1, 8, 15, 4, 11];

/** Marquee realms get a fixed identity so the map reads consistently. */
const CURATED: Array<[RegExp, string]> = [
  [/holy roman/i, "#bd8842"],
  [/\broman\b|\brome\b/i, "#a45553"],
  [/byzant|eastern roman/i, "#8d6497"],
  [/mongol|yuan\b|golden horde|ilkhan|chagatai/i, "#5d84ad"],
  [/ottoman/i, "#4f8d8b"],
  [/mughal/i, "#527c63"],
  [/\bhan\b|\bqin\b|\btang\b|\bsong\b|\bming\b|\bqing\b|china|manchu/i, "#b2654c"],
  [/achaemenid|persia|sassan|parthia|safavid/i, "#a68f71"],
  [/maced|seleucid|hellen/i, "#bd8842"],
  [/british|england|great britain|united kingdom/i, "#ad6170"],
  [/\bfrance\b|french|carolingian|frank/i, "#5d84ad"],
  [/spain|spanish|castile|aragon/i, "#ad7a4d"],
  [/portug/i, "#618457"],
  [/russia|muscovy|soviet|ussr/i, "#8c9750"],
  [/austria|habsburg/i, "#917f52"],
  [/umayyad|abbasid|caliphate|rashidun|fatimid/i, "#6d9776"],
  [/egypt|ptolem/i, "#bd8842"],
  [/maurya|gupta|\bindia\b|delhi sultanate|chola/i, "#b2654c"],
  [/japan|yamato|tokugawa/i, "#89607a"],
  [/mali|songhai|ethiop|aksum|axum/i, "#a68f71"],
  [/aztec|mexica|inca|maya/i, "#ad7a4d"],
  [/united states|u\.s\.a|\bamerica/i, "#5d84ad"],
  [/babylon|assyria|akkad|sumer|hittite/i, "#917f52"],
];

/** The sovereign a polygon answers to — an empire and its vassals share this. */
export function groupKey(props: BorderProps): string {
  return (props.SUBJECTO || props.NAME || "").toString().trim();
}

function hash(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function colorForGroup(key: string): string {
  if (!key) return "transparent";
  for (const [re, color] of CURATED) if (re.test(key)) return color;
  return PALETTE[SCATTER[hash(key) % SCATTER.length]];
}

/**
 * Tier from mapped area, as a share of the largest realm in the snapshot.
 * Relative, so it stays meaningful whether the year has 20 polities or 1300.
 */
/**
 * Visual weight from a realm's own mapped extent, in planar deg².
 *
 * This was a share of the largest realm in the snapshot, which made the answer
 * depend on the company a realm kept: the Ottoman Empire at its widest in 1600
 * came out "small" because the central Asian khanates and Muscovy were mapped
 * larger that year. Fixed bands mean a realm of a given size reads the same
 * weight in every snapshot, which is also what lets the panel name it out loud.
 *
 * Calibrated against the measured distribution, in cosine-corrected deg²: the
 * top band holds the six or seven world powers of a given year (1700: Muscovy
 * 1098, the Ottomans 412, the Mughals 321), the middle one the thirty or so
 * realms of regional weight (France 44, the Netherlands 168, Egypt in 1900 at
 * 166), and the rest — around 500 of the 566 realms mapped in 1700, median 1.5
 * — fall below both.
 */
export function tierForArea(area: number): PolityTier {
  if (area >= 240) return 0;
  if (area >= 40) return 1;
  return 2;
}

/** Fill opacity per tier. Large realms sit forward; minor ones recede. */
export const TIER_FILL: Record<"dark" | "light", [number, number, number]> = {
  dark: [0.52, 0.38, 0.26],
  light: [0.46, 0.34, 0.24],
};

export const TIER_LINE_WIDTH: [number, number, number] = [1.0, 0.7, 0.5];
