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
capital test    831 checks: 526 right, 42 correctly showing an overlord,
                180 showing a different polity, 83 drawing nothing
                South Asia 61%  West Asia 48%  Americas 61%  Europe 68%
                Africa 76%  East Asia 81%  SE Asia 86%  Central Asia 100%
border audit    32/39, all 7 failures carrying a correction the app shows
anchors         20/20
canonical       170 polities, 36 people, 206 records — ALL still `drafted`
claims          20, South Asia only
```

`drafted` means the assistant wrote it from training recall and **nobody opened a
source**. Zero records are `cited`. That is the single largest weakness.

## What to do next, in order

**1. The capital test is crying wolf, and that hides the real errors.**
A large share of the 180 failures are name-matching gaps rather than map errors:
Cairo drawn as "Mamluke Sultanate", Tikal as "Maya states", Berlin as "German
Empire" in 1900. All correct maps, all counted as failures. Fixing the alias
matching costs nothing in geometry and makes every later measurement honest.

**2. Use the network access that was just granted.**
The environment's policy was `Trusted` until 2026-09-16 and blocked everything
below. Verify what is reachable before planning around it:

- **Wikipedia + Wikidata** — promote `drafted` records to `cited` with real
  locators, and finish the bulk ruler import that stalled.
- **Overpass / OpenStreetMap** — replace the hand-traced rivers in
  `canonical/regions/*.json`. Every line there is roughly ten points typed from
  memory. The cost of that is measured: the traced Krishna ran half a degree
  north of the real river and put Bijapur city on the wrong side of its own
  frontier.
- **Pleiades, World Historical Gazetteer** — pre-1000 CE places, the thinnest
  part of the atlas.

**3. Extend claims beyond South Asia.** All 20 claims are Indian. The same blob
problem exists everywhere the source draws one name over ground several polities
held. `audit:capitals` per region says where to look: West Asia is worst.

**4. Do not re-add an authority area.** Whatever shape the argument takes, the
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
- The boundary source ships features with a name and a null geometry, and others
  that are three collinear points. Neither is a polity.
