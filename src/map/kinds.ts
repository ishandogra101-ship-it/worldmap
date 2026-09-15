/**
 * Which map labels name a state, and which name a people or a culture.
 *
 * The borders dataset carries three fields — NAME, SUBJECTO, PARTOF — and no
 * type. So on a 1450 map, "Kalmar Union" and "Siberians" arrive identical, and
 * the atlas rendered them identically: the same uppercase, the same tracking,
 * the same authority. A reader takes that at face value and concludes there was
 * a Siberian state in 1450. There was not. The Kalmar Union was a union of
 * crowns; "Siberians" is the dataset's shorthand for the peoples living across
 * a subcontinent under no single government at all.
 *
 * Nothing in the source says which is which, so this cannot be inferred without
 * inventing, and inventing is exactly what is not allowed here. What can be
 * done is narrower and holds up: a large number of these names describe
 * themselves. When the dataset writes "Savanna hunter-gatherers", "Germanic
 * tribes", "Yamnaya culture" or "West African cereal farmers", the category is
 * in the name, put there by the people who compiled it. Marking those is
 * reading the source, not second-guessing it.
 *
 * 83 of 2,978 distinct names across every snapshot are marked this way. The
 * rest — "Siberians", "Thule", and every ethnonym carrying no descriptor — stay
 * unmarked, which understates the true number. The legend says so rather than
 * letting the silence imply the remainder are all states.
 */

/**
 * Words the dataset uses to describe a category of people rather than a
 * government. Checked as whole words, so "Culture" matches "Hallstatt culture"
 * and not a name that merely contains the letters.
 */
const DESCRIBES_A_PEOPLE =
  /\b(hunters?|hunter-gatherers?|gatherers?|foragers?|fishers?|fichers?|farmers?|herders?|pastoralists?|nomads?|nomadic|tribes?|cultures?|peoples?|speakers?|horticulturalists?)\b/i;

/**
 * Names the test above gets wrong, each checked by hand against the full list.
 *
 * Four of these are recognised tribal governments in the modern United States,
 * which are polities in the ordinary sense however the word "Tribe" reads in
 * isolation, and one is a sovereign state whose official name contains
 * "People's". Getting this backwards would be the worse error of the two: it
 * would take a real government and render it as a cultural region.
 */
const NOT_DESPITE_THE_WORD = /^(Confederated Tribes|Salish & Kootenai Tribes|Seminole Tribe)\b|People's Republic/i;

export function isCultureArea(name: string | undefined | null): boolean {
  if (!name) return false;
  if (NOT_DESPITE_THE_WORD.test(name)) return false;
  return DESCRIBES_A_PEOPLE.test(name);
}
