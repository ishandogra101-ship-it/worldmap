# Authoring format

A region file is a list of polities plus defaults that every entry inherits.
Written compactly so it can be read and corrected by a person, then expanded to
the full schema by `scripts/canonical/load.mjs`.

```jsonc
{
  "region": "East Asia",
  // named works a reader should check these records against. No URLs: the
  // session that seeded this file could not open any of them (see RULES.md).
  "sources": [{ "title": "...", "author": "...", "edition": "..." }],
  "verification": { "method": "drafted", "by": "claude", "date": "2026-09-15" },
  "polities": [
    {
      "id": "ming",
      "canonicalName": "Ming dynasty",
      "type": "empire",
      "founded": 1368,          // or { "year": 1368, "note": "..." }
      "ended": 1644,
      "capitals": [{ "name": "Nanjing", "lng": 118.8, "lat": 32.06, "to": 1421 }],
      "mapsTo": ["Ming Empire", "Ming Chinese Empire"],  // names in the border data
      "successors": ["qing"]
    }
  ]
}
```

`mapsTo` is how a canonical polity is reconciled against the imported border
layer. It is a list of the names that layer uses, not a claim about history.
