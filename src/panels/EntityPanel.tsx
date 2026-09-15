import { useEffect, useMemo, useRef, useState } from "react";
import { store, useAtlas, select, setYear, follow } from "../app/store";
import { Icon, eventIcon, figureIcon } from "../design/icons";
import { mapController } from "../map/HistoricalMap";
import { formatYear, centuryLabel, asset, roughDistance } from "../util";
import type { Entity, PolitySelection, PolitySummary } from "../types";
import { regionOf, type Region } from "../data/regions";
import { beforeAndAfter, entitiesWithin, type HeldBy } from "../map/pointLookup";
import { loadSnapshot } from "../map/borders";
import { loadManifest, nearestSnapshot } from "../data/snapshots";
import { arcFor, type Arc } from "../data/arcs";

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
  self: string,
  limit = 4,
): Array<{ region: Region; p: PolitySummary }> {
  const best = new Map<Region, PolitySummary>();
  for (const p of polities) {
    if (p.tier === 2 || p.group === self) continue;
    const r = regionOf(p.lng, p.lat);
    if (r === home || r === "Elsewhere") continue;
    const cur = best.get(r);
    // A realm with no mapped homeland is anchored on its largest holding, so it
    // lands in that holding's region: in 1900 the group "United Kingdom" sits on
    // British India. It still belongs here — the United Kingdom is what held
    // South Asia that year — but a realm actually seated in the region wins.
    const better = !cur
      || (p.hasHome !== cur.hasHome ? p.hasHome : p.area > cur.area);
    if (better) best.set(r, p);
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

  // On a phone the sheet is short enough that most realms run past its edge.
  // Cut text reads as a rendering fault unless the edge says there is more.
  const ref = useRef<HTMLElement | null>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) { setMore(false); return; }
    const check = () => setMore(el.scrollTop + el.clientHeight < el.scrollHeight - 2);
    check();
    el.addEventListener("scroll", check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", check); ro.disconnect(); };
  }, [selection]);

  if (!selection) return null;

  return (
    <aside
      ref={ref}
      className={`sheet ${more ? "has-more" : ""}`}
      role="complementary"
      aria-label="Details"
    >
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
  /**
   * Who belongs to this realm, decided by where they are rather than by what
   * their record calls the place.
   *
   * Name matching found a ruler for 17 of the 636 realms in the 1600 snapshot
   * and a figure for none of them, because an imported figure's category is a
   * field — "art", "science" — where a realm name would go. Testing the place
   * recorded for a person against the territory the realm actually holds finds
   * everyone, and needs the two vocabularies to agree about nothing.
   */
  const [within, setWithin] = useState<Entity[] | null>(null);
  useEffect(() => {
    let alive = true;
    setWithin(null);
    (async () => {
      const manifest = await loadManifest();
      const snap = nearestSnapshot(manifest, p.snapshotYear);
      const { fc } = await loadSnapshot(snap.file);
      const people = entities.filter((e) => e.kind === "ruler" || e.kind === "figure");
      const hit = entitiesWithin(fc, p.group, people);
      if (alive) setWithin(hit);
    })().catch(() => { if (alive) setWithin([]); });
    return () => { alive = false; };
  }, [entities, p.group, p.snapshotYear]);

  const here = within ?? [];
  const livingNow = (e: Entity) => e.startYear <= year && year <= e.endYear;

  /**
   * Inside this territory is not the same as belonging to this realm. In 1600
   * the Ottomans hold Egypt, so a purely geographic list put Tutankhamun under
   * their name. Everything shown is therefore scoped to the year being drawn,
   * and a person whose own record names this realm is ranked above one who
   * merely stands within it — which is what puts a sultan above the Khan of
   * Crimea rather than the other way round.
   */
  const rank = (e: Entity) => {
    const named = e.category && related(p.name, e.category) ? 1000 : 0;
    return named + e.prominence;
  };

  const rulersNow = useMemo(
    () => here.filter((e) => e.kind === "ruler" && livingNow(e))
      .sort((a, b) => rank(b) - rank(a))
      .slice(0, 8),
    [here, year, p.name],
  );
  const figures = useMemo(
    () => here.filter((e) => e.kind === "figure" && livingNow(e))
      .sort((a, b) => rank(b) - rank(a))
      .slice(0, 8),
    [here, year, p.name],
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

  // How much of the world this realm held in every snapshot it appears in.
  const [arc, setArc] = useState<Arc | null>(null);
  useEffect(() => {
    let alive = true;
    setArc(null);
    arcFor(p.group).then((a) => { if (alive) setArc(a); }).catch(() => {});
    return () => { alive = false; };
  }, [p.group]);

  // Someone already named above is not "elsewhere", however their coordinates
  // fall: Suleiman sits in Istanbul, which the region lookup calls Europe.
  const named = useMemo(
    () => new Set([...rulersNow, ...figures].map((e) => e.id)),
    [rulersNow, figures],
  );
  const elsewhere = useMemo(
    () => elsewhereAt(entities, year, regionOf(p.lng, p.lat)).filter((o) => !named.has(o.e.id)),
    [entities, year, p.lng, p.lat, named],
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

      {arc && <ArcView arc={arc} color={p.color} year={year} name={p.name} />}

      {rulersNow.length > 0 && (
        <Section title={`Ruling in ${formatYear(year)}`}>
          {rulersNow.map((r) => <EntityRow key={r.id} e={r} />)}
        </Section>
      )}

      {figures.length > 0 && (
        <Section title={`Alive here in ${formatYear(year)}`}>
          {figures.map((f) => <EntityRow key={f.id} e={f} />)}
        </Section>
      )}

      {within !== null && rulersNow.length === 0 && figures.length === 0 && (
        <p className="sheet__note">
          Nobody in the atlas is recorded within this territory in {formatYear(year)}. The
          people layer is far thinner than the border layer — about fifty rulers worldwide
          are recorded as reigning in any given year — and thinner still outside Europe.
          Absence here means unrecorded, not empty.
        </p>
      )}

      <Elsewhere
        realms={realmsElsewhere(polities, regionOf(p.lng, p.lat), p.group)}
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

  /**
   * Others who held the same realm, in a window around this one.
   *
   * The list was the first six by date, so every Ottoman panel showed Osman I
   * through Murad II and stopped: whoever you opened, you saw the founders and
   * never the succession. Mehmed II's own panel ended at his predecessor and
   * gave no hint that Bayezid II, Selim I or Suleiman followed him.
   *
   * Centring the window on the subject shows who came just before and just
   * after, which is the question a succession list is being asked. Where the
   * subject sits near one end of a dynasty the window slides rather than
   * shrinking, so a founder still gets a full list of successors.
   */
  const peers = useMemo(() => {
    if (!e.category) return [];
    const all = entities
      .filter((o) => o.id !== e.id && o.category && related(e.category!, o.category) && o.kind === "ruler")
      .sort((a, b) => a.startYear - b.startYear);
    if (all.length <= 6) return all;
    const after = all.findIndex((o) => o.startYear > e.startYear);
    const at = after === -1 ? all.length : after;
    const start = Math.min(Math.max(0, at - 3), all.length - 6);
    return all.slice(start, start + 6);
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

  /**
   * Events falling inside this life or reign, anywhere on earth.
   *
   * Sorted by how near they happened, not by when. Sorted by year, Mehmed II's
   * list opened on the Battle of St. Jakob an der Birs in Switzerland and
   * closed on the Tumu Crisis in China, under a heading reading "While Mehmed
   * ruled" — every word of it true, and an invitation to read a connection
   * that is not there. Nearest first puts Varna and Kosovo at the top, where
   * a reader of the Ottoman panel expects them.
   *
   * Nothing is filtered out. Choosing a radius would mean picking a number
   * with nothing behind it, and a distant event in the same years is worth
   * seeing. Anything outside the subject's own region carries that region
   * beside it, so the list says where as well as when and claims nothing by
   * sitting under the heading.
   */
  const during = useMemo(() => {
    if (e.kind === "event" || e.startYear === e.endYear) return [];
    const home = regionOf(e.lng, e.lat);
    return entities
      .filter((o) => o.kind === "event" && o.startYear >= e.startYear && o.startYear <= e.endYear)
      .sort((a, b) => roughDistance(a, e) - roughDistance(b, e))
      .slice(0, 6)
      .map((o) => {
        // The region boundaries are meridians and parallels, so two points a
        // few kilometres apart can fall either side of one: Mehmed sits in
        // Europe and Constantinople in West Asia, across the same strait. A
        // region is only worth printing once the distance is on the scale of a
        // region itself, which 10 degrees is and the Bosphorus is not.
        const r = regionOf(o.lng, o.lat);
        const far = roughDistance(o, e) > 100;
        return { e: o, region: r !== home && far ? r : undefined };
      });
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
          {during.map((d) => <EntityRow key={d.e.id} e={d.e} region={d.region} />)}
        </Section>
      )}

      {e.kind !== "city" && contemporaries.length > 0 && (
        <Section title="Alive at the same time">
          {contemporaries.map((c) => <EntityRow key={c.id} e={c} />)}
        </Section>
      )}

      <Elsewhere
        realms={realmsElsewhere(polities, regionOf(e.lng, e.lat), "")}
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

/**
 * A realm's extent across every snapshot it appears in.
 *
 * The dataset is 49 snapshots, not a continuous record, so this says "mapped"
 * everywhere rather than "founded" or "fell": the Ottomans first appear in the
 * 1400 snapshot but were founded around 1299, and nothing here knows that.
 * Extent is a planar measure used only for the shape of the curve — no figure
 * is shown, because none would be meaningful.
 */
function ArcView({
  arc, color, year, name,
}: { arc: Arc; color: string; year: number; name: string }) {
  const pts = arc.points;
  const first = pts[0][0];
  const last = pts[pts.length - 1][0];
  const peak = pts.reduce((m, q) => (q[1] > m[1] ? q : m), pts[0]);
  const coverage = `Mapped in ${pts.length} of ${arc.snapshots} snapshots`;
  // Naming one year the widest over-claims when several are a fraction apart:
  // the Ottomans are drawn within a percent of each other in 1530, 1600 and
  // 1650. Where that happens, name the span instead.
  const near = pts.filter((q) => q[1] >= peak[1] * 0.97);
  const widest = near.length > 1
    ? `${formatYear(near[0][0])} to ${formatYear(near[near.length - 1][0])}`
    : formatYear(peak[0]);

  if (pts.length < 2) {
    return (
      <Section title="Across the mapped record">
        <p className="sheet__note">
          {coverage} — only {formatYear(first)}. A single appearance says the borders
          were drawn for that year, not that the realm lasted one year.
        </p>
      </Section>
    );
  }

  const W = 100, H = 40;
  const maxE = Math.max(...pts.map((q) => q[1]));
  // square root, so a realm that grows sixtyfold still shows its early years
  const x = (yr: number) => ((yr - first) / (last - first)) * W;
  const h = (e: number) => Math.sqrt(e / maxE) * (H - 3);
  const line = pts.map((q) => `${x(q[0]).toFixed(2)},${(H - h(q[1])).toFixed(2)}`).join(" ");
  const area = `${x(first)},${H} ${line} ${x(last)},${H}`;
  const inSpan = year >= first && year <= last;

  return (
    <Section title="Across the mapped record">
      <ArcPlot
        pts={pts} color={color} year={year} first={first} last={last}
        W={W} H={H} line={line} area={area} x={x} h={h} peak={peak} inSpan={inSpan}
      />
      <div className="sheet__actions sheet__actions--tight">
        <button
          className="btn btn--quiet"
          onClick={() => { follow(name, first, last); setYear(first); store.set({ playing: true }); }}
        >
          <Icon name="follow" size={14} />
          Watch it change
        </button>
      </div>
      <p className="sheet__fine">
        {coverage}. Widest mapped extent {widest}.
      </p>
    </Section>
  );
}

/**
 * The plot doubles as a scrubber: the whole strip is one target that snaps to
 * the nearest mapped snapshot, rather than fifteen dots a few pixels wide.
 */
function ArcPlot({
  pts, color, year, first, last, W, H, line, area, x, h, peak, inSpan,
}: {
  pts: Array<[number, number]>; color: string; year: number;
  first: number; last: number; W: number; H: number;
  line: string; area: string;
  x: (y: number) => number; h: (e: number) => number;
  peak: [number, number]; inSpan: boolean;
}) {
  const [hoverYear, setHoverYear] = useState<number | null>(null);

  const nearest = (clientX: number, el: HTMLElement): [number, number] => {
    const r = el.getBoundingClientRect();
    const target = first + ((clientX - r.left) / r.width) * (last - first);
    return pts.reduce((m, q) => (Math.abs(q[0] - target) < Math.abs(m[0] - target) ? q : m), pts[0]);
  };

  const shown = hoverYear !== null ? pts.find((q) => q[0] === hoverYear) : null;

  return (
    <div
      className="arc"
      role="group"
      aria-label={`Extent from ${formatYear(first)} to ${formatYear(last)}`}
      onPointerMove={(ev) => setHoverYear(nearest(ev.clientX, ev.currentTarget)[0])}
      onPointerLeave={() => setHoverYear(null)}
      onClick={(ev) => setYear(nearest(ev.clientX, ev.currentTarget)[0])}
    >
      <svg className="arc__plot" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <polygon points={area} fill={color} opacity={0.26} />
        <polyline points={line} fill="none" stroke={color} strokeWidth={1.1} vectorEffect="non-scaling-stroke" />
        {inSpan && (
          <line className="arc__now" x1={x(year)} x2={x(year)} y1={0} y2={H} vectorEffect="non-scaling-stroke" />
        )}
        {shown && (
          <line className="arc__pick" x1={x(shown[0])} x2={x(shown[0])} y1={0} y2={H} vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      <span
        className="arc__peak"
        style={{ left: `${x(peak[0])}%`, bottom: `${(h(peak[1]) / H) * 100}%` }}
        aria-hidden="true"
      />
      {shown && (
        <span className="arc__read tnum" style={{ left: `${x(shown[0])}%` }}>
          {formatYear(shown[0])}
        </span>
      )}
      <div className="arc__axis">
        <span className="tnum">{formatYear(first)}</span>
        <span className="tnum">{formatYear(last)}</span>
      </div>
    </div>
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
