import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { yearToFrac, fracToYear, buildTicks } from "./timeScale";
import { loadManifest } from "../data/snapshots";
import { store, useAtlas, setYear, unfollow, setCompareYear, toggleCompare } from "../app/store";
import { Icon } from "../design/icons";
import { MIN_YEAR, MAX_YEAR, centuryLabel, eraForYear, ERAS, formatYear, yearNumber, yearSuffix } from "../util";
import type { BorderManifestEntry } from "../types";

/** A full sweep of history takes this long, measured on the track rather than
 *  in years — so playback moves at a constant visual speed across a non-linear
 *  scale instead of racing through antiquity. */
const SWEEP_MS = 78_000;

export default function Timeline() {
  const year = useAtlas((s) => s.year);
  const snapshotYear = useAtlas((s) => s.snapshotYear);
  const playing = useAtlas((s) => s.playing);
  const followed = useAtlas((s) => s.followed);
  const compareYear = useAtlas((s) => s.compareYear);
  const entities = useAtlas((s) => s.entities);

  const trackRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(880);
  const [snapshots, setSnapshots] = useState<BorderManifestEntry[]>([]);
  const draggingRef = useRef(false);
  /** which of the two handles the current drag is moving */
  const grabbed = useRef<"a" | "b">("a");

  useEffect(() => { loadManifest().then(setSnapshots).catch(() => {}); }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  const ticks = useMemo(() => buildTicks(width), [width]);

  /**
   * Recorded events as a density band, bucketed along the track.
   *
   * One element per event was fine for a few dozen curated ones and is not fine
   * for the thousands the Wikidata import brings: it put a DOM node in the
   * timeline for every event in history, and rebuilt the list on every tick of
   * playback. Bucketing gives a fixed number of bars, and a band that actually
   * reads as density rather than as a solid smear.
   */
  const density = useMemo(() => {
    const BUCKETS = 180;
    const counts = new Array<number>(BUCKETS).fill(0);
    for (const e of entities) {
      if (e.kind !== "event") continue;
      const i = Math.min(BUCKETS - 1, Math.max(0, Math.floor(yearToFrac(e.startYear) * BUCKETS)));
      counts[i]++;
    }
    const max = Math.max(1, ...counts);
    return counts.map((n, i) => ({ i, n, share: n / max }));
  }, [entities]);
  const frac = yearToFrac(year);
  const era = eraForYear(year);

  // --- playback: advance along the track, not along the years ---
  //
  // Following a realm scopes the sweep to the years it was mapped in, so play
  // watches one empire rise and fall instead of all of history. A short span
  // still gets enough seconds to read rather than flashing past.
  useEffect(() => {
    if (!playing) return;
    const f = store.get().followed;
    const lo = f ? yearToFrac(f.from) : 0;
    const hi = f ? yearToFrac(f.to) : 1;
    const span = Math.max(hi - lo, 1e-4);
    const duration = f ? Math.max(SWEEP_MS * span, 9_000) : SWEEP_MS;

    // Position is held as a fraction of the track. Reading it back out of the
    // year each frame rounds the sub-year step away and stops playback dead
    // wherever the scale is dense, which is most of the last six centuries.
    let pos = yearToFrac(store.get().year);
    if (pos < lo || pos >= hi) pos = lo;

    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = now - last;
      last = now;
      pos += (dt / duration) * span;
      if (pos >= hi) {
        setYear(f ? f.to : MAX_YEAR);
        store.set({ playing: false });
        return;
      }
      setYear(fracToYear(pos));
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const seekFromClientX = useCallback((clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const y = fracToYear((clientX - r.left) / r.width);
    if (grabbed.current === "b") setCompareYear(y);
    else setYear(y);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    draggingRef.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    store.set({ playing: false });
    // with the split open there are two handles; grab whichever is nearer
    const cy = store.get().compareYear;
    if (cy === null) {
      grabbed.current = "a";
    } else {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const f = (e.clientX - r.left) / r.width;
      grabbed.current =
        Math.abs(f - yearToFrac(cy)) < Math.abs(f - yearToFrac(store.get().year)) ? "b" : "a";
    }
    seekFromClientX(e.clientX);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    seekFromClientX(e.clientX);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    draggingRef.current = false;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const onWheel = (e: React.WheelEvent) => {
    const delta = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY);
    setYear(fracToYear(yearToFrac(store.get().year) + delta * 0.00035));
  };

  const nudge = (steps: number) => {
    store.set({ playing: false });
    setYear(fracToYear(yearToFrac(store.get().year) + steps * 0.004));
  };

  const snapDiff = snapshotYear !== null && snapshotYear !== year;

  return (
    <div className="timeline">
      <div className="timeline__head">
        <div className="timeline__transport">
          <button className="tbtn" onClick={() => nudge(-1)} aria-label="Step back">
            <Icon name="stepBack" size={15} />
          </button>
          <button
            className="tbtn tbtn--play"
            onClick={() => store.set({ playing: !playing })}
            aria-label={playing ? "Pause" : "Play through history"}
          >
            <Icon name={playing ? "pause" : "play"} size={16} />
          </button>
          <button className="tbtn" onClick={() => nudge(1)} aria-label="Step forward">
            <Icon name="stepForward" size={15} />
          </button>
        </div>

        <div className="timeline__readout">
          {compareYear === null ? (
            <>
              <div className="timeline__year tnum">
                {yearNumber(year)}<span className="timeline__suffix">{yearSuffix(year)}</span>
              </div>
              <div className="timeline__sub">
                <span>{centuryLabel(year)}</span>
                <span className="timeline__dot" />
                <span>{era.name}</span>
              </div>
            </>
          ) : (
            <>
              <div className="timeline__pair tnum">
                <span>{yearNumber(year)}<span className="timeline__suffix">{yearSuffix(year)}</span></span>
                <span className="timeline__pairRule" aria-hidden="true" />
                <span className="timeline__yearB">
                  {yearNumber(compareYear)}<span className="timeline__suffix">{yearSuffix(compareYear)}</span>
                </span>
              </div>
              <div className="timeline__sub">
                <span>{Math.abs(compareYear - year)} years apart</span>
                <span className="timeline__dot" />
                <button className="timeline__plain" onClick={toggleCompare}>Leave compare</button>
              </div>
            </>
          )}
        </div>

        <div className="timeline__meta">
          {followed && (
            <button className="chip chip--follow" onClick={unfollow}>
              <Icon name="follow" size={12} />
              <span>{followed.label}</span>
              <Icon name="close" size={11} />
            </button>
          )}
          <div className={`snapnote ${snapDiff ? "is-approx" : ""}`}>
            <span className="snapnote__label">Map snapshot</span>
            <span className="snapnote__year tnum">
              {snapshotYear === null ? "—" : formatYear(snapshotYear)}
            </span>
            {snapDiff && <span className="snapnote__hint">nearest mapped year</span>}
          </div>
        </div>
      </div>

      <div
        className="timeline__track"
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Year"
        aria-valuemin={MIN_YEAR}
        aria-valuemax={MAX_YEAR}
        aria-valuenow={year}
        aria-valuetext={formatYear(year)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        <div className="tl-eras" aria-hidden="true">
          {ERAS.map((e, i) => {
            const from = Math.max(e.start, MIN_YEAR);
            const to = i + 1 < ERAS.length ? ERAS[i + 1].start : MAX_YEAR;
            const l = yearToFrac(from) * 100;
            const w = (yearToFrac(to) - yearToFrac(from)) * 100;
            return (
              <span
                key={e.id}
                className="tl-era"
                style={{ left: `${l}%`, width: `${w}%` }}
                title={e.name}
              >
                {w > 7 && <span className="tl-era__name">{e.name}</span>}
              </span>
            );
          })}
        </div>

        {/* years we actually have borders for — makes snapping legible */}
        <div className="tl-snaps" aria-hidden="true">
          {snapshots.map((s) => (
            <span
              key={s.year}
              className={`tl-snap ${s.year === snapshotYear ? "is-active" : ""}`}
              style={{ left: `${yearToFrac(s.year) * 100}%` }}
            />
          ))}
        </div>

        {/* recorded events, as a density band */}
        <div className="tl-events" aria-hidden="true">
          {density.map(({ i, n, share }) =>
            n === 0 ? null : (
              <span
                key={i}
                className="tl-event"
                style={{
                  left: `${(i / density.length) * 100}%`,
                  width: `${100 / density.length}%`,
                  opacity: 0.25 + share * 0.75,
                  transform: `scaleY(${0.35 + share * 0.65})`,
                }}
              />
            ),
          )}
        </div>

        {followed && (
          <div
            className="tl-followband"
            aria-hidden="true"
            style={{
              left: `${yearToFrac(followed.from) * 100}%`,
              width: `${(yearToFrac(followed.to) - yearToFrac(followed.from)) * 100}%`,
            }}
          />
        )}

        <div className="tl-rail" aria-hidden="true">
          {compareYear === null ? (
            <div className="tl-rail__fill" style={{ width: `${frac * 100}%` }} />
          ) : (
            <div
              className="tl-rail__span"
              style={{
                left: `${Math.min(frac, yearToFrac(compareYear)) * 100}%`,
                width: `${Math.abs(yearToFrac(compareYear) - frac) * 100}%`,
              }}
            />
          )}
        </div>

        <div className="tl-ticks" aria-hidden="true">
          {ticks.map((t) => (
            <span
              key={t.year}
              className={`tl-tick ${t.major ? "is-major" : ""}`}
              style={{ left: `${yearToFrac(t.year) * 100}%` }}
            >
              {t.label && <span className="tl-tick__label tnum">{t.label}</span>}
            </span>
          ))}
        </div>

        <div className="tl-handle" style={{ left: `${frac * 100}%` }} aria-hidden="true">
          <span className="tl-handle__grip" />
        </div>

        {compareYear !== null && (
          <div
            className="tl-handle tl-handle--b"
            style={{ left: `${yearToFrac(compareYear) * 100}%` }}
            aria-hidden="true"
          >
            <span className="tl-handle__grip" />
          </div>
        )}
      </div>
    </div>
  );
}
