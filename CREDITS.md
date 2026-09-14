# Credits & data sources

## Historical borders

Political boundaries by year come from **historical-basemaps** by Philippe Ourednik
and contributors: https://github.com/aourednik/historical-basemaps

- Licensed under the **GNU General Public License v3.0**.
- The files under `public/data/borders/` are derived from that dataset (simplified
  and coordinate-trimmed with mapshaper; see `scripts/build-borders.mjs`). As a
  derivative of GPLv3 data, **this project is distributed under GPLv3** (see
  `LICENSE`). If you redistribute it, keep the source available and the licence intact.

## Land & coastlines

Land polygons come from **Natural Earth** (1:50m land): https://www.naturalearthdata.com/

- Natural Earth is in the **public domain**; no attribution is required, but it is
  gratefully given here.

## Rulers, figures & events

- The curated starter set (`src/data/highlights.json`) is compiled from Wikipedia,
  with a source link on each entry.
- The bulk dataset (Phase B, `public/data/rulers.json`, `figures.json`, `events.json`)
  is imported from **Wikidata** (https://www.wikidata.org), CC0. Each record links
  back to its Wikidata item.
- **Prominence** — which sizes a marker and sets the zoom at which it appears — is a
  Wikipedia **sitelink count** for imported data (an editorial 0–100 score for the
  curated set). It is a fame proxy, not a measure of historical importance.

## Portraits

Portraits are downloaded from **Wikimedia Commons** by `scripts/import/fetch-portraits.mjs`.
The importer records each image's licence (`LicenseShortName`) and author and **skips
non-free images**; only public-domain or Creative Commons images are kept. Per-image
credit is stored on the entry (`portraitCredit`) and shown in the detail panel.

## Software

- Map rendering: **MapLibre GL JS** (BSD-3-Clause) — https://maplibre.org/
- Build: **Vite**, **React**, **TypeScript** (MIT).
- Data processing: **mapshaper** (MPL-2.0).
