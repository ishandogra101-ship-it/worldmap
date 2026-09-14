import { useEffect, useMemo, useState } from "react";
import { store, useAtlas, select, setYear, follow } from "../app/store";
import { Icon, eventIcon, figureIcon } from "../design/icons";
import { mapController } from "../map/HistoricalMap";
import { formatYear, centuryLabel, asset } from "../util";
import type { Entity, PolitySelection, PolitySummary } from "../types";
import { regionOf, type Region } from "../data/regions";
import { beforeAndAfter, type HeldBy } from "../map/pointLookup";

/**
 * Match a realm against the realm named on a person's record.
 *
 * Substring matching is not safe here: "Holy Roman Empire" contains "Roman
 * Empire", which cheerfully filed Julius Caesar under the HRE. So compare the
 * place words for equality, and treat the polity *type* separately — a realm and
 * a person may disagree about "Kingdom of England" vs "England", but the Roman
 * Republic and the Roman Empire are not the same thing.
 */
const TYPE_WORDS = new Set([
  "empire", "kingdom", "dynasty", "sultanate", "caliphate", "republic", "crown",
  "state", "states", "realm", "khanate", "shogunate", "confederation", "duchy",
  "principality", "federation", "union",
]);
const FILLER = new Set(["the", "of", "and"]);

function split(s: string): { core: Set<string>; type: Set<string> } {
  const core = new Set<string>();
  const type = new Set<string>();
  for (const w of s.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ")) {
    if (!w || FILLER.has(w)) continue;
    if (TYPE_WORDS.has(w)) type.add(w);
    else core.add(w);
  }
  return { core, type };
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const w of a) if (!b.has(w)) return false;
  return true;
}

function related(a: string, b: string): boolean {
  const x = split(a), y = split(b);
  if (x.core.size === 0 || y.core.size === 0) return false;
  if (!sameSet(x.core, y.core)) return false;
  // same place; now make sure they do not name conflicting kinds of polity
  if (x.type.size === 0 || y.type.size === 0) return true;
  for (const t of x.type) if (y.type.has(t)) return true;
  return false;
}

/**
 * What else was going on, at this same moment, somewhere else. One entry per
 * region so a single busy corner of the world cannot fill the list.
 */
function elsewhereAt(
  entities: Entity[],
  year: number,
  home: Region,
  limit = 5,
): Array<{ region: Region; e: Entity }> {
  const best = new Map<Region, Entity>();
  for (const e of entities) {
    if (e.kind === "city") continue;
    if (e.startYear > year || year > e.endYear) continue;
    const r = regionOf(e.lng, e.lat);
    if (r === home || r === "Elsewhere") continue;
    const cur = best.get(r);
    if (!cur || e.prominence > cur.prominence) best.set(r, e);
  }
  return [...best.entries()]
    .map(([region, e]) => ({ region, e }))
    .sort((a, b) => b.e.prominence - a.e.prominence)
    .slice(0, limit);
}

/** One major realm per region, away from the region in focus. */
function realmsElsewhere(
  polities: PolitySummary[],
  home: Region,
  limit = 4,
): Array<{ region: Region; p: PolitySummary }> {
  const best = new Map<Region, PolitySummary>();
  for (const p of polities) {
    if (p.tier === 2) continue;
    const r = regionOf(p.lng, p.lat);
    if (r === home || r === "Elsewhere") continue;
    const cur = best.get(r);
    if (!cur || p.area > cur.area) best.set(r, p);
  }
  return [...best.entries()]
    .map(([region, p]) => ({ region, p }))
    .sort((a, b) => b.p.area - a.p.area)
    .slice(0, limit);
}

const KIND_LABEL: Record<Entity["kind"], string> = {
  ruler: "Ruler",
  figure: "Figure",
  event: "Event",
  city: "City",
};

export default function EntityPanel() {
  const selection = useAtlas((s) => s.selection);
  const entities = useAtlas((s) => s.entities);
  const polities = useAtlas((s) => s.polities);
  const year = useAtlas((s) => s.year);

  const close = () => select(null);

  if (!selection) return null;

  return (
    <aside className="sheet" role="complementary" aria-label="Details">
      <button className="sheet__close" onClick={close} aria-label="Close">
        <Icon name="close" size={16} />
      </button>
      {selection.kind === "polity"
        ? <PolityView p={selection} entities={entities} polities={polities} year={year} />
        : <EntityView e={selection.entity} entities={entities} polities={polities} />}
    </aside>
  );
}

