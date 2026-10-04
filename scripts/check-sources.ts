/**
 * Health check: fetch every active source once and print a table.
 *
 *   npm run check                 # all active sources
 *   npm run check -- prothomalo   # one or more source ids
 *   npm run check -- --json       # machine-readable output
 *
 * Exits with code 1 if any source fails.
 */
import { getNews } from "../src/lib/news";

const args = process.argv.slice(2);
const json = args.includes("--json");
const ids = args.filter((a) => !a.startsWith("--"));

const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n));

async function main() {
  const { items, statuses } = await getNews({ sourceIds: ids.length ? ids : undefined, force: true });

  if (json) {
    console.log(JSON.stringify({ statuses, sample: items.slice(0, 5) }, null, 2));
  } else {
    console.log(`${pad("SOURCE", 26)}${pad("METHOD", 9)}${pad("STATUS", 8)}${pad("ITEMS", 7)}${pad("MS", 7)}DETAIL`);
    for (const s of statuses) {
      const first = items.find((i) => i.sourceId === s.sourceId);
      const detail = s.ok ? (first?.title ?? "") : (s.error ?? "");
      console.log(
        `${pad(s.sourceName, 26)}${pad(s.method, 9)}${pad(s.ok ? "OK" : "FAIL", 8)}${pad(String(s.count), 7)}${pad(String(s.durationMs), 7)}${pad(detail, 70)}`,
      );
    }
    const ok = statuses.filter((s) => s.ok).length;
    console.log(`\n${ok}/${statuses.length} sources OK, ${items.length} headlines`);
  }

  process.exit(statuses.every((s) => s.ok) ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
