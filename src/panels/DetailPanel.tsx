import type { Entity, PolitySelection } from "../types";
import { formatYear } from "../util";
import { portraitSrc } from "../map/markers";

export type Selection =
  | { kind: "polity"; polity: PolitySelection }
  | { kind: "entity"; entity: Entity }
  | null;

const KIND_LABEL: Record<Entity["kind"], string> = {
  ruler: "Ruler",
  figure: "Figure",
  event: "Event",
};

function dateRange(e: Entity): string {
  if (e.kind === "event" && e.startYear === e.endYear) return formatYear(e.startYear);
  const verb = e.kind === "ruler" ? "reigned" : e.kind === "figure" ? "lived" : "";
  const range = `${formatYear(e.startYear)} – ${formatYear(e.endYear)}`;
  return verb ? `${verb} ${range}` : range;
}

export default function DetailPanel({
  selection,
  onClose,
}: {
  selection: Selection;
  onClose: () => void;
}) {
  if (!selection) return null;

  return (
    <aside className="panel">
      <button className="panel__close" onClick={onClose} aria-label="Close">
        &times;
      </button>
      {selection.kind === "entity" ? (
        <EntityView e={selection.entity} />
      ) : (
        <PolityView p={selection.polity} />
      )}
    </aside>
  );
}

function EntityView({ e }: { e: Entity }) {
  return (
    <div className="panel__body">
      <div className="panel__top">
        {e.portrait ? (
          <img className="panel__portrait" src={portraitSrc(e.portrait)} alt={e.name} />
        ) : (
          <span className={`panel__badge panel__badge--${e.kind}`} aria-hidden="true">
            {e.kind === "ruler" ? "\u{1F451}" : e.kind === "figure" ? "⭐" : "⚔\u{FE0F}"}
          </span>
        )}
        <div>
          <span className="panel__kind">{KIND_LABEL[e.kind]}</span>
          <h2 className="panel__name">{e.name}</h2>
          {e.category && <div className="panel__meta">{e.category}</div>}
        </div>
      </div>
      <div className="panel__dates">{dateRange(e)}</div>
      {e.description && <p className="panel__desc">{e.description}</p>}
      <div className="panel__foot">
        {e.source && (
          <a href={e.source} target="_blank" rel="noopener noreferrer" className="panel__source">
            Source{" ↗"}
          </a>
        )}
        {e.portraitCredit && <span className="panel__credit">Portrait: {e.portraitCredit}</span>}
      </div>
    </div>
  );
}

function PolityView({ p }: { p: PolitySelection }) {
  const subject = p.subjectTo && p.subjectTo !== p.name ? p.subjectTo : null;
  const part = p.partOf && p.partOf !== p.name && p.partOf !== p.subjectTo ? p.partOf : null;
  const search = `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(p.name)}`;
  return (
    <div className="panel__body">
      <div className="panel__top">
        <span className="panel__swatch" style={{ background: p.color }} aria-hidden="true" />
        <div>
          <span className="panel__kind">Polity</span>
          <h2 className="panel__name">{p.name}</h2>
        </div>
      </div>
      <div className="panel__dates">Shown as of {formatYear(p.snapshotYear)}</div>
      {subject && (
        <p className="panel__desc">
          Subject to <strong>{subject}</strong>.
        </p>
      )}
      {part && (
        <p className="panel__desc">
          Part of <strong>{part}</strong>.
        </p>
      )}
      <div className="panel__foot">
        <a href={search} target="_blank" rel="noopener noreferrer" className="panel__source">
          Look up on Wikipedia{" ↗"}
        </a>
      </div>
    </div>
  );
}
