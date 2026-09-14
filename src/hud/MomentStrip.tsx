import { useEffect, useMemo, useRef, useState } from "react";
import { useAtlas, select, store } from "../app/store";
import { Icon, eventIcon } from "../design/icons";
import { mapController } from "../map/HistoricalMap";
import { formatYear } from "../util";
import type { Entity } from "../types";

/**
 * When the timeline lands on a year that something is recorded for, say what it
 * was. This is the payoff for scrubbing: the year stops being a number and
 * becomes a moment.
 *
 * Deliberately narrow in what it will interrupt for — a couple of years either
 * side of a well-documented event — and it waits for the scrub to settle so it
 * never flickers past while you drag.
 */
const WINDOW = 2;
const MIN_PROMINENCE = 68;
const SETTLE_MS = 420;

export default function MomentStrip() {
  const year = useAtlas((s) => s.year);
  const entities = useAtlas((s) => s.entities);
  const selection = useAtlas((s) => s.selection);
  const [settled, setSettled] = useState(year);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setSettled(year), SETTLE_MS);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [year]);

  const moment = useMemo<Entity | null>(() => {
    let best: Entity | null = null;
    for (const e of entities) {
      if (e.kind !== "event") continue;
      if (Math.abs(e.startYear - settled) > WINDOW) continue;
      if (e.prominence < MIN_PROMINENCE) continue;
      if (!best || e.prominence > best.prominence) best = e;
    }
    return best;
  }, [entities, settled]);

  // a panel is already telling the story; don't stack a second voice on it
  const hidden =
    !moment ||
    dismissed === moment.id ||
    (selection?.kind === "entity" && selection.entity.id === moment.id);

  if (hidden || !moment) return null;

  const open = () => {
    select({ kind: "entity", entity: moment });
    mapController.frameEntity(moment);
  };

  return (
    <div className="mstrip" role="status">
      <span className="mstrip__icon"><Icon name={eventIcon(moment.category)} size={15} /></span>
      <span className="mstrip__body">
        <span className="mstrip__year tnum">{formatYear(moment.startYear)}</span>
        <span className="mstrip__title">{moment.name}</span>
      </span>
      <button className="mstrip__go" onClick={open}>
        See this moment
        <Icon name="arrow" size={13} />
      </button>
      <button
        className="mstrip__close"
        onClick={() => { setDismissed(moment.id); store.set({ hover: null }); }}
        aria-label="Dismiss"
      >
        <Icon name="close" size={13} />
      </button>
    </div>
  );
}
