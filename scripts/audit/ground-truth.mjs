/**
 * Checkable claims about who held a place in a given year.
 *
 * The border layer is a compiled secondary source and it has real errors in it.
 * Finding them one complaint at a time does not scale: there are 2,978 distinct
 * polity names across 49 snapshots, and no amount of reading the code tells you
 * whether the Marathas are drawn over Kashmir. Only checking does.
 *
 * So this is a test set. Each row says what held a place in a year, at a level
 * of confidence that does not depend on which textbook you read: capitals and
 * core territories at dates where the ruling power is not seriously disputed.
 * The audit reports what the map draws against it, and the pass rate is a
 * number that can go up.
 *
 * Deliberately NOT here: frontier zones, tributary and vassal arrangements
 * where "who ruled" is a genuine scholarly argument, and any year within a
 * decade of a conquest. A test set that encodes contested history would
 * manufacture failures and teach nobody anything.
 *
 * `expect` lists the names that count as correct. Several are needed because
 * the dataset names the same power differently across snapshots — "Qing
 * Empire" and "Manchu Empire" are the same thing — and a naming difference is
 * not a factual error. `reject` names powers that are definitely wrong for that
 * place and year, which is what catches a polygon swallowing its neighbours.
 */
export const GROUND_TRUTH = [
  // --- the case that started this: the northern subcontinent ---
  { place: "Srinagar", lng: 74.80, lat: 34.08, year: 1815,
    expect: ["Afghanistan", "Durrani", "Kashmir"], reject: ["Maratha Confederacy", "Mahratta states"],
    note: "Durrani Afghan governors held Kashmir until Ranjit Singh took it in 1819." },
  { place: "Leh", lng: 77.58, lat: 34.16, year: 1815,
    expect: ["Ladakh", "Tibet"], reject: ["Maratha Confederacy", "Afghanistan"],
    note: "Ladakh was the Namgyal kingdom until the Dogra conquest of 1834." },
  { place: "Lahore", lng: 74.33, lat: 31.55, year: 1815,
    expect: ["Sikhs", "Sikh Empire", "Lahore", "Punjab"], reject: ["Maratha Confederacy"],
    note: "Ranjit Singh's capital from 1799." },
  { place: "Srinagar", lng: 74.80, lat: 34.08, year: 1800,
    expect: ["Afghanistan", "Durrani", "Kashmir"], reject: ["Sikhs", "Sikh Empire"],
    note: "Kashmir was still Durrani in 1800; the Sikh conquest is 1819." },
  { place: "Delhi", lng: 77.21, lat: 28.61, year: 1800,
    expect: ["Maratha Confederacy", "Mahratta states", "Mughal Empire", "Maratha"],
    reject: ["Bundelkhand"],
    note: "Scindia held Delhi with the Mughal emperor as figurehead until 1803." },

  // --- South and East Asia, dates where the ruling power is not in dispute ---
  { place: "Delhi", lng: 77.21, lat: 28.61, year: 1650, expect: ["Mughal Empire", "Mughal"],
    note: "Shah Jahan's capital." },
  { place: "Agra", lng: 78.01, lat: 27.18, year: 1600, expect: ["Mughal Empire", "Mughal"],
    note: "Akbar's capital region." },
  { place: "Pune", lng: 73.86, lat: 18.52, year: 1715, expect: ["Maratha", "Maratha Confederacy", "Mughal Empire"],
    note: "Maratha heartland under Shahu; Mughal claim contested, so both pass." },
  { place: "Beijing", lng: 116.40, lat: 39.90, year: 1700, expect: ["Qing", "Manchu Empire", "Qing Empire", "China"],
    note: "Kangxi's capital." },
  { place: "Beijing", lng: 116.40, lat: 39.90, year: 1400, expect: ["Ming", "Ming Empire", "Ming Dynasty", "China"],
    reject: ["Great Khanate", "Yuan", "Mongol Empire"],
    note: "Ming, after the fall of the Yuan in 1368." },
  { place: "Nanjing", lng: 118.80, lat: 32.06, year: 1400, expect: ["Ming", "Ming Empire", "Ming Dynasty", "China"],
    reject: ["Great Khanate", "Yuan", "Mongol Empire"],
    note: "The Hongwu emperor's capital." },
  { place: "Beijing", lng: 116.40, lat: 39.90, year: 1300,
    expect: ["Great Khanate", "Yuan", "Mongol", "China"],
    note: "Yuan, correctly — the snapshot either side of the broken one." },
  { place: "Kyoto", lng: 135.77, lat: 35.01, year: 1700, expect: ["Japan", "Tokugawa"],
    note: "Tokugawa Japan." },

  // --- the Mediterranean and the Near East ---
  { place: "Rome", lng: 12.50, lat: 41.90, year: 100, expect: ["Roman Empire", "Rome"],
    note: "Trajan's Rome." },
  { place: "Alexandria", lng: 29.92, lat: 31.20, year: 100, expect: ["Roman Empire", "Rome"],
    note: "Roman Egypt, annexed 30 BCE." },
  { place: "Constantinople", lng: 28.98, lat: 41.01, year: 600,
    expect: ["Byzantine Empire", "Eastern Roman Empire", "Roman Empire", "Byzantium"],
    note: "Under Maurice/Phocas." },
  { place: "Constantinople", lng: 28.98, lat: 41.01, year: 1600,
    expect: ["Ottoman Empire", "Ottoman"], reject: ["Byzantine Empire"],
    note: "Ottoman since 1453." },
  { place: "Baghdad", lng: 44.36, lat: 33.31, year: 800, expect: ["Abbasid", "Abbasid Caliphate", "Caliphate"],
    note: "Harun al-Rashid's capital." },
  { place: "Cairo", lng: 31.24, lat: 30.04, year: 1400, expect: ["Mamluk", "Mamluk Sultanate", "Egypt"],
    note: "Mamluk Egypt." },

  // --- Europe ---
  { place: "Paris", lng: 2.35, lat: 48.86, year: 1700, expect: ["France", "Kingdom of France"],
    note: "Louis XIV." },
  { place: "Madrid", lng: -3.70, lat: 40.42, year: 1600, expect: ["Spain", "Castile", "Habsburg Spain"],
    note: "Philip III." },
  { place: "Moscow", lng: 37.62, lat: 55.75, year: 1600,
    expect: ["Russia", "Tsardom of Russia", "Muscovy", "Russian Empire"],
    note: "Tsardom of Russia." },
  { place: "Vienna", lng: 16.37, lat: 48.21, year: 1815,
    expect: ["Austrian Empire", "Austria", "Habsburg"],
    note: "The Congress met there." },

  // --- Africa and the Americas ---
  { place: "Timbuktu", lng: -3.01, lat: 16.77, year: 1400, expect: ["Mali", "Mali Empire"],
    note: "Mali, before Songhai takes it in the 1460s." },
  { place: "Gao", lng: -0.04, lat: 16.27, year: 1500, expect: ["Songhai", "Songhai Empire"],
    note: "Askia Muhammad's Songhai." },
  { place: "Tenochtitlan", lng: -99.13, lat: 19.43, year: 1500,
    expect: ["Aztec", "Aztec Empire", "Mexica", "Triple Alliance"], reject: ["Spain", "Viceroyalty of New Spain"],
    note: "Twenty-one years before Cortes." },
  { place: "Cusco", lng: -71.98, lat: -13.53, year: 1500,
    expect: ["Inca", "Inca Empire", "Tawantinsuyu"], reject: ["Spain", "Viceroyalty of Peru"],
    note: "Huayna Capac's Inca." },
  { place: "Mexico City", lng: -99.13, lat: 19.43, year: 1700,
    expect: ["Viceroyalty of New Spain", "Spain", "New Spain"], reject: ["Aztec", "Aztec Empire"],
    note: "Spanish since 1521." },
];
