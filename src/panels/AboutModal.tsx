export default function AboutModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal__card" onClick={(e) => e.stopPropagation()}>
        <button className="modal__close" onClick={onClose} aria-label="Close">
          &times;
        </button>
        <h2>Atlas of Power</h2>
        <p>
          Drag the timeline to any year from 3000 BCE to 2026 and the map redraws the
          political world of that moment: who held what, and which lands no mapped state
          claimed. Rulers, notable figures, and events appear as markers &mdash; the more
          renowned show at a glance, while lesser ones surface as you zoom in.
        </p>

        <h3>How to read it</h3>
        <ul>
          <li>Each colour is one sovereign realm; a realm and its vassals share a colour.</li>
          <li>Blank land had no state in this dataset &mdash; not every corner of history is mapped.</li>
          <li>
            Marker size and the zoom at which it appears track <em>prominence</em> &mdash; a
            fame proxy (Wikipedia sitelink count for imported data, an editorial score for the
            curated set), not a claim about true importance.
          </li>
        </ul>

        <h3>Honest limits</h3>
        <ul>
          <li>
            Borders come from fixed snapshot years, so the map <strong>snaps</strong> to the
            nearest mapped year rather than morphing continuously. The legend shows which year
            is drawn.
          </li>
          <li>
            The people and events shown are a curated starter set. A bulk import from Wikidata
            (thousands of rulers and figures) is a separate step that needs network access to
            Wikidata &mdash; see the project README.
          </li>
        </ul>

        <h3>Sources</h3>
        <ul className="modal__sources">
          <li>
            Historical borders:{" "}
            <a href="https://github.com/aourednik/historical-basemaps" target="_blank" rel="noopener noreferrer">
              historical-basemaps
            </a>{" "}
            (P. Ourednik and contributors).
          </li>
          <li>
            Coastlines / land:{" "}
            <a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener noreferrer">
              Natural Earth
            </a>{" "}
            (public domain).
          </li>
          <li>
            Map rendering:{" "}
            <a href="https://maplibre.org/" target="_blank" rel="noopener noreferrer">
              MapLibre GL
            </a>
            . People/figures/events (curated + imported): Wikipedia / Wikidata, cited per entry.
          </li>
        </ul>
      </div>
    </div>
  );
}
