/**
 * Atlas of Power icon family.
 *
 * One system: 24px grid, 1.5 stroke, round caps, no fills, currentColor.
 * Paths live in a plain record so React components and the imperative map
 * markers draw identical geometry.
 */
import type { CSSProperties } from "react";

export type IconName =
  | "ruler" | "polity" | "battle" | "treaty" | "city" | "invention"
  | "discovery" | "science" | "religion" | "revolution" | "birth" | "death"
  | "exploration" | "search" | "layers" | "settings" | "play" | "pause"
  | "stepBack" | "stepForward" | "close" | "compare" | "follow" | "chevron"
  | "sun" | "moon" | "globe" | "info" | "arrow" | "command" | "person" | "event";

/** Each entry is the inner markup of a 24x24 viewBox. */
export const ICON_PATHS: Record<IconName, string> = {
  // A crown reduced to three peaks and a band — no jewels, no cartoon.
  ruler: '<path d="M4 16.5 5.2 8l4 3.4L12 6l2.8 5.4 4-3.4 1.2 8.5z"/><path d="M4.6 19.2h14.8"/>',
  // Territory: an irregular bounded region with a seat of power.
  polity: '<path d="M3.6 8.4 9 5.3l6.2 2.6L20.4 6v9.7l-5.2 2.4-6.2-2.6-5.4 2.7z"/><circle cx="12" cy="11.6" r="1.35"/>',
  // Crossed blades, abstracted to two strokes and their guards.
  battle: '<path d="M5 4.6 19 19M19 4.6 5 19"/><path d="M7.6 15.8 4.6 18.8M16.4 15.8l3 3"/>',
  // An accord: a sealed document.
  treaty: '<path d="M6.4 3.8h8.1l3.8 3.8v12.6H6.4z"/><path d="M14.2 3.9v3.8h3.9"/><circle cx="12" cy="15" r="2.1"/>',
  // Settlement: massed structures of differing height.
  city: '<path d="M3.6 20.2V11l4.3-2.3V20.2"/><path d="M7.9 20.2V6.2l5.6-2.6v16.6"/><path d="M13.5 20.2v-8.4l6.9 2.4v6z"/>',
  // A struck spark.
  invention: '<path d="M12 3.4v3.2M12 17.4v3.2M4.6 12H7.8M16.2 12h3.2"/><path d="m6.8 6.8 2.3 2.3M14.9 14.9l2.3 2.3M17.2 6.8l-2.3 2.3M9.1 14.9l-2.3 2.3"/><circle cx="12" cy="12" r="2.4"/>',
  // A bearing taken — waypoint on a heading.
  discovery: '<circle cx="12" cy="12" r="8.4"/><path d="m15.4 8.6-2 5.4-5.4 2 2-5.4z"/>',
  // A finding: a node and its orbit.
  science: '<circle cx="12" cy="12" r="2.1"/><ellipse cx="12" cy="12" rx="8.6" ry="3.9" transform="rotate(-28 12 12)"/>',
  // A place of gathering, given as an arch.
  religion: '<path d="M5.2 20.2V12a6.8 6.8 0 0 1 13.6 0v8.2"/><path d="M3.8 20.3h16.4M12 20.1v-6.3"/>',
  // A turn of the order.
  revolution: '<path d="M20 12a8 8 0 1 1-3.1-6.3"/><path d="M20.4 4.2v4.6h-4.6"/>',
  birth: '<circle cx="12" cy="14.6" r="2.4"/><path d="M12 9.8V3.9M9.2 6.3 12 3.6l2.8 2.7"/>',
  death: '<circle cx="12" cy="9.4" r="2.4"/><path d="M12 14.2v5.9M9.2 17.7l2.8 2.7 2.8-2.7"/>',
  exploration: '<circle cx="12" cy="12" r="8.6"/><path d="M12 1.8v2.6M12 19.6v2.6M22.2 12h-2.6M4.4 12H1.8"/><path d="m8.6 15.4 2.1-4.7 4.7-2.1-2.1 4.7z"/>',
  search: '<circle cx="10.8" cy="10.8" r="6.6"/><path d="m15.6 15.6 4.6 4.6"/>',
  layers: '<path d="m12 3.4 8.4 4.4-8.4 4.4-8.4-4.4z"/><path d="m3.9 12.4 8.1 4.2 8.1-4.2M3.9 16.6l8.1 4.2 8.1-4.2"/>',
  settings: '<path d="M3.6 7.4h16.8M3.6 16.6h16.8"/><circle cx="9.2" cy="7.4" r="2.3"/><circle cx="15.4" cy="16.6" r="2.3"/>',
  play: '<path d="M7.6 4.8 19 12 7.6 19.2z"/>',
  pause: '<path d="M8.8 4.9v14.2M15.2 4.9v14.2"/>',
  stepBack: '<path d="M18.4 5.2 9 12l9.4 6.8z"/><path d="M5.6 4.9v14.2"/>',
  stepForward: '<path d="M5.6 5.2 15 12l-9.4 6.8z"/><path d="M18.4 4.9v14.2"/>',
  close: '<path d="M5.6 5.6 18.4 18.4M18.4 5.6 5.6 18.4"/>',
  compare: '<rect x="3.6" y="4.6" width="16.8" height="14.8" rx="1.6"/><path d="M12 3.4v17.2"/><path d="m8.4 10.2-2 1.8 2 1.8M15.6 10.2l2 1.8-2 1.8"/>',
  follow: '<circle cx="12" cy="12" r="3.1"/><circle cx="12" cy="12" r="8.4"/><path d="M12 .9v3.1M12 20v3.1M23.1 12H20M4 12H.9"/>',
  chevron: '<path d="m9.4 5.6 6.6 6.4-6.6 6.4"/>',
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.2v2.4M12 19.4v2.4M21.8 12h-2.4M4.6 12H2.2"/><path d="m18.9 5.1-1.7 1.7M6.8 17.2l-1.7 1.7M18.9 18.9l-1.7-1.7M6.8 6.8 5.1 5.1"/>',
  moon: '<path d="M20.4 14.2A8.8 8.8 0 0 1 9.8 3.6a8.9 8.9 0 1 0 10.6 10.6"/>',
  globe: '<circle cx="12" cy="12" r="8.6"/><path d="M3.6 12h16.8"/><ellipse cx="12" cy="12" rx="3.9" ry="8.6"/>',
  info: '<circle cx="12" cy="12" r="8.6"/><path d="M12 10.9v5.4"/><circle cx="12" cy="7.9" r=".9"/>',
  arrow: '<path d="M4.4 12h15.2"/><path d="m13.6 6.2 6 5.8-6 5.8"/>',
  command: '<path d="M8.4 3.6a2.4 2.4 0 1 0 2.4 2.4v12a2.4 2.4 0 1 0 2.4-2.4h-12a2.4 2.4 0 1 0 2.4 2.4V6a2.4 2.4 0 1 0-2.4 2.4h12A2.4 2.4 0 1 0 15.6 6"/>',
  person: '<circle cx="12" cy="8.2" r="3.9"/><path d="M4.8 20.2a7.2 7.2 0 0 1 14.4 0"/>',
  event: '<path d="M12 3.2v4.2M12 16.6v4.2M3.2 12h4.2M16.6 12h4.2"/><circle cx="12" cy="12" r="3.4"/>',
};

