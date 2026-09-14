import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { yearToFrac, fracToYear, buildTicks } from "./timeScale";
import { loadManifest } from "../data/snapshots";
import { store, useAtlas, setYear, unfollow } from "../app/store";
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
  const eventYears = useAtlas(
    (s) => s.entities.filter((e) => e.kind === "event").map((e) => e.startYear).join(","),
  );

  const trackRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(880);
  const [snapshots, setSnapshots] = useState<BorderManifestEntry[]>([]);
  const draggingRef = useRef(false);

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
  const frac = yearToFrac(year);
  const era = eraForYear(year);

  // --- playback: advance along the track, not along the years ---
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = now - last;
      last = now;
      const cur = yearToFrac(store.get().year);
      const next = cur + dt / SWEEP_MS;
      if (next >= 1) {
        setYear(MAX_YEAR);
        store.set({ playing: false });
        return;
      }
      setYear(fracToYear(next));
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const seekFromClientX = useCallback((clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setYear(fracToYear((clientX - r.left) / r.width));
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    draggingRef.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    store.set({ playing: false });
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
          <div className="timeline__year tnum">
            {yearNumber(year)}<span className="timeline__suffix">{yearSuffix(year)}</span>
          </div>
          <div className="timeline__sub">
            <span>{centuryLabel(year)}</span>
            <span className="timeline__dot" />
            <span>{era.name}</span>
          </div>
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
          {eventYears
            .split(",")
            .filter(Boolean)
            .map((y, i) => (
              <span key={`${y}-${i}`} className="tl-event" style={{ left: `${yearToFrac(Number(y)) * 100}%` }} />
            ))}
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
          <div className="tl-rail__fill" style={{ width: `${frac * 100}%` }} />
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
      </div>
    </div>
  );
}
