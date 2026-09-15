import type { CanonPolity } from "../data/canon";

/**
 * Why this is on the map.
 *
 * Not a confidence badge. The atlas does not hedge on what it shows — a record
 * either belongs here or it does not, and the research layer decides that
 * before anything is drawn. What this answers is a different question, the one
 * a reader is entitled to ask of any historical claim: on whose authority?
 *
 * So it names the works, says who last looked at the record and when, and is
 * otherwise out of the way.
 */
export default function Provenance({ p }: { p: CanonPolity }) {
  const drawn = p.verification === "drafted";
  return (
    <div className="prov">
      <div className="eyebrow">Why this is here</div>
      <p className="prov__line">
        <strong>{p.name}</strong>, {p.from < 0 ? `${-p.from} BCE` : `${p.from} CE`}
        {p.to === null ? " onward" : ` to ${p.to < 0 ? `${-p.to} BCE` : `${p.to} CE`}`}.
        {p.notes ? ` ${p.notes}` : ""}
      </p>
      <ul className="prov__sources">
        {p.sources.map((s) => <li key={s}>{s}</li>)}
      </ul>
      <p className="prov__state">
        {drawn
          ? `Written for this atlas against the works above and not yet checked against them by a person. Last touched ${p.reviewed}.`
          : `Reviewed against the works above on ${p.reviewed}.`}
      </p>
    </div>
  );
}
