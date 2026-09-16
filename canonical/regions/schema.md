# Regions

A region is a piece of the earth's surface with a name and a definition. It is
not a polity and carries no date: the Deccan plateau is the Deccan plateau in
every century.

Kinds of definition:

- `bbox`      — a rectangle. Coarse, honest, useful for interiors.
- `polygon`   — explicit coordinates.
- `landOf`    — the land inside a shape, clipped to the coastline, so a frontier
                drawn across a subcontinent does not spill into the sea.
- `between`   — the land between two boundary lines (rivers, ranges, parallels).
- `southOf` / `northOf` / `eastOf` / `westOf` — land on one side of a line.
- `union`     — several regions together.
- `minus`     — one region with another removed.

A boundary line is itself named and defined once: `krishna-river`, `narmada`,
`hindu-kush`. When two polities meet at the Krishna, both reference the same
line, so the frontier is shared by construction.

Every region records `basis`: why its coordinates are what they are. A river
traced from a handful of points along its course says so and gives the points.
That is coarse and it is honest — and it is what a historical atlas does when
it writes "the Krishna formed the frontier".
