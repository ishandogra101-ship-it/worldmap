import { formatYear } from "../util";

interface Props {
  eraName: string;
  snapshotYear: number | null;
  displayYear: number;
  topPolities: { name: string; color: string }[];
  onAbout: () => void;
}

export default function Legend({ eraName, snapshotYear, displayYear, topPolities, onAbout }: Props) {
  const gap = snapshotYear !== null && snapshotYear !== displayYear;
  return (
    <div className="legend">
      <div className="legend__era">{eraName}</div>
      <div className="legend__snap">
        {snapshotYear !== null ? `Borders mapped at ${formatYear(snapshotYear)}` : "Loading…"}
        {gap && <span className="legend__gap"> (nearest snapshot)</span>}
      </div>
      {topPolities.length > 0 && (
        <ul className="legend__list">
          {topPolities.map((p) => (
            <li key={p.name} className="legend__item">
              <span className="legend__swatch" style={{ background: p.color }} />
              <span className="legend__name">{p.name}</span>
            </li>
          ))}
        </ul>
      )}
      <button className="legend__about" onClick={onAbout}>
        About &amp; sources
      </button>
    </div>
  );
}
