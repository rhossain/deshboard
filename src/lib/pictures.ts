import { outletHead } from "./outlet-head";
import { getSource } from "./sources";
import { itemTime } from "./stories";
import type { NewsItem, SourceResult } from "./types";

/**
 * Pictures for new headlines whose feed names none (sitemaps without image:loc, homepages), read once
 * from each article's page (its og:image, see outlet-head.ts) by the background refresh (news.ts), for
 * share pages and link previews, so a share page has its picture without waiting for the outlet.
 *
 * Only the last day's headlines, newest first, a few at a time and at most MAX_PER_RUN a run: the
 * first runs work through the backlog, after that it is each run's new headlines. Each is looked for
 * once: found or not, the result is kept with the headline (NewsItem.image).
 */
const MAX_PER_RUN = 150;
const CONCURRENCY = 6;
const TIMEOUT_MS = 8000;
/** No new lookups after this long: the rest wait for the next run. */
const BUDGET_MS = 60_000;
const RECENT_MS = 24 * 3600_000;

export interface PictureReport {
  looked: number;
  found: number;
  /** Why pages couldn't be read, by outlet: "http-403" and the like, with counts. */
  failed: Map<string, Map<string, number>>;
}

/** Fills in `image` on the results' headlines that have none yet (the objects are changed in place). */
export async function findPictures(results: SourceResult[], now = Date.now()): Promise<PictureReport> {
  const since = new Date(now - RECENT_MS).toISOString();
  // A headline with no time is on its outlet's homepage now.
  const time = (it: NewsItem) => itemTime(it) ?? new Date(now).toISOString();
  const queues = results
    .filter((r) => r.ok && !r.via && getSource(r.sourceId)?.method !== "google-news")
    .map((r) => r.items.filter((it) => it.image === undefined && time(it) >= since).sort((a, b) => time(b).localeCompare(time(a))))
    .filter((q) => q.length);

  // Newest first across outlets, taking turns, so no outlet is asked for many pages at once.
  const todo: NewsItem[] = [];
  for (let i = 0; todo.length < MAX_PER_RUN && queues.some((q) => i < q.length); i++) {
    const round = queues.flatMap((q) => (i < q.length ? [q[i]] : [])).sort((a, b) => time(b).localeCompare(time(a)));
    todo.push(...round.slice(0, MAX_PER_RUN - todo.length));
  }

  const report: PictureReport = { looked: 0, found: 0, failed: new Map() };
  const stopAt = Date.now() + BUDGET_MS;
  let next = 0;
  const worker = async () => {
    while (next < todo.length && Date.now() < stopAt) {
      const it = todo[next++];
      report.looked++;
      let why = "";
      const head = await outletHead(it.link, TIMEOUT_MS, (reason) => (why = reason));
      it.image = head?.image ?? null;
      if (it.image) report.found++;
      else if (why) {
        const counts = report.failed.get(it.sourceName) ?? new Map<string, number>();
        counts.set(why, (counts.get(why) ?? 0) + 1);
        report.failed.set(it.sourceName, counts);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker));
  return report;
}
