/**
 * People no atlas of power can omit.
 *
 * This does two jobs. It is checked after every import and reported out loud,
 * because a rising count looks like success and Genghis Khan went missing
 * through four runs behind one. And the ruler names seed position discovery
 * directly: whatever office Wikidata says these people held is added to the set
 * the import looks for, which is how a title like Khagan or Mansa gets in
 * without anyone having to know it exists.
 *
 * It is a floor on coverage, not a definition of importance. Nothing here is
 * ranked, and the atlas holds tens of thousands of people who are not on it.
 */
export const WATCHLIST = {
  rulers: [
    "Genghis Khan", "Kublai Khan", "Timur", "Attila",
    "Mansa Musa", "Sundiata Keita", "Shaka", "Menelik II", "Idris Alooma",
    "Ashoka", "Chandragupta Maurya", "Akbar", "Krishnadevaraya",
    "Qin Shi Huang", "Kangxi Emperor", "Wu Zetian",
    "Suleiman the Magnificent", "Mehmed II", "Cyrus the Great", "Darius I",
    "Charlemagne", "Justinian I", "Hammurabi", "Ramesses II", "Hatshepsut",
    "Moctezuma II", "Pachacuti", "Tokugawa Ieyasu", "Sejong",
  ],
  figures: [
    "Leonardo da Vinci", "Ibn Sina", "Confucius", "Al-Khwarizmi",
    "Ibn Battuta", "Zheng He", "Rumi", "Aryabhata", "Ibn Khaldun",
  ],
  events: ["Battle of Hastings", "Fall of Constantinople", "Battle of Talas"],
};

/**
 * Other spellings that count as the same person.
 *
 * Run 11 reported Sundiata Keita, Pachacuti and Ibn Sina missing. All three
 * were in the atlas — as "Sunjata Keïta", "Pachacútec" and "Avicenna", which
 * are the English labels Wikidata actually carries. A check that reports three
 * false alarms out of five is worse than no check: it sends the next hour after
 * people who are already there and buries the two who are not.
 *
 * Only spellings of the same individual belong here. This is a lookup for the
 * report, never for merging records, and nothing is ever collapsed on the
 * strength of it.
 */
export const ALSO_KNOWN_AS = {
  "Sundiata Keita": ["Sunjata Keïta", "Sundjata", "Mari Djata"],
  "Pachacuti": ["Pachacútec", "Pachacutec", "Pachakutiq"],
  "Ibn Sina": ["Avicenna"],
  "Al-Khwarizmi": ["Muhammad ibn Musa al-Khwarizmi", "al-Khwarizmi"],
  "Shaka": ["Shaka Zulu", "Shaka kaSenzangakhona"],
  "Qin Shi Huang": ["Qin Shi Huangdi", "Ying Zheng"],
  "Sejong": ["Sejong the Great", "Sejong of Joseon"],
  "Mansa Musa": ["Musa I of Mali", "Kankan Musa"],
  "Suleiman the Magnificent": ["Suleiman I", "Süleyman I"],
  "Cyrus the Great": ["Cyrus II of Persia"],
  "Zheng He": ["Cheng Ho", "Ma He"],
  "Rumi": ["Jalal ad-Din Muhammad Rumi", "Mevlana"],
  "Confucius": ["Kong Qiu", "Kongzi"],
  "Charlemagne": ["Charles the Great", "Karl der Große"],
  "Attila": ["Attila the Hun"],
};

/** Every spelling worth accepting for a watchlist name. */
export function spellingsOf(name) {
  return [name, ...(ALSO_KNOWN_AS[name] ?? [])];
}
