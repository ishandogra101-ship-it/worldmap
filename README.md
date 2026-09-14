# Atlas of Power

An interactive historical world map. Drag the timeline from **3000 BCE to 2026** and
the map redraws the political world of that year — colour-coded realms, the notable
rulers and figures alive then, and the events that mattered. Zoom in and smaller
polities and lesser-known figures appear. The map's palette ages with the era, from a
sepia antique atlas to a clean modern map.

![screenshot](docs/screenshot.png)

## What it does

- **Real historical borders** for ~50 snapshot years, coloured by sovereign realm
  (an empire and its vassals share a colour). Land no mapped state held stays blank —
  so, for example, no "United States" exists on the map before 1783.
- A **timeline** across the bottom: drag, play through time, step, or type a year.
  Borders snap to the nearest mapped snapshot; the legend shows which year is drawn.
- **Rulers and figures** as markers whose size and zoom-visibility track a *prominence*
  score, so marquee names (Akbar, Napoleon) show at a glance and lesser ones appear as
  you zoom. **Events** appear as dated markers.
- Click anything — a realm, a ruler, a figure, an event — for details and a source.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
npm run preview    # serve the build
```

The border layer (`public/data/`) is already built and committed. To regenerate it
from source (needs network access to GitHub):

```bash
npm run build:borders
```

## The people/events data — two phases

The app ships with a **curated starter set** of rulers, figures and events
(`src/data/highlights.json`) so it is populated out of the box.

For **comprehensive** coverage (thousands of rulers and figures with reign dates,
locations and portraits), run the **Wikidata import**:

```bash
npm run import:wikidata
```

This writes `public/data/rulers.json`, `figures.json`, `events.json` and downloads
portraits to `public/portraits/`. The app merges these over the curated set by id.

> **Network note.** The import needs access to `query.wikidata.org`, `www.wikidata.org`
> and `commons.wikimedia.org` / `upload.wikimedia.org`. Some managed/CI environments
> block these by policy — if so, run the import somewhere they are reachable (e.g. a
> local machine) and commit the generated files. The map and borders need none of this.

## Deploy to GitHub Pages

A workflow at `.github/workflows/pages.yml` builds with the correct base path and
publishes to Pages. Enable Pages for the repo (Settings → Pages → Source: GitHub
Actions). The build uses `BASE_PATH=/worldmap/`; data files are fetched via
`import.meta.env.BASE_URL`, so both local and Pages resolve correctly.

## Honest limits

- Borders are **snapshots**, not continuous — the map snaps to the nearest mapped year
  rather than morphing between them. Faking the in-between years would be inventing
  history.
- Coverage equals the source data's. Wikidata is large but incomplete and sometimes
  disputes dates; "every ruler" means every one it records with a usable date and place.
- Prominence is a **sitelink/fame proxy**, not a verdict on importance.

## Licence & credits

Distributed under **GPLv3** (`LICENSE`), because the border data it redistributes is
GPLv3. Full attribution for borders (historical-basemaps), land (Natural Earth),
people/events (Wikidata), portraits (Wikimedia Commons) and software is in
[`CREDITS.md`](CREDITS.md).
