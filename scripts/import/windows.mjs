import { sparql, SparqlTooHeavy } from "./sparql.mjs";

/**
 * Runs a date-windowed query, halving any window the endpoint refuses.
 *
 * WDQS gives a query 60 seconds and then throws it away — as a timeout, or as a
 * bare 502 when the worker is killed — and how much fits in that budget depends
 * on how busy the public endpoint is, not on anything we control. A fixed window size would therefore either leave records behind in
 * dense centuries or waste the whole run failing on them. Splitting on the
 * actual failure lets one setting work from the Bronze Age to the present.
 */
export async function windowed({
  from, to, step, minStep = 25, splitBudget = 14, label, build, onRows,
}) {
  const queue = [];
  for (let y = from; y < to; y += step) queue.push([y, Math.min(y + step, to)]);

  let ok = 0, split = 0, dropped = 0;
  while (queue.length) {
    const [a, b] = queue.shift();
    const tag = `${label} ${a}..${b}`;
    try {
      const { rows, ms } = await sparql(build(a, b), { label: tag, retries: 2 });
      onRows(rows);
      ok++;
      console.log(`    ${tag}: ${rows.length} rows, ${ms}ms`);
    } catch (err) {
      // Splitting assumes the cost tracks how much falls inside the window.
      // Where it does not — a query whose real work happens before the date
      // filter — halving an empty range just buys two more of the same wait, so
      // the budget caps how far that can go before the window is written off.
      if (err instanceof SparqlTooHeavy && b - a > minStep && split < splitBudget) {
        const mid = Math.floor((a + b) / 2);
        queue.unshift([a, mid], [mid, b]);
        split++;
        console.log(`    ${tag}: too heavy, splitting at ${mid} (${split}/${splitBudget})`);
      } else {
        dropped++;
        console.warn(`    ${tag}: giving up — ${err.message}`);
      }
    }
    // The public endpoint is a shared resource; don't hammer it.
    await new Promise((r) => setTimeout(r, 400));
  }
  console.log(`  ${label}: ${ok} windows ok, ${split} split, ${dropped} dropped`);
  return { ok, split, dropped };
}

/** An ISO datetime literal SPARQL will compare against a time value. */
export const dt = (year) => {
  const y = year <= 0 ? year + 1 : year; // back to astronomical numbering
  const sign = y < 0 ? "-" : "";
  return `"${sign}${String(Math.abs(y)).padStart(4, "0")}-01-01T00:00:00Z"^^xsd:dateTime`;
};
