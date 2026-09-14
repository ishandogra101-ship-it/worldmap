import { useEffect } from "react";
import HistoricalMap from "./map/HistoricalMap";
import Timeline from "./timeline/Timeline";
import Hud from "./hud/Hud";
import Moment from "./hud/Moment";
import Tooltip from "./hud/Tooltip";
import Onboarding from "./hud/Onboarding";
import EntityPanel from "./panels/EntityPanel";
import About from "./panels/About";
import CommandPalette from "./search/CommandPalette";
import { loadEntities } from "./data/entities";
import { store, useAtlas, setYear, select } from "./app/store";
import { yearToFrac, fracToYear } from "./timeline/timeScale";

function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

export default function App() {
  const theme = useAtlas((s) => s.theme);
  const loading = useAtlas((s) => s.loadingMap);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // handle used by the screenshot/regression harness
  useEffect(() => {
    (window as unknown as { __atlasSetYear?: (y: number) => void }).__atlasSetYear = setYear;
  }, []);

  useEffect(() => {
    loadEntities()
      .then((entities) => store.set({ entities, booted: true }))
      .catch(() => store.set({ booted: true }));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = store.get();

      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        store.set({ commandOpen: !s.commandOpen });
        return;
      }
      if (isTyping(e.target)) return;

      if (e.key === "Escape") {
        if (s.commandOpen) store.set({ commandOpen: false });
        else if (s.aboutOpen) store.set({ aboutOpen: false });
        else if (s.selection) select(null);
        return;
      }
      if (e.key === "/") { e.preventDefault(); store.set({ commandOpen: true }); return; }
      if (e.key === " ") { e.preventDefault(); store.set({ playing: !s.playing }); return; }

      const nudge = (mult: number) => {
        e.preventDefault();
        store.set({ playing: false });
        setYear(fracToYear(yearToFrac(store.get().year) + mult));
      };
      if (e.key === "ArrowLeft") nudge(e.shiftKey ? -0.02 : -0.004);
      else if (e.key === "ArrowRight") nudge(e.shiftKey ? 0.02 : 0.004);
      else if (e.key === "PageUp") nudge(-0.06);
      else if (e.key === "PageDown") nudge(0.06);
      else if (e.key === "Home") { e.preventDefault(); setYear(-3000); }
      else if (e.key === "End") { e.preventDefault(); setYear(2026); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="app">
      <HistoricalMap />
      <div className="vignette" aria-hidden="true" />

      <Hud />
      <Moment />
      <Timeline />
      <EntityPanel />

      <Tooltip />
      <Onboarding />
      <CommandPalette />
      <About />

      {loading && (
        <div className="boot" role="status" aria-live="polite">
          <span className="boot__pulse" />
          <span className="boot__text">Drawing the world</span>
        </div>
      )}
    </div>
  );
}
