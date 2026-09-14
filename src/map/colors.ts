// Colour a polity by the sovereign it answers to (SUBJECTO), so an empire and
// its vassals share one colour — the classic historical-atlas look. Marquee
// empires get hand-picked colours; everyone else gets a stable colour hashed
// from their name, so a given realm keeps its colour across every year.

export interface BorderProps {
  NAME?: string | null;
  SUBJECTO?: string | null;
  PARTOF?: string | null;
  [k: string]: unknown;
}

export const NEUTRAL_FILL = "rgba(0,0,0,0)"; // unattested land: let the base land show

// Checked in order; first token found in the sovereign name wins. More specific
// entries come before looser ones (Holy Roman before Roman).
const CURATED: Array<[RegExp, string]> = [
  [/holy roman|\bh\.?r\.?e\.?\b/i, "#c9a227"],
  [/roman|rome\b/i, "#8d3b3b"],
  [/byzant|eastern roman/i, "#7d5ba6"],
  [/mongol|yuan|golden horde|ilkhan/i, "#4f74c9"],
  [/ottoman|turk/i, "#2e8b6f"],
  [/mughal|mogul/i, "#2f9e8f"],
  [/\bhan\b|\bqin\b|\btang\b|\bsong\b|\bming\b|\bqing\b|china|chinese/i, "#c85a3f"],
  [/achaemenid|persia|sassan|parthia|safavid/i, "#b8863b"],
  [/maced|alexander|seleucid|hellen/i, "#d1a03a"],
  [/british|england|great britain|united kingdom/i, "#b23b52"],
  [/\bfrance|french|carolingian|frank/i, "#3a6ea5"],
  [/spain|spanish|castile|aragon/i, "#c9832b"],
  [/portug/i, "#3f8f5c"],
  [/russia|muscovy|soviet|ussr/i, "#5f7d3a"],
  [/austria|habsburg|holy roman/i, "#c2a83e"],
  [/umayyad|abbasid|caliphate|rashidun|fatimid|arab/i, "#3f9b6d"],
  [/egypt|ptolem|kemet/i, "#c7a53c"],
  [/maurya|gupta|india|delhi sultanate|chola/i, "#d97b2f"],
  [/japan|yamato|tokugawa/i, "#b7495e"],
  [/mali|songhai|ghana empire|ethiop|axum|aksum/i, "#a86b2c"],
  [/aztec|mexica|inca|maya/i, "#c96a2f"],
  [/united states|u\.s\.a|\bamerica/i, "#3167a3"],
  [/babylon|assyria|akkad|sumer|hittite/i, "#a9803a"],
];

export function groupKey(props: BorderProps): string {
  const s = (props.SUBJECTO || props.NAME || "").toString().trim();
  return s;
}

function hashHue(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 360;
  return h;
}

export function colorForGroup(key: string): string {
  if (!key) return NEUTRAL_FILL;
  for (const [re, color] of CURATED) if (re.test(key)) return color;
  const hue = hashHue(key);
  // vary saturation/lightness a touch by a second pass so near-hues stay distinct
  const sat = 42 + (key.length % 5) * 5; // 42..62
  const light = 52 + (hashHue(key.split("").reverse().join("")) % 12); // 52..63
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}
