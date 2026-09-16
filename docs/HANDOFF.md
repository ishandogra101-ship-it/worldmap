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
capital test    833 checks: 564 right, 55 correctly showing an overlord,
                22 under a group label, 109 showing a different polity,
                83 drawing nothing
                West Asia 66%  Americas 73%  South Asia 73%  Europe 77%
                Africa 78%  East Asia 87%  SE Asia 88%  N Eurasia 100%
                Central Asia 100%
border audit    32/39, all 7 failures carrying a correction the app shows
anchors         20/20
canonical       172 polities, 36 people, 208 records — ALL still `drafted`
claims          20, South Asia only
```

The 109 is the number to watch. It was 180 before the alias pass, and the 71 that
moved were correct maps the test had been scoring as errors. No geometry changed.

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
