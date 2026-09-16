# Why snapshots were the wrong model

The atlas held 49 fixed years, each a complete map of the world. That model
produced the errors, and not by accident.

**A snapshot forces completeness.** To publish "the world in 1400" you must put
something on every landmass. There is no way to say "nobody has established
what held the Deccan in 1400." So a compiler facing a gap writes "minor Hindu
kingdoms", or lets the nearest large empire swell to fill it. That is exactly
how the Sultanate of Delhi came to cover Hampi, Gulbarga, Ahmedabad, Gaur and
Cuttack in a single 127-vertex polygon spanning 66°E to 90°E — in a year when
Timur had just sacked Delhi and the sultanate held little beyond the Doab. The
model created the pressure to invent.

**A snapshot is the wrong unit of knowledge.** Nobody knows "the world in
1400". What is known is "Vijayanagara was founded in 1336 and held the
peninsula south of the Krishna until Talikota in 1565". That is one fact with
an interval. Forcing it into a year-grid means re-deriving it at 1400, at 1492,
at 1500, at 1530 — four chances to get it wrong differently.

**Nearest-earlier propagates a single error across a century.** The 1400 file
is drawn for every year from 1400 to 1491.

**And nothing is incremental.** You cannot improve 1400 India without editing
"the 1400 world". There is no unit smaller than a planet.

## What replaces it

Territorial control as dated claims over a shared geography.

    Claim: vijayanagara holds <extent> from 1336 to 1565, per <source>

The map for any year is every claim valid in that year. Not 49 years — every
year. And:

- **Holes are legal.** A region no claim covers is drawn as unmapped, because
  that is the truth. No pressure to fill it.
- **One edit fixes an interval.** Correcting Vijayanagara fixes 229 years at
  once instead of four snapshots separately.
- **Provenance is per claim**, not per file.
- **Overlaps are detectable.** Two claims on the same ground in the same year
  is a contradiction the validator can find — which is impossible in a snapshot
  model, where overlap is simply how the file was drawn.

## Geography is defined once and referenced many times

The reason this is tractable at all. There are perhaps ten thousand
polity-year-territory facts in world history, and nobody can author those one
at a time. But the number of *distinct geographic primitives* is far smaller:
rivers, mountain ranges, coastlines, deserts, and a few hundred named regions
carry most of the frontiers in history.

So a region is defined once — "the Deccan plateau", "the Gangetic Doab", "south
of the Krishna" — with real coordinates and a stated basis. Claims reference
regions. A frontier shared by two polities is one line referenced twice, so
there is no gap between them and no overlap, and improving the line improves
both.

That is the whole design: **author geography once, author control as intervals,
compute the map.**
