# Where this project is, and what to do next

Written at commit `c4173b3`, for whoever picks this up in a new session.

Atlas of Power: an interactive historical world atlas. Live at
https://ishandogra101-ship-it.github.io/worldmap/, deployed from `main` by
`.github/workflows/pages.yml`. Develop on `claude/sweet-bardeen-t5anry` and push
to both that branch and `main`.

## The standing instruction, in the owner's words

> I want correct data and correct maps. I don't want warnings or confidence
> scores. I want the maps to be factually correct. Do anything to achieve that.

And, on scope and sourcing: fetch from anywhere, do every region, take the time
it takes. On geometry: rethink the model rather than take the easy route.

Three things follow from that and are not negotiable:

- **Never invent** a ruler, a boundary, a founding date or an event location.
- **Never project modern borders backward.** A modern country is not a proxy for
  an ancient polity.
- **A missing import must never delete a historical polity.** This one has been
  violated twice already; see below.

One vocabulary rule: *prominence* is a sitelink-count visibility proxy that
decides which people appear at which zoom. It is not a judgement of historical
importance and must never be labelled "importance".

## How the data is arranged

```
canonical/            hand-written history. Nothing writes here automatically.
  RULES.md            the governing rule: a record may only claim what was
                      actually done to it. drafted | reviewed | cited.
  MODEL.md            why snapshots were the wrong model.
  schema.ts           Polity, Person, Reign, Verification, SourceRef
  polities/*.json     170 polities, 8 regional files
  rulers/*.json       36 people with reigns[], predecessor/successor links
  regions/*.json      named physical lines -> resolvable geometry
  claims/*.json       "this polity held this extent over these years, because"
staging/              raw imports. Never promoted without a human.
public/data/borders/  49 snapshot files the app actually renders
```

The **claim layer** is the replacement for snapshots. A claim names a polity, an
extent built from real physical features, a date range, and a note saying why.
`scripts/canonical/bake.mjs` writes claims into the snapshot files.

**The rule the bake enforces:** a claim cuts only the ground it occupies. Where
no claim speaks, the boundary source stands. A source polity may leave the map
only if some claim lists its name in `replaces` **with a written reason**. The
bake exits non-zero otherwise. This exists because the previous design used an
"authority area" that erased everything the source drew inside it, which deleted
Ahmadnagar, Berar, Bidar, Golkonda, the Gond kingdoms, the Rajput states and the
Sinhalese kingdoms from 1492.

## Commands

```
npm run bake:claims        claims -> snapshot files  (fails on erasure)
npm run strip:empty        drop named features with no shape
npm run audit:capitals     THE test that finds attribution errors
npm run audit:borders      39 hand-written ground-truth checks
npm run test:history       20 anchors that must never break
npm run canonical:validate integrity, chronology, the honesty rule
npm run verify             validate + anchors + borders + tsc
```

`audit:capitals` is the one that matters. A capital is a point where one polity
held power by definition, so there is no frontier ambiguity: if canonical says
Vijayanagara existed in 1400 with its capital at Hampi and the map draws
"Sultanate of Delhi" there, the map is wrong. Every polity added with a capital
becomes another test for free.

## Where the numbers stand

```
absence test    0 — every polity the atlas knows existed is drawn in every
                year it existed, across 1077 polity-years. This fails the build.
capital test    856 checks: 741 right, 4 correctly showing an overlord,
                44 showing a different polity, 67 drawing nothing
border audit    38/39, the 1 failure carrying a correction the app shows
anchors         20/20
canonical       174 polities, 36 people — 196 drafted, 14 sourced
claims          39 — 21 drafted, 18 sourced
```

The 44 is the number to watch. It was 180 before any of this.

**The absence test is the one that must never go red.** The app used to carry a
panel naming the realms a snapshot failed to draw, explaining that the gap was
the boundary source's fault. The owner's answer was that he did not want to be
told what was missing, he wanted it on the map, and he was right: an atlas that
knows the Ahom kingdom stood in 1715 and prints a note instead of drawing it has
stopped being a map. 311 polity-years were missing. There are none now, and
`npm run verify` fails if that changes.

