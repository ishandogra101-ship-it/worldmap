import { MIN_YEAR, MAX_YEAR } from "../util";

/**
 * A linear 3000 BCE → 2026 axis gives the last five centuries about 10% of the
 * track, which is where most mapped change actually happens. So the scale is
 * piecewise: each span of history gets a share of the track proportional to how
 * much there is to see, not to how many years it contains.
 *
 * Monotonic, so dragging never reverses, and invertible, so a pixel maps back to
 * exactly one year.
 */
interface Segment { from: number; to: number; weight: number }

const SEGMENTS: Segment[] = [
  { from: -3000, to: -1000, weight: 0.10 },
  { from: -1000, to: 0,     weight: 0.10 },
  { from: 0,     to: 500,   weight: 0.10 },
  { from: 500,   to: 1000,  weight: 0.10 },
  { from: 1000,  to: 1400,  weight: 0.12 },
  { from: 1400,  to: 1700,  weight: 0.16 },
  { from: 1700,  to: 1900,  weight: 0.18 },
  { from: 1900,  to: 2026,  weight: 0.14 },
];

const CUM: number[] = (() => {
  const out: number[] = [];
  let acc = 0;
  for (const s of SEGMENTS) { out.push(acc); acc += s.weight; }
  out.push(acc); // total, should be 1
  return out;
})();
const TOTAL = CUM[CUM.length - 1];

/** year -> 0..1 along the track */
export function yearToFrac(year: number): number {
  const y = Math.max(MIN_YEAR, Math.min(MAX_YEAR, year));
  for (let i = 0; i < SEGMENTS.length; i++) {
    const s = SEGMENTS[i];
    if (y <= s.to || i === SEGMENTS.length - 1) {
      const t = (y - s.from) / (s.to - s.from);
      return (CUM[i] + Math.max(0, Math.min(1, t)) * s.weight) / TOTAL;
    }
  }
  return 1;
}

/** 0..1 -> year */
export function fracToYear(frac: number): number {
  const f = Math.max(0, Math.min(1, frac)) * TOTAL;
  for (let i = 0; i < SEGMENTS.length; i++) {
    const s = SEGMENTS[i];
    const lo = CUM[i], hi = CUM[i + 1];
    if (f <= hi || i === SEGMENTS.length - 1) {
      const t = hi === lo ? 0 : (f - lo) / (hi - lo);
      return Math.round(s.from + t * (s.to - s.from));
    }
  }
  return MAX_YEAR;
}

export interface Tick { year: number; major: boolean; label?: string }

/**
 * Ticks whose spacing adapts to the scale: coarse in antiquity, fine near the
 * present. Anything that would collide with its neighbour is dropped rather than
 * drawn on top of it.
 */
export function buildTicks(trackWidth: number): Tick[] {
  const candidates: Tick[] = [];
  const push = (year: number, major: boolean, label?: string) => {
    if (year < MIN_YEAR || year > MAX_YEAR) return;
    candidates.push({ year, major, label });
  };

  for (let y = -3000; y < -1000; y += 500) push(y, y % 1000 === 0, undefined);
  for (let y = -1000; y < 0; y += 250) push(y, y % 500 === 0);
  for (let y = 0; y < 1000; y += 100) push(y, y % 500 === 0);
  for (let y = 1000; y < 1500; y += 100) push(y, y % 500 === 0);
  for (let y = 1500; y < 1800; y += 50) push(y, y % 100 === 0);
  for (let y = 1800; y <= 2020; y += 20) push(y, y % 100 === 0);
  push(MAX_YEAR, false);

  // label only the majors, and only where there is room
  const MIN_LABEL_GAP = 46;
  let lastLabelX = -Infinity;
  const out: Tick[] = [];
  for (const t of candidates.sort((a, b) => a.year - b.year)) {
    const x = yearToFrac(t.year) * trackWidth;
    if (t.major && x - lastLabelX >= MIN_LABEL_GAP) {
      lastLabelX = x;
      out.push({ ...t, label: t.year < 0 ? `${Math.abs(t.year)} BC` : String(t.year) });
    } else {
      out.push({ ...t, label: undefined });
    }
  }
  return out;
}