function PolityView({ p, entities, polities, year }: {
  p: PolitySelection; entities: Entity[]; polities: PolitySummary[]; year: number;
}) {
  const rulersNow = useMemo(
    () => entities.filter(
      (e) => e.kind === "ruler" && e.category && related(p.name, e.category)
        && e.startYear <= year && year <= e.endYear,
    ),
    [entities, p.name, year],
  );
  const rulersEver = useMemo(
    () => entities
      .filter((e) => e.kind === "ruler" && e.category && related(p.name, e.category))
      .sort((a, b) => a.startYear - b.startYear),
    [entities, p.name],
  );
  const figures = useMemo(
    () => entities
      .filter((e) => e.kind === "figure" && e.category && related(p.name, e.category))
      .slice(0, 6),
    [entities, p.name],
  );

  const tierName = p.tier === 0 ? "Large realm" : p.tier === 1 ? "Regional realm" : "Small realm";

  // What held this exact place in the mapped years either side of this one.
  const [ba, setBa] = useState<{ before: HeldBy | null; after: HeldBy | null } | null>(null);
  useEffect(() => {
    let alive = true;
    setBa(null);
    beforeAndAfter(p.lng, p.lat, p.snapshotYear)
      .then((r) => { if (alive) setBa(r); })
      .catch(() => { if (alive) setBa({ before: null, after: null }); });
    return () => { alive = false; };
  }, [p.lng, p.lat, p.snapshotYear]);

  const elsewhere = useMemo(
    () => elsewhereAt(entities, year, regionOf(p.lng, p.lat)),
    [entities, year, p.lng, p.lat],
  );

  return (
    <div className="sheet__body">
      <div className="sheet__head">
        <span className="sheet__swatch" style={{ background: p.color }} aria-hidden="true" />
        <div>
          <div className="eyebrow">{tierName}</div>
          <h2 className="sheet__title">{p.name}</h2>
        </div>
      </div>

      <div className="sheet__meta">
        <span>As drawn in {formatYear(p.snapshotYear)}</span>
      </div>

      {(p.subjectTo && p.subjectTo !== p.name) && (
        <Row label="Subject to" value={p.subjectTo} />
      )}
      {(p.partOf && p.partOf !== p.name && p.partOf !== p.subjectTo) && (
        <Row label="Part of" value={p.partOf} />
      )}

      {ba && (ba.before || ba.after) && (
        <Section title="This place, before and after">
          <div className="ba">
            <BaRow when="Before" held={ba.before} current={p.group} />
            <BaRow when="Now" held={{ name: p.name, group: p.group, color: p.color, year: p.snapshotYear }} current={p.group} isNow />
            <BaRow when="After" held={ba.after} current={p.group} />
          </div>
        </Section>
      )}

      {rulersNow.length > 0 && (
        <Section title={`Ruling in ${formatYear(year)}`}>
          {rulersNow.map((r) => <EntityRow key={r.id} e={r} />)}
        </Section>
      )}

      {rulersEver.length > 0 && (
        <Section title="Rulers recorded here">
          {rulersEver.map((r) => <EntityRow key={r.id} e={r} muted={!rulersNow.includes(r)} />)}
        </Section>
      )}

      {figures.length > 0 && (
        <Section title="Figures associated">
          {figures.map((f) => <EntityRow key={f.id} e={f} />)}
        </Section>
      )}

      {rulersEver.length === 0 && figures.length === 0 && (
        <p className="sheet__note">
          No rulers or figures for this realm are in the atlas yet. The people layer is
          far thinner than the border layer — absence here means unrecorded, not empty.
        </p>
      )}

      <Elsewhere
        realms={realmsElsewhere(polities, regionOf(p.lng, p.lat))}
        people={elsewhere}
      />

      <p className="sheet__fine">
        Borders come from the nearest mapped snapshot rather than a reconstruction of this
        exact year.
      </p>
    </div>
  );
}

