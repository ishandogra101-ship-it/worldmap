import { sparql, SparqlTooHeavy } from "./sparql.mjs";

/**
 * Runs a query over a list of values in chunks, halving any chunk the endpoint
 * refuses.
 *
 * The events layer was first chunked by date, which failed twice for the same
 * reason: the date sits behind a UNION of two properties, so the endpoint
 * cannot use it to seek and has to materialise every candidate before the
 * filter prunes anything. A window over an empty millennium then costs exactly
 * as much as one over a crowded century — 65 seconds, every time, for nothing.
 *
 * Chunking by class instead splits along the dimension P31 is actually indexed
 * on, so each query asks for something the endpoint can look up rather than
 * scan. Dates are filtered here afterwards, where they are free.
 */
export async function chunked({ items, size, minSize = 2, label, build, onRows }) {
  const queue = [];
  for (let i = 0; i < items.length; i += size) queue.push(items.slice(i, i + size));

  let ok = 0, split = 0, dropped = 0;
  while (queue.length) {
    const chunk = queue.shift();
    const tag = `${label} [${chunk.length}]`;
    try {
      const { rows, ms } = await sparql(build(chunk), { label: tag, retries: 2 });
      onRows(rows);
      ok++;
      console.log(`    ${tag}: ${rows.length} rows, ${ms}ms`);
    } catch (err) {
      if (err instanceof SparqlTooHeavy && chunk.length > minSize) {
        const mid = Math.ceil(chunk.length / 2);
        queue.unshift(chunk.slice(0, mid), chunk.slice(mid));
        split++;
        console.log(`    ${tag}: too heavy, halving`);
      } else {
        dropped++;
        console.warn(`    ${tag}: giving up — ${err.message}`);
      }
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  console.log(`  ${label}: ${ok} chunks ok, ${split} split, ${dropped} dropped`);
}
