// The map's palette shifts as you move through time. Ancient years read as an
// aged, sepia atlas; the ink cools and the paper cleans up as you approach the
// present. `paper` is the opacity of a parchment texture laid over the whole map.
export interface EraTheme {
  id: string;
  name: string;
  startYear: number; // the era begins at this year; the last one <= year wins
  ocean: string;
  land: string; // fill for land with no attested polity
  landStroke: string;
  border: string; // outline between polities
  labelText: string;
  labelHalo: string;
  paper: number; // 0..1 parchment overlay opacity
}

const ERAS: EraTheme[] = [
  {
    id: "antiquity",
    name: "Antiquity",
    startYear: -3000,
    ocean: "#aebfae",
    land: "#e7dcc0",
    landStroke: "#c8b795",
    border: "#7c6c4d",
    labelText: "#4a3d28",
    labelHalo: "#efe7d2",
    paper: 0.5,
  },
  {
    id: "classical",
    name: "Classical Age",
    startYear: -800,
    ocean: "#a6bcb7",
    land: "#e6dbbf",
    landStroke: "#c6b691",
    border: "#75664a",
    labelText: "#463c29",
    labelHalo: "#efe6d0",
    paper: 0.42,
  },
  {
    id: "lateantiquity",
    name: "Late Antiquity",
    startYear: 300,
    ocean: "#9fb6bc",
    land: "#e3d8bd",
    landStroke: "#c2b28e",
    border: "#6d6049",
    labelText: "#443a28",
    labelHalo: "#eee4cd",
    paper: 0.35,
  },
  {
    id: "medieval",
    name: "Middle Ages",
    startYear: 700,
    ocean: "#9bb1c0",
    land: "#e0d6bc",
    landStroke: "#bfae8b",
    border: "#665b47",
    labelText: "#42392a",
    labelHalo: "#ece2ca",
    paper: 0.28,
  },
  {
    id: "earlymodern",
    name: "Early Modern",
    startYear: 1400,
    ocean: "#9bb4c6",
    land: "#ddd3bc",
    landStroke: "#bcaa88",
    border: "#5f5646",
    labelText: "#3f382b",
    labelHalo: "#eae1c9",
    paper: 0.2,
  },
  {
    id: "enlightenment",
    name: "Age of Revolutions",
    startYear: 1700,
    ocean: "#9ebbcb",
    land: "#dcd4c2",
    landStroke: "#b9a988",
    border: "#5a5346",
    labelText: "#3c362b",
    labelHalo: "#e9e2ce",
    paper: 0.14,
  },
  {
    id: "industrial",
    name: "Industrial Age",
    startYear: 1815,
    ocean: "#a1bed0",
    land: "#dbd5c8",
    landStroke: "#b4a68b",
    border: "#54504a",
    labelText: "#39352d",
    labelHalo: "#e9e3d5",
    paper: 0.08,
  },
  {
    id: "modern",
    name: "The Modern World",
    startYear: 1914,
    ocean: "#a8c6d8",
    land: "#e2ddd0",
    landStroke: "#c2b79f",
    border: "#4e4b46",
    labelText: "#33312c",
    labelHalo: "#efeadf",
    paper: 0.035,
  },
  {
    id: "contemporary",
    name: "Contemporary",
    startYear: 1991,
    ocean: "#b0cfe0",
    land: "#e9e3d7",
    landStroke: "#ccc0a8",
    border: "#4a4844",
    labelText: "#302f2b",
    labelHalo: "#f4efe6",
    paper: 0,
  },
];

export function eraForYear(year: number): EraTheme {
  let chosen = ERAS[0];
  for (const era of ERAS) {
    if (year >= era.startYear) chosen = era;
    else break;
  }
  return chosen;
}

export function allEras(): EraTheme[] {
  return ERAS;
}