function EntityView({ e, entities, polities }: {
  e: Entity; entities: Entity[]; polities: PolitySummary[];
}) {
  const kindLabel = KIND_LABEL[e.kind];
  const isPoint = e.kind === "event" && e.startYear === e.endYear;
  // a city still lived in has a beginning but no recorded end; saying "2026" would
  // dress a bound up as a fact
  const span = isPoint
    ? formatYear(e.startYear)
    : e.continuing
      ? `${formatYear(e.startYear)} – present`
      : `${formatYear(e.startYear)} – ${formatYear(e.endYear)}`;
  const verb =
    e.kind === "ruler" ? "Reigned"
    : e.kind === "figure" ? "Lived"
    : e.kind === "city" ? "Inhabited"
    : "Dated";

  const peers = useMemo(() => {
    if (!e.category) return [];
    return entities
      .filter((o) => o.id !== e.id && o.category && related(e.category!, o.category) && o.kind === "ruler")
      .sort((a, b) => a.startYear - b.startYear)
      .slice(0, 6);
  }, [entities, e]);

  const mid = Math.round((e.startYear + e.endYear) / 2);

  const contemporaries = useMemo(
    () => entities
      .filter((o) => o.id !== e.id && o.kind !== "event" && o.kind !== "city"
        && o.startYear <= mid && mid <= o.endYear)
      .sort((a, b) => b.prominence - a.prominence)
      .slice(0, 5),
    [entities, e.id, mid],
  );

  // events that fall inside this life or reign, wherever they happened
  const during = useMemo(() => {
    if (e.kind === "event" || e.startYear === e.endYear) return [];
    return entities
      .filter((o) => o.kind === "event" && o.startYear >= e.startYear && o.startYear <= e.endYear)
      .sort((a, b) => a.startYear - b.startYear)
      .slice(0, 6);
  }, [entities, e]);

  const elsewhere = useMemo(
    () => elsewhereAt(entities, mid, regionOf(e.lng, e.lat)),
    [entities, mid, e.lng, e.lat],
  );

  const whileLabel = e.kind === "ruler"
    ? `While ${e.name.split(" ")[0]} ruled`
    : e.kind === "figure" ? `In ${e.name.split(" ").slice(-1)[0]}'s lifetime`
    : "";

  return (
    <div className="sheet__body">
      <div className="sheet__head">
        {e.portrait ? (
          <img
            className="sheet__portrait"
            src={/^https?:/.test(e.portrait) ? e.portrait : asset(e.portrait)}
            alt=""
          />
        ) : (
          <span className="sheet__badge" aria-hidden="true">
            <Icon
              name={e.kind === "ruler" ? "ruler" : e.kind === "event" ? eventIcon(e.category) : figureIcon(e.category)}
              size={20}
            />
          </span>
        )}
        <div>
          <div className="eyebrow">{kindLabel}</div>
          <h2 className="sheet__title">{e.name}</h2>
          {e.category && <div className="sheet__sub">{e.category}</div>}
        </div>
      </div>

      <div className="sheet__dates">
        <span className="eyebrow">{verb}</span>
        <span className="tnum">{span}</span>
        <span className="sheet__century">{centuryLabel(e.startYear)}</span>
      </div>

      {e.description && <p className="sheet__prose">{e.description}</p>}

      <div className="sheet__actions">
        <button
          className="btn"
          onClick={() => {
            const mid = isPoint ? e.startYear : Math.round((e.startYear + e.endYear) / 2);
            setYear(mid);
            mapController.frameEntity(e);
          }}
        >
          <Icon name="globe" size={14} />
          Show on the map
        </button>
        {!isPoint && (
          <button
            className="btn btn--quiet"
            onClick={() => {
              follow(e.name, e.startYear, e.endYear);
              setYear(e.startYear);
            }}
          >
            <Icon name="follow" size={14} />
            Follow
          </button>
        )}
      </div>

      {e.kind !== "city" && peers.length > 0 && (
        <Section title="Others who held this realm">
          {peers.map((p) => <EntityRow key={p.id} e={p} />)}
        </Section>
      )}

      {during.length > 0 && whileLabel && (
        <Section title={whileLabel}>
          {during.map((d) => <EntityRow key={d.id} e={d} />)}
        </Section>
      )}

      {e.kind !== "city" && contemporaries.length > 0 && (
        <Section title="Alive at the same time">
          {contemporaries.map((c) => <EntityRow key={c.id} e={c} />)}
        </Section>
      )}

      <Elsewhere
        realms={realmsElsewhere(polities, regionOf(e.lng, e.lat))}
        people={elsewhere}
      />

      <div className="sheet__foot">
        {e.source && (
          <a href={e.source} target="_blank" rel="noopener noreferrer" className="sheet__link">
            Source <Icon name="arrow" size={13} />
          </a>
        )}
        <span className="sheet__fine">
          Prominence {Math.round(e.prominence)} — a reference-count proxy that decides when this
          marker appears, not a judgement of importance.
        </span>
        {e.portraitCredit && <span className="sheet__fine">Portrait: {e.portraitCredit}</span>}
      </div>
    </div>
  );
}

