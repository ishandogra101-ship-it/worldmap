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
