import { useEffect, useRef, useState } from "react";
import { MIN_YEAR, MAX_YEAR, formatYear, formatYearShort, clamp } from "../util";
import { allEras } from "../map/eras";

interface Props {
  year: number;
  setYear: (y: number) => void;
  snapshotYear: number | null;
  eraName: string;
}

const STEP_YEARS = 8;
const TICK_MS = 70;

export default function TimelineSlider({ year, setYear, snapshotYear, eraName }: Props) {
  const [playing, setPlaying] = useState(false);
  const timer = useRef<number | null>(null);
  const yearRef = useRef(year);
  yearRef.current = year;

  useEffect(() => {
    if (!playing) return;
    timer.current = window.setInterval(() => {
      const next = yearRef.current + STEP_YEARS;
      if (next >= MAX_YEAR) {
        setYear(MAX_YEAR);
        setPlaying(false);
      } else {
        setYear(next);
      }
    }, TICK_MS);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [playing, setYear]);

  const pct = ((year - MIN_YEAR) / (MAX_YEAR - MIN_YEAR)) * 100;
  const snapNote =
    snapshotYear !== null && snapshotYear !== year
      ? `borders as of ${formatYear(snapshotYear)}`
      : "borders for this year";

  return (
    <div className="timeline">
      <div className="timeline__head">
        <button
          className="timeline__play"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? "Pause" : "Play through time"}
        >
          {playing ? "⏸" : "▶"}
        </button>
        <div className="timeline__readout">
          <span className="timeline__year">{formatYear(year)}</span>
          <span className="timeline__era">{eraName}</span>
        </div>
        <div className="timeline__snap">{snapNote}</div>
      </div>

      <div className="timeline__track">
        <div className="timeline__bands" aria-hidden="true">
          {allEras().map((e, i, arr) => {
            const start = Math.max(e.startYear, MIN_YEAR);
            const end = i + 1 < arr.length ? arr[i + 1].startYear : MAX_YEAR;
            const left = ((start - MIN_YEAR) / (MAX_YEAR - MIN_YEAR)) * 100;
            const width = ((end - start) / (MAX_YEAR - MIN_YEAR)) * 100;
            return (
              <span
                key={e.id}
                className="timeline__band"
                title={e.name}
                style={{ left: `${left}%`, width: `${width}%`, background: e.ocean }}
              >
                {width > 9 && <span className="timeline__bandlabel">{e.name}</span>}
              </span>
            );
          })}
        </div>
        <input
          className="timeline__range"
          type="range"
          min={MIN_YEAR}
          max={MAX_YEAR}
          step={1}
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          style={{ ["--fill" as string]: `${pct}%` }}
        />
        <div className="timeline__scale" aria-hidden="true">
          {[-3000, -2000, -1000, 1, 500, 1000, 1500, 1800, 2026].map((y) => {
            const left = ((y - MIN_YEAR) / (MAX_YEAR - MIN_YEAR)) * 100;
            return (
              <span key={y} className="timeline__scaletick" style={{ left: `${left}%` }}>
                {formatYearShort(y)}
              </span>
            );
          })}
        </div>
      </div>

      <div className="timeline__jump">
        <button onClick={() => setYear(clamp(year - 25, MIN_YEAR, MAX_YEAR))} aria-label="Back 25 years">
          &minus;25
        </button>
        <input
          className="timeline__input"
          type="number"
          value={year}
          min={MIN_YEAR}
          max={MAX_YEAR}
          onChange={(e) => setYear(clamp(Number(e.target.value) || 0, MIN_YEAR, MAX_YEAR))}
          aria-label="Jump to year"
        />
        <button onClick={() => setYear(clamp(year + 25, MIN_YEAR, MAX_YEAR))} aria-label="Forward 25 years">
          +25
        </button>
      </div>
    </div>
  );
}
