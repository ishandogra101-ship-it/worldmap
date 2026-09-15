/**
 * Places where the borders dataset draws something the historical record
 * contradicts, recorded rather than repaired.
 *
 * The atlas takes its boundaries from aourednik/historical-basemaps and does
 * not redraw them. Redrawing would mean inventing a frontier, which is the one
 * thing this project will not do — a corrected border that nobody surveyed is
 * no better than a wrong one, and worse for being confident. So an error is
 * marked and explained where a reader meets it, and the source's own geometry
 * stays on screen underneath the mark.
 *
 * `area` is the extent of the annotation. It is NOT a proposed boundary and is
 * never drawn as one: it is the rectangle within which the note applies, drawn
 * generously so it does not imply precision it lacks.
 *
 * Sources are named rather than linked. The links could not be opened from the
 * machine this was written on, and an unchecked URL in a file about accuracy
 * would be its own small joke.
 */
export interface Correction {
  /** the snapshot year whose file carries the error */
  snapshot: number;
  /** the NAME the dataset gives the polygon */
  polity: string;
  /** annotation extent [west, south, east, north] — not a boundary */
  area: [number, number, number, number];
  /** short label for the place the note is about */
  where: string;
  /** what the map draws */
  drawn: string;
  /** what the record says instead */
  record: string;
  /** named references, checkable by a reader */
  sources: string[];
}

/**
 * The northern subcontinent, 1783 to 1815.
 *
 * The dataset extends whichever power holds the Punjab across Kashmir and
 * Ladakh in three consecutive snapshots, under three different names. It is one
 * mistake repeated, not three separate ones: the Vale of Kashmir and the Indus
 * valley beyond it are drawn as an extension of the plains below them, and in
 * this period they were not.
 */
export const CORRECTIONS: Correction[] = [
  {
    snapshot: 1815,
    polity: "Maratha Confederacy",
    area: [73.0, 31.0, 79.5, 36.5],
    where: "Kashmir, Ladakh and the Punjab",
    drawn: "The Maratha Confederacy, reaching from the Deccan to the Karakoram.",
    record:
      "The Marathas never held Kashmir. Their furthest north was Attock and "
      + "Peshawar, taken briefly in 1758 and lost again by 1761 at Panipat. By "
      + "1815 they had already been stripped of Delhi, Gujarat and Orissa in the "
      + "second Anglo-Maratha war and held a fraction of the map drawn here. "
      + "Lahore in 1815 was Ranjit Singh's capital; the Sikh Empire does not "
      + "appear in this snapshot at all. Kashmir was under Durrani Afghan "
      + "governors until Ranjit Singh took it in 1819, and Ladakh was an "
      + "independent kingdom under the Namgyal dynasty until the Dogra conquest "
      + "of 1834.",
    sources: [
      "Encyclopaedia Britannica, \"Maratha confederacy\"",
      "Encyclopaedia Britannica, \"Ranjit Singh\"",
      "Encyclopaedia Britannica, \"Kashmir\" (region, Indian subcontinent)",
      "Encyclopaedia Britannica, \"Ladakh\"",
    ],
  },
  {
    snapshot: 1800,
    polity: "Sikhs",
    area: [73.0, 32.5, 78.0, 36.0],
    where: "Kashmir",
    drawn: "Sikh rule over the Vale of Kashmir.",
    record:
      "Ranjit Singh took Lahore in 1799, which the snapshot has right, but "
      + "Kashmir stayed under Durrani Afghan governors for another twenty years. "
      + "He conquered it in 1819, after Shopian.",
    sources: [
      "Encyclopaedia Britannica, \"Ranjit Singh\"",
      "Encyclopaedia Britannica, \"Kashmir\" (region, Indian subcontinent)",
    ],
  },
  {
    snapshot: 1783,
    polity: "Lahore",
    area: [73.0, 32.5, 79.5, 36.5],
    where: "Kashmir and Ladakh",
    drawn: "The Lahore polity extending over Kashmir and the upper Indus.",
    record:
      "Kashmir was Durrani in 1783, under Timur Shah. Ladakh was the Namgyal "
      + "kingdom, tributary to Lhasa. The Sikh misls held Lahore itself from "
      + "1765 and neither range beyond it.",
    sources: [
      "Encyclopaedia Britannica, \"Ahmad Shah Durrani\"",
      "Encyclopaedia Britannica, \"Ladakh\"",
    ],
  },
];

/** Every note that applies to a polity in the snapshot being drawn. */
export function correctionsFor(snapshot: number | null, polity: string): Correction[] {
  if (snapshot === null) return [];
  return CORRECTIONS.filter((c) => c.snapshot === snapshot && c.polity === polity);
}

/** Whether a point falls inside any correction's annotation extent. */
export function correctionAt(snapshot: number | null, lng: number, lat: number): Correction | null {
  if (snapshot === null) return null;
  for (const c of CORRECTIONS) {
    if (c.snapshot !== snapshot) continue;
    const [w, s, e, n] = c.area;
    if (lng >= w && lng <= e && lat >= s && lat <= n) return c;
  }
  return null;
}
