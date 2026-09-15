import { useEffect, useRef } from "react";
import { storyById, type StoryStop } from "../data/stories";
import { store, useAtlas, setYear, select, stepStory, stopStory } from "../app/store";
import { mapController } from "../map/HistoricalMap";
import { loadSnapshot } from "../map/borders";
import { loadManifest, nearestSnapshot } from "../data/snapshots";
import { Icon } from "../design/icons";
import { formatYear } from "../util";

/** Opens whatever the stop points at, once the year's borders are in. */
async function applyFocus(stop: StoryStop): Promise<void> {
  const focus = stop.focus;
  if (!focus) { select(null); return; }
  if (focus.kind === "entity") {
    const e = store.get().entities.find((x) => x.id === focus.id);
    select(e ? { kind: "entity", entity: e } : null);
    return;
  }
  const group = focus.group;
  const manifest = await loadManifest();
  const snap = nearestSnapshot(manifest, stop.year);
  const { byGroup } = await loadSnapshot(snap.file);
  const p = byGroup.get(group);
  if (!p) { select(null); return; }
  select({
    kind: "polity", name: p.name, group: p.group, color: p.color,
    tier: p.tier, area: p.area, lng: p.lng, lat: p.lat, snapshotYear: snap.year,
  });
}

export default function StoryPlayer() {
  const story = useAtlas((s) => s.story);
  const s = story ? storyById(story.id) : undefined;
  const index = story?.index ?? 0;
  const stop: StoryStop | undefined = s?.stops[index];
  const lastKey = useRef("");

  // arrive at the stop: year, camera, panel
  useEffect(() => {
    if (!s || !stop) return;
    const key = `${s.id}:${index}`;
    if (lastKey.current === key) return;
    lastKey.current = key;
    setYear(stop.year);
    mapController.flyTo(stop.lng, stop.lat, stop.zoom);
    void applyFocus(stop);
  }, [s, stop, index]);

  useEffect(() => {
    if (!s) { lastKey.current = ""; return; }
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.key === "ArrowRight") { e.preventDefault(); stepStory(1, s.stops.length); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); stepStory(-1, s.stops.length); }
      else if (e.key === "Escape") { e.preventDefault(); stopStory(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [s]);

  if (!s || !stop) return null;
  const last = index === s.stops.length - 1;

  return (
    <aside className="story" aria-label={s.title}>
      <div className="story__head">
        <span className="eyebrow">{s.title}</span>
        <button className="story__close" onClick={stopStory} aria-label="Leave this story">
          <Icon name="close" size={12} />
        </button>
      </div>

      <p className="story__caption">{stop.caption}</p>

      <div className="story__foot">
        <div className="story__marks" aria-hidden="true">
          {s.stops.map((st, i) => (
            <button
              key={i}
              className={`story__mark ${i === index ? "is-on" : ""} ${i < index ? "is-done" : ""}`}
              onClick={() => store.set({ story: { id: s.id, index: i } })}
              title={formatYear(st.year)}
              tabIndex={-1}
            />
          ))}
        </div>
        <div className="story__nav">
          <button
            className="tbtn"
            onClick={() => stepStory(-1, s.stops.length)}
            disabled={index === 0}
            aria-label="Previous"
          >
            <Icon name="stepBack" size={14} />
          </button>
          <button className="btn btn--quiet" onClick={() => stepStory(1, s.stops.length)}>
            {last ? "Finish" : "Next"}
            {!last && <Icon name="chevron" size={13} />}
          </button>
        </div>
      </div>
    </aside>
  );
}
