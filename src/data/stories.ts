/**
 * Guided paths through the atlas.
 *
 * Every caption states something the map itself shows at that stop, or a fact
 * carried by a sourced record the stop opens. Nothing here asserts a date, a
 * border or a ruler the data does not already contain — each line below was
 * checked by point-testing the snapshot it refers to.
 *
 * Where a year has no snapshot of its own, the caption says what the nearest
 * mapped year shows rather than pretending the map moved.
 */
export interface StoryStop {
  year: number;
  lng: number;
  lat: number;
  zoom: number;
  /** what the panel opens on arrival */
  focus?: { kind: "realm"; group: string } | { kind: "entity"; id: string };
  caption: string;
}

export interface Story {
  id: string;
  title: string;
  blurb: string;
  stops: StoryStop[];
}

export const STORIES: Story[] = [
  {
    id: "rome",
    title: "One hill, seven hundred years",
    blurb: "Central Italy, from the Republic to the Ostrogoths",
    stops: [
      {
        year: -100, lng: 12.5, lat: 42.5, zoom: 4.6,
        focus: { kind: "realm", group: "Roman Republic" },
        caption: "Stay on one patch of ground in central Italy and let the years move. In 100 BCE it is the Roman Republic.",
      },
      {
        year: -1, lng: 12.5, lat: 42.5, zoom: 3.6,
        focus: { kind: "entity", id: "hl-augustus" },
        caption: "By the turn of the era the same ground is mapped as the Roman Empire.",
      },
      {
        year: 200, lng: 16, lat: 40, zoom: 3.0,
        focus: { kind: "realm", group: "Roman Empire" },
        caption: "200 is the widest extent the atlas maps for it, and the last snapshot in which it is drawn at all.",
      },
      {
        year: 300, lng: 14, lat: 41, zoom: 3.4,
        caption: "A century later Italy is labelled for one of four rulers. The empire is still there; it is no longer one thing.",
      },
      {
        year: 400, lng: 12.5, lat: 42.5, zoom: 3.4,
        caption: "By 400 the halves are drawn separately. This ground is the Western Roman Empire.",
      },
      {
        year: 500, lng: 12.5, lat: 42.5, zoom: 3.4,
        focus: { kind: "entity", id: "hl-e-westrome" },
        caption: "In the 500 snapshot the same hill is Ostrogothic.",
      },
      {
        year: 500, lng: 32, lat: 39, zoom: 3.4,
        focus: { kind: "realm", group: "Eastern Roman Empire" },
        caption: "Look east in the same year. The Eastern Roman Empire is still drawn — and the atlas keeps drawing a Roman realm here, latterly as Byzantium, until 1400.",
      },
    ],
  },
  {
    id: "mongols",
    title: "The Mongol century",
    blurb: "1200 to 1492, from the steppe and back",
    stops: [
      {
        year: 1200, lng: 100, lat: 46, zoom: 3.2,
        focus: { kind: "realm", group: "Mongol Empire" },
        caption: "1200. A Mongol realm is already on the map, on the steppe north of the Gobi.",
      },
      {
        year: 1200, lng: 113, lat: 35, zoom: 3.2,
        focus: { kind: "realm", group: "Song Empire" },
        caption: "North China, the same year, belongs to the Song.",
      },
      {
        year: 1279, lng: 90, lat: 42, zoom: 1.9,
        focus: { kind: "realm", group: "Mongol Empire" },
        caption: "1279 is its widest mapped extent. One sovereign now runs from north China through Persia to the steppe north of the Black Sea.",
      },
      {
        year: 1279, lng: 52, lat: 34, zoom: 4.0,
        caption: "Persia is drawn as the Ilkhanate — its own name, answering to the Mongol Empire. The atlas keeps both.",
      },
      {
        year: 1400, lng: 70, lat: 45, zoom: 2.4,
        focus: { kind: "realm", group: "Mongol Empire" },
        caption: "In 1400 it is still mapped as one realm, in pieces: the Great Khanate in the east, the White Horde on the Volga.",
      },
      {
        year: 1492, lng: 70, lat: 45, zoom: 2.4,
        caption: "The 1492 snapshot has no Mongol Empire in it. The pieces are sovereign now — the Chagatai Khanate, the Golden Horde.",
      },
    ],
  },
  {
    id: "ottomans",
    title: "The Ottomans, 1400 to 1914",
    blurb: "A corner of Anatolia, and what became of it",
    stops: [
      {
        year: 1400, lng: 28, lat: 39.5, zoom: 4.6,
        focus: { kind: "realm", group: "Ottoman Empire" },
        caption: "1400. The Ottomans already hold both sides of the straits — Anatolia, Thrace, Macedonia.",
      },
      {
        year: 1400, lng: 22.5, lat: 37.5, zoom: 5.2,
        focus: { kind: "realm", group: "Byzantine Empire" },
        caption: "What the atlas still maps as Byzantium is the Peloponnese and not much else.",
      },
      {
        year: 1453, lng: 28.98, lat: 41.01, zoom: 5.2,
        focus: { kind: "entity", id: "hl-e-constantinople" },
        caption: "1453 falls between mapped years, so the borders you see are 1492's. The event is dated exactly.",
      },
      {
        year: 1530, lng: 30, lat: 34, zoom: 2.9,
        focus: { kind: "entity", id: "hl-suleiman" },
        caption: "By 1530 one realm covers the Balkans, Anatolia and the Nile. It stays near this size for over a century.",
      },
      {
        year: 1650, lng: 33, lat: 34, zoom: 2.9,
        focus: { kind: "realm", group: "Ottoman Empire" },
        caption: "It holds near this size through 1600 and 1650 — the widest the atlas maps for it.",
      },
      {
        year: 1914, lng: 36, lat: 35, zoom: 3.2,
        focus: { kind: "realm", group: "Ottoman Empire" },
        caption: "1914. About a third of the 1650 extent, and the last year the atlas maps it at all.",
      },
    ],
  },
  {
    id: "crowded",
    title: "The crowded continent",
    blurb: "The Americas in 1492, and one patch of ground after",
    stops: [
      {
        year: 1492, lng: -74.5, lat: 24, zoom: 3.4,
        focus: { kind: "entity", id: "hl-e-columbus" },
        caption: "1492. Start where the crossing ends.",
      },
      {
        year: 1492, lng: -70.5, lat: 19, zoom: 5.4,
        caption: "Hispaniola is already on the map. The atlas draws the Taino here, and their neighbours around them.",
      },
      {
        year: 1492, lng: -84, lat: 39, zoom: 3.9,
        caption: "Look north. The 1492 snapshot carries about 1,200 distinct names across the Americas — over 500 of them inside what is now the contiguous United States.",
      },
      {
        year: 1492, lng: -88, lat: 38, zoom: 5.0,
        caption: "At this point seven of them overlap: Kiikaapoi, Kaskaskia, Osage, Shawnee, Myaamia, O-ga-xpa, Očhéthi Šakówiŋ. The source records claims, and claims overlap. The atlas draws all seven rather than picking one.",
      },
      {
        year: 1492, lng: -77, lat: 39, zoom: 5.6,
        caption: "Further east, one name holds this ground on its own: the Piscataway.",
      },
      {
        year: 1600, lng: -77, lat: 39, zoom: 5.6,
        caption: "A century on, the same ground is drawn as the Conoy.",
      },
      {
        year: 1783, lng: -77, lat: 39, zoom: 5.0,
        caption: "And in 1783 it is the United States of America. Three names, one patch of ground, three hundred years.",
      },
    ],
  },
];

export function storyById(id: string): Story | undefined {
  return STORIES.find((s) => s.id === id);
}