**The remaining errors are upstream, not ours.** This was checked against raw
historical-basemaps rather than assumed: the unsimplified source also draws the
Great Khanate over Ming China, and also leaves Lisbon and Constantinople outside
any polygon. Our simplification is not the cause of any of it.

`drafted` means the assistant wrote it from training recall and **nobody opened a
source**. Zero records are `cited`. That is the single largest weakness.

## What to do next, in order

**1. DONE — the capital test no longer cries wolf.**
109 real failures, down from 180. What moved and why is in
`docs/CAPITAL-TEST.md`. Three mechanisms now separate the kinds of not-an-error,
and the distinction between them is the point:

- an **alias** (`mapsTo`) is another name for the same polity, and the evidence
  for each new one is a Wikipedia redirect that `npm run verify:aliases` re-checks;
- a **collective** (`canonical/collectives.json`) is a group label covering
  several polities, counted as a pass and still reported, because it marks
  exactly where the claim layer has work;
- an **overlord** (`subordinateTo`) was already there and mostly just needed the
  overlord's own name filling in. Four princely states failed at 1945 only
  because "India" was missing from the British Raj's `mapsTo`.

An ethnographic label is none of these. "Eastern North American hunter-gatherers"
over Cahokia stays a failure, and should.

**2. Use the network. Here is what actually answers, checked 2026-09-16.**

- **Wikipedia** — works, both REST and the action API. It returns 429 without a
  real User-Agent, which looks like a block and is not one.
- **Wikidata entity API** (`wbgetentities`, `wbsearchentities`) — works.
- **Wikidata SPARQL** — rate-limited to **one request a minute**, and the error
  body blames an active WDQS outage rather than anything here. Bulk SPARQL
  harvesting is off the table; loop the entity API instead.
- **Overpass** — one mirror answers, `maps.mail.ru/osm/tools/overpass`. It
  returned the Krishna as 49 ways and 4,679 coordinates in 9 seconds.
  `overpass-api.de` resets the connection, kumi and private.coffee time out,
  osm.jp has an expired certificate, and `overpass.osm.ch` replies but holds only
  Switzerland. One slow mirror means cache every response to disk; do not write a
  loop that refetches.
- **Nominatim, Pleiades, World Historical Gazetteer, api.openstreetmap.org,
  raw Natural Earth** — all work.
- **npm** — works. `node_modules` was empty, so `npm run verify` was failing on
  787 phantom type errors that had nothing to do with any change. `npm install`
  first.

`RULES.md` says no automated process may mark a record `reviewed` or `cited`.
That rule was written by a session with no network at all, where any citation
would have been fabricated. It is now the thing standing between this layer and
its first real source. **Ask the owner before reinterpreting it** — the alias
pass deliberately did not, and touched no `verification` field.

**3. How the missing polities got drawn, so you can extend it.**
`bake:claims` then `fill:gaps`, in that order. Three mechanisms, none of which
invents a border:

- **Relabel.** The commonest reason a polity is missing is that the map still
  calls its ground by the name of the state before it: "Mauryan Empire" over
  Pataliputra in 100 BCE, "Liao" over Beijing in 1200, "Sui Empire" over
  Chang'an in 700. Decidable from the canonical layer — a drawn name whose
  polity had already ended means the ground is its successor's, one not yet
  founded means its predecessor's — and the tie broken by whose capital falls
  inside the polygon. 13 features, every one a real correction.
- **Carry.** For a polity the source draws in other years but not this one, take
  the *intersection* of the nearest earlier and nearest later depictions. Not
  the nearest: Byzantium is drawn at 600 across the Levant and at 800 without
  it, and carrying either one whole is wrong in a different direction. What it
  held before and after it held in between. 246 polity-years.
- **Claim.** For the 8 the source draws in no year at all, an extent has to be
  stated. See `canonical/regions/` — the Yadava realm is the land between the
  Narmada and the Tungabhadra because the article says so, the Swahili coast is
  computed one degree inland of the real coastline, Bundelkhand is the country
  between the Yamuna and the Vindhyas.

