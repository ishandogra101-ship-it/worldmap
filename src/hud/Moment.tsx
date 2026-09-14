import { useMemo, useState } from "react";
import { useAtlas, select, setYear } from "../app/store";
import { Icon, eventIcon } from "../design/icons";
import { mapController } from "../map/HistoricalMap";
import { formatYear } from "../util";
import type { Entity } from "../types";

/**
 * "What was happening?" — assembled from the data actually loaded, not from
 * written-out prose per year. It grows richer as the dataset does, and it never
 * asserts anything the atlas does not hold.
 *
 * The legend lives here too, so the map carries one surface in this corner
 * rather than two competing ones.
 */
export default function Moment() {
  const year = useAtlas((s) => s.year);
  const snapshotYear = useAtlas((s) => s.snapshotYear);
  const polities = useAtlas((s) => s.polities);
  const entities = useAtlas((s) => s.entities);
  const [open, setOpen] = useState(false);

  const realms = useMemo(() => polities.filter((p) => p.tier === 0).slice(0, 5), [polities]);

  const { rulers, figures, events } = useMemo(() => {
    const active = entities.filter((e) => e.startYear <= year && year <= e.endYear);
    return {
      rulers: active.filter((e) => e.kind === "ruler").sort((a, b) => b.prominence - a.prominence).slice(0, 4),
      figures: active.filter((e) => e.kind === "figure").sort((a, b) => b.prominence - a.prominence).slice(0, 4),
      events: entities
        .filter((e) => e.kind === "event" && Math.abs(e.startYear - year) <= 25)
        .sort((a, b) => Math.abs(a.startYear - year) - Math.abs(b.startYear - year))
        .slice(0, 4),
    };
  }, [entities, year]);

  const nothing = realms.length === 0 && rulers.length === 0 && figures.length === 0 && events.length === 0;

  return (
    <div className={`moment ${open ? "is-open" : ""}`}>
      <button className="moment__toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="moment__label">
          <span className="eyebrow">The world in</span>
          <span className="moment__year tnum">{formatYear(year)}</span>
        </span>
        <Icon name="chevron" size={14} className={open ? "rot-down" : "rot-up"} />
      </button>

      {open && (
        <div className="moment__body">
          {nothing && (
            <p className="moment__empty">
              Little of this moment has been mapped yet. The record thins out the further
              back you go.
            </p>
          )}

          {realms.length > 0 && (
            <Block title="Largest realms drawn">
              <ul className="moment__list">
                {realms.map((p) => (
                  <li key={p.group}>
                    <button
                      className="mrow"
                      onClick={() => {
                        select({
                          kind: "polity", name: p.name, group: p.group, color: p.color,
                          tier: p.tier, area: p.area, lng: p.lng, lat: p.lat,
                          snapshotYear: snapshotYear ?? year,
                        });
                        mapController.framePolity(p);
                      }}
                    >
                      <span className="mrow__swatch" style={{ background: p.color }} />
                      <span className="mrow__name">{p.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Block>
          )}

          {rulers.length > 0 && (
            <Block title="Holding power"><EntityList items={rulers} /></Block>
          )}
          {figures.length > 0 && (
            <Block title="Living now"><EntityList items={figures} /></Block>
          )}
          {events.length > 0 && (
            <Block title="Around this time">
              <ul className="moment__list">
                {events.map((e) => (
                  <li key={e.id}>
                    <button
                      className="mrow"
                      onClick={() => { setYear(e.startYear); select({ kind: "entity", entity: e }); mapController.frameEntity(e); }}
                    >
                      <span className="mrow__icon"><Icon name={eventIcon(e.category)} size={13} /></span>
                      <span className="mrow__name">{e.name}</span>
                      <span className="mrow__year tnum">{Math.abs(e.startYear)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Block>
          )}

          <div className="moment__legend">
            <div className="eyebrow">What you are seeing</div>
            <ul className="legend__keys">
              <li><span className="lk lk--t0" /> Large realm</li>
              <li><span className="lk lk--t1" /> Regional realm</li>
              <li><span className="lk lk--t2" /> Small realm</li>
              <li><span className="lk lk--none" /> Not attested in this snapshot</li>
            </ul>
            <p className="moment__fine">
              Colour identifies a realm; weight shows its scale. Blank land had no state in
              this dataset — not every corner of history is mapped.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="moment__block">
      <div className="eyebrow">{title}</div>
      {children}
    </section>
  );
}

function EntityList({ items }: { items: Entity[] }) {
  return (
    <ul className="moment__list">
      {items.map((e) => (
        <li key={e.id}>
          <button
            className="mrow"
            onClick={() => { select({ kind: "entity", entity: e }); mapController.frameEntity(e); }}
          >
            <span className="mrow__icon">
              <Icon name={e.kind === "ruler" ? "ruler" : "person"} size={13} />
            </span>
            <span className="mrow__name">{e.name}</span>
            {e.category && <span className="mrow__meta">{e.category}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}
