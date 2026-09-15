import { sparql, val, qid } from "./sparql.mjs";

/**
 * Expands a set of class QIDs into themselves plus every subclass, once.
 *
 * Writing `wdt:P31/wdt:P279*` inside a windowed query looks tidy and is a trap:
 * the closure is evaluated across the whole graph before the date filter can
 * prune anything, so a window covering an empty millennium costs exactly as
 * much as one covering a crowded century. The first full run spent 35 minutes
 * on 3000-2400 BCE that way and returned nothing at all.
 *
 * Resolving the closure up front turns the property path into a plain join
 * against a literal list, which is the shape the endpoint is fast at.
 */
export async function expandSubclasses(roots, { cap = 400 } = {}) {
  const values = roots.map((q) => `wd:${q}`).join(" ");
  const { rows, ms } = await sparql(
    `SELECT DISTINCT ?c WHERE {
       VALUES ?root { ${values} }
       ?c wdt:P279* ?root .
     }`,
    { label: "subclass closure", retries: 2 },
  );
  const all = rows.map((r) => qid(val(r, "c"))).filter(Boolean);
  const out = [...new Set([...roots, ...all])];
  console.log(`  closure: ${roots.length} roots -> ${out.length} classes in ${ms}ms`);
  if (out.length > cap) {
    console.warn(`  closure is larger than ${cap}; keeping the roots only`);
    return roots;
  }
  return out;
}
