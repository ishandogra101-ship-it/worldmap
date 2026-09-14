import { useEffect, useMemo, useRef, useState } from "react";
import { store, useAtlas, setYear, select } from "../app/store";
import { search, GROUP_LABEL, type SearchResult, type ResultKind } from "./searchIndex";
import { mapController } from "../map/HistoricalMap";
import { Icon, type IconName } from "../design/icons";

const KIND_ICON: Record<ResultKind, IconName> = {
  year: "event",
  ruler: "ruler",
  figure: "person",
  event: "battle",
  polity: "polity",
  action: "command",
};

const SUGGESTIONS = [
  "Akbar", "1492", "Mongol", "Leonardo", "Constantinople", "1066",
];

export default function CommandPalette() {
  const open = useAtlas((s) => s.commandOpen);
  const entities = useAtlas((s) => s.entities);
  const polities = useAtlas((s) => s.polities);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const results = useMemo(
    () => search({ query: q, entities, polities }),
    [q, entities, polities],
  );

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => setActive(0), [q]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const close = () => store.set({ commandOpen: false });

  const run = (r: SearchResult) => {
    if (r.kind === "year" && r.year !== undefined) {
      setYear(r.year);
    } else if (r.entity) {
      setYear(
        r.entity.kind === "event"
          ? r.entity.startYear
          : Math.round((r.entity.startYear + r.entity.endYear) / 2),
      );
      select({ kind: "entity", entity: r.entity });
      mapController.frameEntity(r.entity);
    } else if (r.polity) {
      select({
        kind: "polity", name: r.polity.name, group: r.polity.group,
        color: r.polity.color, tier: r.polity.tier, area: r.polity.area,
        snapshotYear: store.get().snapshotYear ?? store.get().year,
      });
      mapController.framePolity(r.polity);
    }
    close();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (results[active]) run(results[active]); }
  };

  // group while preserving overall rank order
  const groups: { kind: ResultKind; items: { r: SearchResult; i: number }[] }[] = [];
  results.forEach((r, i) => {
    let g = groups.find((x) => x.kind === r.kind);
    if (!g) { g = { kind: r.kind, items: [] }; groups.push(g); }
    g.items.push({ r, i });
  });

  return (
    <div className="palette-scrim" onPointerDown={close}>
      <div
        className="palette"
        role="dialog"
        aria-label="Search history"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="palette__field">
          <Icon name="search" size={17} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search a person, realm, event or year"
            aria-label="Search"
            spellCheck={false}
            autoComplete="off"
          />
          <kbd className="palette__esc">esc</kbd>
        </div>

        <div className="palette__body" ref={listRef}>
          {!q && (
            <div className="palette__empty">
              <p className="palette__emptyTitle">Search across history</p>
              <div className="palette__chips">
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="chip" onClick={() => setQ(s)}>{s}</button>
                ))}
              </div>
            </div>
          )}

          {q && results.length === 0 && (
            <div className="palette__empty">
              <p className="palette__emptyTitle">Nothing matched “{q}”</p>
              <p className="palette__emptyBody">
                The atlas holds only what has been mapped so far. Realms are searched
                within the year currently drawn.
              </p>
            </div>
          )}

          {groups.map((g) => (
            <div key={g.kind} className="palette__group">
              <div className="eyebrow palette__groupLabel">{GROUP_LABEL[g.kind]}</div>
              {g.items.map(({ r, i }) => (
                <button
                  key={r.id}
                  data-i={i}
                  className={`presult ${i === active ? "is-active" : ""}`}
                  onPointerEnter={() => setActive(i)}
                  onClick={() => run(r)}
                >
                  <span className="presult__icon"><Icon name={KIND_ICON[r.kind]} size={15} /></span>
                  <span className="presult__text">
                    <span className="presult__title">{r.title}</span>
                    {r.subtitle && <span className="presult__sub">{r.subtitle}</span>}
                  </span>
                  {r.detail && <span className="presult__detail tnum">{r.detail}</span>}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
