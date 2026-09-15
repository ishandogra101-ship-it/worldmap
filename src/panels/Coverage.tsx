import { useMemo } from "react";
import { useAtlas } from "../app/store";
import { regionOf } from "../data/regions";
import type { Entity } from "../types";

/**
 * What the imported record actually covers.
 *
 * Measured from the dataset the app has loaded rather than written down, so it
 * cannot drift from the data it describes. A reader who checks the map against
 * these numbers should find them agreeing.
 */
function measure(entities: Entity[]) {
  const imported = entities.filter((e) => /^Q\d+$/.test(e.id));
  const byRegion = new Map<string, number>();
  let since1800 = 0;
  for (const e of imported) {
    const r = regionOf(e.lng, e.lat);
    byRegion.set(r, (byRegion.get(r) ?? 0) + 1);
    if (e.startYear >= 1800) since1800++;
  }
  const rows = [...byRegion.entries()]
    .map(([region, n]) => ({ region, n, share: n / imported.length }))
    .sort((a, b) => b.n - a.n);

  /**
   * The same question asked of time instead of place.
   *
   * The region bars were the only bias the panel showed, and the other one is
   * steeper: scrub to 1450 and the map is nearly bare, scrub to 1950 and it is
   * crowded, with nothing on screen to say whether that is history or the
   * archive. These are people the atlas records as alive in each sample year,
   * counted from the loaded data. The bars are linear against the largest, so
   * 1450 renders as a sliver next to 1950 — which is the finding, not a
   * drafting problem.
   */
  const SAMPLES = [-2000, -500, 1, 500, 1000, 1300, 1500, 1700, 1800, 1900, 1950, 2000];
  const era = SAMPLES.map((year) => {
    let n = 0;
    for (const e of imported) {
      if (e.kind !== "ruler" && e.kind !== "figure") continue;
      if (e.startYear <= year && year <= e.endYear) n++;
    }
    return { year, n };
  });
  const eraMax = Math.max(1, ...era.map((e) => e.n));

  return { total: imported.length, rows, since1800, era, eraMax };
}

export default function Coverage() {
  const entities = useAtlas((s) => s.entities);
  const { total, rows, since1800, era, eraMax } = useMemo(() => measure(entities), [entities]);
  if (total === 0) return null;
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  // read off the measurement rather than written beside it, so a later import
  // cannot leave this paragraph describing a dataset that no longer exists
  const ratio = (a: number, b: number) => (b > 0 ? Math.round(a / b) : a).toLocaleString();

  return (
    <>
      <p>
        The people and events layers are imported from Wikidata, and Wikidata is
        not evenly written. Of the {total.toLocaleString()} imported records the
        atlas currently holds:
      </p>

      <div className="cov">
        {rows.map(({ region, n, share }) => (
          <div className="cov__row" key={region}>
            <span className="cov__name">{region}</span>
            <span className="cov__bar" aria-hidden="true">
              <span className="cov__fill" style={{ width: `${Math.max(share * 100, 0.4)}%` }} />
            </span>
            <span className="cov__pct tnum">{pct(share)}</span>
            <span className="cov__n tnum">{n.toLocaleString()}</span>
          </div>
        ))}
      </div>

      <p>
        {rows[0].region} holds {pct(rows[0].share)} of it, {ratio(rows[0].n, rows[rows.length - 1].n)} times
        what {rows[rows.length - 1].region} holds. {pct(since1800 / total)} of everything imported
        falls after 1800.
      </p>

      <p>
        The record is as uneven across time as across space. People the atlas
        holds as alive in each of these years:
      </p>

      <div className="cov cov--era">
        {era.map(({ year, n }) => (
          <div className="cov__row" key={year}>
            <span className="cov__name tnum">
              {year < 0 ? `${Math.abs(year)} BCE` : `${year} CE`}
            </span>
            <span className="cov__bar" aria-hidden="true">
              <span className="cov__fill" style={{ width: `${Math.max((n / eraMax) * 100, 0.4)}%` }} />
            </span>
            <span className="cov__n tnum">{n.toLocaleString()}</span>
          </div>
        ))}
      </div>

      <p>
        That shape comes from the sources, not from the past. Wikidata inherits
        the coverage of the Wikipedias behind it, which are largest in European
        languages; records survive unevenly, and a court that kept written
        annals leaves more of them than one that did not; and the queries
        themselves reach only people Wikidata models as holding a titled
        position, which fits some political traditions far better than others.
      </p>

      <p className="cov__point">
        Thin coverage on this map means the record is thin. It does not mean
        less happened there.
      </p>
    </>
  );
}
