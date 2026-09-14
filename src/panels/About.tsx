import { store, useAtlas } from "../app/store";
import { Icon } from "../design/icons";

export default function About() {
  const open = useAtlas((s) => s.aboutOpen);
  if (!open) return null;
  const close = () => store.set({ aboutOpen: false });

  return (
    <div className="modal-scrim" onPointerDown={close}>
      <div
        className="modal"
        role="dialog"
        aria-label="About this atlas"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button className="modal__close" onClick={close} aria-label="Close">
          <Icon name="close" size={16} />
        </button>

        <div className="eyebrow">About this atlas</div>
        <h2 className="modal__title">How to read it, and what it does not know</h2>

        <p className="modal__lead">
          Atlas of Power draws the political world of a chosen year and places the people and
          events recorded for that moment on top of it. It is built to be honest about the
          gaps in the historical record rather than to paper over them.
        </p>

        <Section title="Borders come from snapshots">
          <p>
            The map holds boundaries for a set of mapped years, not for every year. Choose 1526
            and the atlas draws the nearest mapped snapshot and says so in the timeline. It does
            not interpolate the years in between: morphing one border into another would invent a
            geography nobody recorded. The ticks under the timeline mark the years that are
            genuinely mapped.
          </p>
        </Section>

        <Section title="Colour identifies, weight ranks">
          <p>
            Each realm keeps one colour across every year, assigned from its name so it never
            shifts between snapshots. An empire and the territories subject to it share that
            colour. How strongly a realm is filled, and when its name appears, follow its mapped
            area — so scale is read through weight and not through louder colour.
          </p>
        </Section>

        <Section title="Prominence is a visibility proxy">
          <p>
            Which people appear at which zoom is decided by a prominence score. For imported
            records that is a count of Wikipedia language links; for the curated set it is an
            editorial estimate. It is a measure of how well documented a person is in one
            reference work — <em>not</em> a verdict on historical importance, and it carries the
            biases of its source. It exists to keep a world view legible, nothing more.
          </p>
        </Section>

        <Section title="Blank is not empty">
          <p>
            Land with no fill had no polity in this dataset for that year. Sometimes that reflects
            history; often it reflects the limits of the source. The same applies to people and
            events: the atlas shows what has been recorded, which is a much smaller thing than
            what happened.
          </p>
        </Section>

        <Section title="Sources">
          <ul className="modal__sources">
            <li>
              Historical borders —{" "}
              <a href="https://github.com/aourednik/historical-basemaps" target="_blank" rel="noopener noreferrer">
                historical-basemaps
              </a>{" "}
              (GPLv3), simplified for the web.
            </li>
            <li>
              Coastlines —{" "}
              <a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener noreferrer">
                Natural Earth
              </a>{" "}
              (public domain).
            </li>
            <li>
              People and events — a curated starter set, expandable by a{" "}
              <a href="https://www.wikidata.org" target="_blank" rel="noopener noreferrer">Wikidata</a>{" "}
              import; each record links to its source.
            </li>
            <li>
              Rendering —{" "}
              <a href="https://maplibre.org/" target="_blank" rel="noopener noreferrer">MapLibre GL</a>.
            </li>
          </ul>
        </Section>

        <Section title="Keyboard">
          <ul className="modal__keys">
            <li><kbd>&larr;</kbd><kbd>&rarr;</kbd> step through time</li>
            <li><kbd>Shift</kbd> + <kbd>&larr;</kbd><kbd>&rarr;</kbd> larger step</li>
            <li><kbd>Space</kbd> play or pause</li>
            <li><kbd>/</kbd> or <kbd>&#8984;K</kbd> search</li>
            <li><kbd>Esc</kbd> close</li>
          </ul>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="modal__section">
      <h3 className="modal__h3">{title}</h3>
      {children}
    </section>
  );
}