`fill:gaps` never erases a polity the source names: if carrying a shape would
take a named feature's last ground, it leaves it alone and says so. That guard
fired 183 times.

**4. Look for the single broken snapshot between two sound ones.**
Twice the worst errors on the map had this shape. At 1400 the source drew one
Great Khanate over China, Manchuria, Mongolia and Korea while 1300 and 1492 were
fine. At 1800 it drew one feature named "Bundelkhand" from Rajasthan to Assam,
covering Delhi, Lucknow, Patna and Calcutta, while 1783 and 1815 were fine.
`extent: { asDrawnIn: { year, name } }` borrows the source's own drawing from a
year it gets right. **1815 is the next one** — its "Maratha Confederacy" runs
from 66.7E to 86.9E and 14N to 37N, taking in Ranjit Singh's Punjab, Kashmir and
Sindh, none of which the Marathas held.

**5. The 67 blanks are a coastline problemand they are one problem.**
Every blank checked has the *right* polity 0.03-0.04 degrees away: Lisbon lies
just outside Portugal in all 17 snapshots it appears in, Constantinople just
outside Byzantium in 12, and the same for Kilwa, Mbanza Kongo and Timbuktu.
These are coastal capitals sitting a few kilometres out to sea because the
source's coastline is coarse, and the raw upstream file has the same defect. It
is also a visible defect in the app: a strip of land with no polity colour
follows every shore. Natural Earth land is already on disk at
`public/data/land.geojson` and the region resolver already intersects with it.
One operation would close most of the 79.

**6. Extend claims beyond South Asia.** The same blob problem exists everywhere
the source draws one name over ground several polities held. `audit:capitals`
per region says where to look, and the group-label report now names the exact
labels that need breaking up. West Asia is worst.

**7. Do not re-add an authority area.** Whatever shape the argument takes, the
answer is no. Read the header of `scripts/canonical/bake.mjs` first.

## Traps that cost time here

- `["zoom"]` is legal in MapLibre only as the direct input to a top-level
  `interpolate`/`step`. Never nested inside `case`.
- MapLibre defaults `line-join` to `miter`. Round has to be set explicitly.
- Vite content-hashes JS and CSS but not `public/`. Data files need the
  `?v=` cache-buster in `src/util.ts`.
- `polygon-clipping` returns an empty result on some of the source's malformed
  rings. Check bounding boxes before handing it anything, or it silently
  deletes features.
- `pkill -f` matches and kills the agent's own shell. Twice.
- `bake:claims` writes the files it reads. Once a source feature is superseded
  it is gone from the snapshot, so a guard cannot catch the loss on a second
  run — and the second run looks clean. Restore with
  `git checkout HEAD -- public/data/borders` before testing anything about the
  bake, or you will be measuring your own output.
- A claim supersedes the source's whole feature of that polity's name. When the
  source has hung that name on ground the polity never held, a correct claim
  replaces a continent with a county. The ground guard in `bake.mjs` catches it
  now; it did not before, because the name survived and only the land vanished.
- An unwindowed name in `mapsTo` supersedes in every year the claim is held.
  "Assam" means the Ahom kingdom at 1815 and the Bhutan duars at 1783, and the
  unscoped alias deleted Bhutan from three snapshots.
- The snapshot files carry `__untrimmed` and `__fillUntrimmed`, which hold the
  geometry each script cut so the cut can be undone on the next run. Without
  them the pipeline is not idempotent: run two borrows from run one's output.
  They cost about 9% of the file size. `__renamed`/`__sourceName` do the same
  for a relabel, and restoring a relabel must put SUBJECTO and PARTOF back too —
  "Great Khanate" is SUBJECTO "Mongol Empire", and restoring only NAME rewrote
  the other two.
- `asDrawnIn` must read the source as it shipped, not as the pipeline left it,
  or a borrowed extent depends on how many times you have run the bake.
- `npm run build:atlas` regenerates `public/data/polities.json`, which is what
  the app reads for "the atlas knows this was here". Adding a polity without
  rerunning it leaves the app unaware of it.
- The boundary source ships features with a name and a null geometry, and others
  that are three collinear points. Neither is a polity.