function Elsewhere({
  realms, people,
}: {
  realms: Array<{ region: Region; p: PolitySummary }>;
  people: Array<{ region: Region; e: Entity }>;
}) {
  if (realms.length === 0 && people.length === 0) return null;
  return (
    <Section title="Elsewhere in the world">
      {realms.map(({ region, p }) => (
        <button
          key={p.group}
          className="erow"
          onClick={() => {
            select({
              kind: "polity", name: p.name, group: p.group, color: p.color,
              tier: p.tier, area: p.area, lng: p.lng, lat: p.lat,
              snapshotYear: store.get().snapshotYear ?? store.get().year,
            });
            mapController.framePolity(p);
          }}
        >
          <span className="erow__icon"><span className="erow__swatch" style={{ background: p.color }} /></span>
          <span className="erow__name">{p.name}</span>
          <span className="erow__region">{region}</span>
        </button>
      ))}
      {people.map(({ region, e }) => <EntityRow key={e.id} e={e} region={region} />)}
    </Section>
  );
}

function BaRow({
  when, held, current, isNow,
}: { when: string; held: HeldBy | null; current: string; isNow?: boolean }) {
  if (!held) {
    return (
      <div className="ba__row ba__row--none">
        <span className="ba__when">{when}</span>
        <span className="ba__none">Not mapped</span>
      </div>
    );
  }
  // Repeating the realm's own name either side of "now" answers nothing. Naming a
  // realm only where power actually changed hands makes the change the thing you see.
  const same = !isNow && held.group === current;
  return (
    <button
      className={`ba__row ${isNow ? "is-now" : ""}`}
      onClick={() => !isNow && setYear(held.year)}
      disabled={isNow}
    >
      <span className="ba__when">{when}</span>
      {same ? (
        <span className="ba__same">Same realm</span>
      ) : (
        <>
          <span className="ba__swatch" style={{ background: held.color }} />
          <span className={`ba__name ${isNow ? "" : "is-changed"}`}>{held.name}</span>
        </>
      )}
      <span className="ba__year tnum">{formatYear(held.year)}</span>
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="sheet__section">
      <h3 className="eyebrow sheet__sectionTitle">{title}</h3>
      <div className="sheet__rows">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="sheet__row">
      <span className="sheet__rowLabel">{label}</span>
      <span className="sheet__rowValue">{value}</span>
    </div>
  );
}

function EntityRow({ e, muted, region }: { e: Entity; muted?: boolean; region?: string }) {
  const isPoint = e.kind === "event" && e.startYear === e.endYear;
  return (
    <button
      className={`erow ${muted ? "is-muted" : ""}`}
      onClick={() => {
        select({ kind: "entity", entity: e });
        const mid = isPoint ? e.startYear : Math.round((e.startYear + e.endYear) / 2);
        setYear(mid);
        if (store.get().zoom < 3) mapController.frameEntity(e);
      }}
    >
      <span className="erow__icon">
        <Icon
          name={e.kind === "ruler" ? "ruler" : e.kind === "event" ? eventIcon(e.category) : figureIcon(e.category)}
          size={14}
        />
      </span>
      <span className="erow__name">{e.name}</span>
      {region && <span className="erow__region">{region}</span>}
      <span className="erow__years tnum">
        {isPoint ? Math.abs(e.startYear) : `${Math.abs(e.startYear)}–${Math.abs(e.endYear)}`}
      </span>
    </button>
  );
}
