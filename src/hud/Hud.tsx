import { useState } from "react";
import { store, useAtlas, toggleTheme, toggleLayer, setYear, select } from "../app/store";
import { Icon } from "../design/icons";
import { mapController } from "../map/HistoricalMap";
import type { Entity, LayerId } from "../types";

/**
 * Take me somewhere interesting.
 *
 * Weighted toward well-documented records so the first stop is legible, but not
 * locked to the top of the list — the point is to surface something the visitor
 * would never have thought to search for.
 */
function surprise(entities: Entity[]): Entity | null {
  const pool = entities.filter((e) => e.prominence >= 40);
  if (pool.length === 0) return null;
  const weights = pool.map((e) => Math.pow(e.prominence / 100, 0.6));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

const LAYERS: { id: LayerId; label: string; note: string }[] = [
  { id: "political", label: "Political", note: "Realms and their borders" },
  { id: "labels", label: "Realm names", note: "Labels, revealed by scale" },
  { id: "rulers", label: "Rulers", note: "Who held power" },
  { id: "figures", label: "Figures", note: "Thinkers, makers, explorers" },
  { id: "cities", label: "Cities", note: "Seats of power and trade" },
  { id: "events", label: "Events", note: "Battles, treaties, discoveries" },
];

export default function Hud() {
  const theme = useAtlas((s) => s.theme);
  const layers = useAtlas((s) => s.layers);
  const entities = useAtlas((s) => s.entities);
  const [layersOpen, setLayersOpen] = useState(false);

  const explore = () => {
    const pick = surprise(entities);
    if (!pick) return;
    const mid = pick.kind === "event" && pick.startYear === pick.endYear
      ? pick.startYear
      : Math.round((pick.startYear + pick.endYear) / 2);
    store.set({ playing: false });
    setYear(mid);
    select({ kind: "entity", entity: pick });
    mapController.frameEntity(pick);
  };

  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <>
      <header className="brand">
        <span className="brand__mark" aria-hidden="true"><Icon name="mark" size={26} strokeWidth={1.3} /></span>
        <span className="brand__text">
          <h1 className="brand__name">Atlas of Power</h1>
          <p className="brand__tag">The world, through time</p>
        </span>
      </header>

      <div className="hud">
        <button
          className="hud__btn hud__btn--search"
          onClick={() => store.set({ commandOpen: true })}
          aria-label="Search"
        >
          <Icon name="search" size={16} />
          <span className="hud__searchText">Search</span>
          <kbd className="hud__kbd">{isMac ? "⌘" : "Ctrl"}K</kbd>
        </button>

        <button
          className="hud__btn hud__icon"
          onClick={explore}
          aria-label="Take me somewhere interesting"
          title="Take me somewhere interesting"
        >
          <Icon name="exploration" size={17} />
        </button>

        <div className="hud__group">
          <button
            className={`hud__btn hud__icon ${layersOpen ? "is-on" : ""}`}
            onClick={() => setLayersOpen((v) => !v)}
            aria-label="Layers"
            aria-expanded={layersOpen}
          >
            <Icon name="layers" size={17} />
          </button>
          {layersOpen && (
            <>
              <div className="popover-catch" onClick={() => setLayersOpen(false)} />
              <div className="popover" role="menu" aria-label="Layers">
                <div className="eyebrow popover__title">Layers</div>
                {LAYERS.map((l) => (
                  <button
                    key={l.id}
                    className="layerrow"
                    role="menuitemcheckbox"
                    aria-checked={layers[l.id]}
                    onClick={() => toggleLayer(l.id)}
                  >
                    <span className={`layerrow__box ${layers[l.id] ? "is-on" : ""}`}>
                      {layers[l.id] && <Icon name="chevron" size={11} />}
                    </span>
                    <span className="layerrow__text">
                      <span className="layerrow__label">{l.label}</span>
                      <span className="layerrow__note">{l.note}</span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <button
          className="hud__btn hud__icon"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Switch to light" : "Switch to dark"}
        >
          <Icon name={theme === "dark" ? "sun" : "moon"} size={17} />
        </button>

        <button
          className="hud__btn hud__icon"
          onClick={() => store.set({ aboutOpen: true })}
          aria-label="About this atlas"
        >
          <Icon name="info" size={17} />
        </button>
      </div>
    </>
  );
}
