import { useMemo } from "react";
import { store, useAtlas, select, setYear, follow } from "../app/store";
import { Icon, eventIcon, figureIcon } from "../design/icons";
import { mapController } from "../map/HistoricalMap";
import { formatYear, centuryLabel, asset } from "../util";
import type { Entity, PolitySelection } from "../types";

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

export default function EntityPanel() {
  const selection = useAtlas((s) => s.selection);
  const entities = useAtlas((s) => s.entities);
  const year = useAtlas((s) => s.year);

  const close = () => select(null);

  if (!selection) return null;

  return (
    <aside className="sheet" role="complementary" aria-label="Details">
      <button className="sheet__close" onClick={close} aria-label="Close">
        <Icon name="close" size={16} />
      </button>
      {selection.kind === "polity"
        ? <PolityView p={selection} entities={entities} year={year} />
        : <EntityView e={selection.entity} entities={entities} />}
    </aside>
  );
}

function PolityView({ p, entities, year }: { p: PolitySelection; entities: Entity[]; year: number }) {
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

  const tierName = p.tier === 0 ? "Major realm" : p.tier === 1 ? "Regional power" : "Minor polity";

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

      <p className="sheet__fine">
        Borders come from the nearest mapped snapshot rather than a reconstruction of this
        exact year.
      </p>
    </div>
  );
}

function EntityView({ e, entities }: { e: Entity; entities: Entity[] }) {
  const kindLabel = e.kind === "ruler" ? "Ruler" : e.kind === "figure" ? "Figure" : "Event";
  const isPoint = e.kind === "event" && e.startYear === e.endYear;
  const span = isPoint
    ? formatYear(e.startYear)
    : `${formatYear(e.startYear)} – ${formatYear(e.endYear)}`;
  const verb = e.kind === "ruler" ? "Reigned" : e.kind === "figure" ? "Lived" : "Dated";

  const peers = useMemo(() => {
    if (!e.category) return [];
    return entities
      .filter((o) => o.id !== e.id && o.category && related(e.category!, o.category) && o.kind === "ruler")
      .sort((a, b) => a.startYear - b.startYear)
      .slice(0, 6);
  }, [entities, e]);

  const contemporaries = useMemo(() => {
    const mid = Math.round((e.startYear + e.endYear) / 2);
    return entities
      .filter((o) => o.id !== e.id && o.kind !== "event" && o.startYear <= mid && mid <= o.endYear)
      .sort((a, b) => b.prominence - a.prominence)
      .slice(0, 5);
  }, [entities, e]);

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

      {peers.length > 0 && (
        <Section title="Others who held this realm">
          {peers.map((p) => <EntityRow key={p.id} e={p} />)}
        </Section>
      )}

      {contemporaries.length > 0 && (
        <Section title="Alive at the same time">
          {contemporaries.map((c) => <EntityRow key={c.id} e={c} />)}
        </Section>
      )}

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

function EntityRow({ e, muted }: { e: Entity; muted?: boolean }) {
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
      <span className="erow__years tnum">
        {isPoint ? Math.abs(e.startYear) : `${Math.abs(e.startYear)}–${Math.abs(e.endYear)}`}
      </span>
    </button>
  );
}
