import { useEffect, useMemo, useState } from "react";
import MapView from "./map/MapView";
import TimelineSlider from "./timeline/TimelineSlider";
import Legend from "./panels/Legend";
import AboutModal from "./panels/AboutModal";
import DetailPanel, { type Selection } from "./panels/DetailPanel";
import { loadEntities } from "./data/entities";
import { eraForYear } from "./map/eras";
import type { Entity } from "./types";
import type { PolityLabel } from "./map/borders";

export default function App() {
  const [year, setYear] = useState(1500);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [snapshotYear, setSnapshotYear] = useState<number | null>(null);
  const [labels, setLabels] = useState<PolityLabel[]>([]);
  const [aboutOpen, setAboutOpen] = useState(false);

  useEffect(() => {
    loadEntities().then(setEntities).catch((e) => console.error("entities", e));
  }, []);

  const era = eraForYear(year);
  const topPolities = useMemo(
    () => labels.slice(0, 7).map((l) => ({ name: l.name, color: l.color })),
    [labels],
  );

  return (
    <div className="app">
      <MapView
        year={year}
        entities={entities}
        onSelectPolity={(p) => setSelection({ kind: "polity", polity: p })}
        onSelectEntity={(e) => setSelection({ kind: "entity", entity: e })}
        onSnapshotChange={(sy, lbls) => {
          setSnapshotYear(sy);
          setLabels(lbls);
        }}
      />

      <header className="title">
        <h1 className="title__name">Atlas of Power</h1>
        <p className="title__sub">Kingdoms, rulers &amp; events through time</p>
      </header>

      <Legend
        eraName={era.name}
        snapshotYear={snapshotYear}
        displayYear={year}
        topPolities={topPolities}
        onAbout={() => setAboutOpen(true)}
      />

      <TimelineSlider year={year} setYear={setYear} snapshotYear={snapshotYear} eraName={era.name} />

      <footer className="credits">
        <a href="https://github.com/aourednik/historical-basemaps" target="_blank" rel="noopener noreferrer">
          historical-basemaps
        </a>{" · "}
        <a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener noreferrer">
          Natural Earth
        </a>{" · "}
        <a href="https://maplibre.org/" target="_blank" rel="noopener noreferrer">
          MapLibre
        </a>
      </footer>

      <DetailPanel selection={selection} onClose={() => setSelection(null)} />
      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </div>
  );
}
