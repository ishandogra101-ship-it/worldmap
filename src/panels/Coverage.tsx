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
  return { total: imported.length, rows, since1800 };
}

export default function Coverage() {
  const entities = useAtlas((s) => s.entities);
  const { total, rows, since1800 } = useMemo(() => measure(entities), [entities]);
  if (total === 0) return null;
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

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
        Europe holds more than half. Sub-Saharan Africa and North Africa hold
        about one record in eighty each. {pct(since1800 / total)} of everything
        imported falls after 1800.
      </p>

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