interface IconProps {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
}

export function Icon({ name, size = 18, strokeWidth = 1.5, className, style }: IconProps) {
  return (
    <svg
      className={className}
      style={style}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] }}
    />
  );
}

/** Same geometry as <Icon>, for imperatively-built map markers. */
export function iconSvg(name: IconName, size = 16, strokeWidth = 1.6): string {
  return (
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" ` +
    `stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" ` +
    `stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name]}</svg>`
  );
}

/** Event category -> icon. Keeps the event layer one visual family. */
export function eventIcon(category?: string): IconName {
  switch ((category || "").toLowerCase()) {
    case "war": case "battle": case "siege": return "battle";
    case "treaty": case "peace": return "treaty";
    case "invention": return "invention";
    case "discovery": return "discovery";
    case "science": return "science";
    case "religion": return "religion";
    case "revolution": return "revolution";
    case "founding": case "city": return "city";
    case "exploration": return "exploration";
    default: return "event";
  }
}

/** Figure field -> icon. */
export function figureIcon(field?: string): IconName {
  switch ((field || "").toLowerCase()) {
    case "art": case "music": case "literature": return "person";
    case "science": case "math": case "medicine": return "science";
    case "philosophy": case "religion": return "religion";
    case "invention": return "invention";
    case "exploration": return "exploration";
    default: return "person";
  }
}
