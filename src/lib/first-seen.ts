import { readStore, writeStoreSoon } from "./store";
import type { NewsItem } from "./types";

/**
 * Homepage-scraped headlines carry no publish time. Instead, remember when each one first showed
 * up: a good stand-in, since outlets put new stories on their homepage as they publish them.
 *
 * The first time a source is fetched, its headlines were already there for an unknown time, so
 * they get no time at all; only headlines that appear after that are stamped. The same goes after a
 * long gap (the source was failing, or updates stopped): what turned up meanwhile could be hours old.
 */
interface SeenData {
  /** Source id → when it was first fetched. */
  sources: Record<string, string>;
  /** Source id → when it was last fetched (ms). */
  fetched?: Record<string, number>;
  /** Link → [first seen (ISO, or "" if it was there on the first fetch), last seen (ms)]. */
  links: Record<string, [string, number]>;
}

/** Links not seen for this long are forgotten. */
const FORGET_MS = 3 * 24 * 3600_000;
/** New headlines after a gap longer than this get no time, as on the first fetch. */
const GAP_MS = 2 * 3600_000;
const NAME = "first-seen";

const g = globalThis as unknown as { __firstSeen?: SeenData };
const data: SeenData = (g.__firstSeen ??= readStore<SeenData>(NAME, { sources: {}, links: {} }));

/** Sets `seenAt` on undated items, recording new ones. Call it on every successful fetch of a source. */
export function stampFirstSeen(sourceId: string, items: NewsItem[], now = Date.now()): void {
  // Every fetch counts, even one with nothing undated: a dated feed's odd undated headline is new.
  const fetched = (data.fetched ??= {});
  const last = fetched[sourceId];
  const baseline = last === undefined ? !data.sources[sourceId] : now - last > GAP_MS;
  fetched[sourceId] = now;
  const iso = new Date(now).toISOString();
  data.sources[sourceId] ??= iso;

  const undated = items.filter((it) => !it.publishedAt);
  const floor = baseline ? Infinity : recentFloor(undated, now);
  for (const it of undated) {
    let rec = data.links[it.link];
    if (rec) rec[1] = now;
    // A new link with an article number below the page's recent ones is an old article resurfacing
    // ("most read", "related"): its age is unknown, as on the first fetch.
    else rec = data.links[it.link] = [baseline || (articleNumber(it.link) ?? Infinity) < floor ? "" : iso, now];
    if (rec[0]) it.seenAt = rec[0];
  }

  writeStoreSoon(NAME, () => {
    const cutoff = Date.now() - FORGET_MS;
    for (const [link, [, last]] of Object.entries(data.links)) if (last < cutoff) delete data.links[link];
    return data;
  });
}

/** The article number in a link (the longest run of digits in its path, of four or more), if any. */
function articleNumber(link: string): number | undefined {
  let path = link;
  try {
    path = new URL(link).pathname;
  } catch {
    // keep the whole link
  }
  const runs = path.match(/\d{4,}/g);
  if (!runs) return undefined;
  return Number(runs.reduce((a, b) => (b.length >= a.length ? b : a)));
}

/** Among the page's links first seen in the last RECENT_MS, how many must be counted to judge (see recentFloor). */
const MIN_RECENT = 10;
const RECENT_MS = 24 * 3600_000;

/**
 * The article number the page's recently new links mostly reach: the tenth percentile of theirs, so a
 * stray old one stamped before doesn't lower it. -Infinity (no floor) without enough of them.
 */
function recentFloor(items: NewsItem[], now: number): number {
  const since = new Date(now - RECENT_MS).toISOString();
  const numbers: number[] = [];
  for (const it of items) {
    const first = data.links[it.link]?.[0];
    const n = first && first >= since ? articleNumber(it.link) : undefined;
    if (n !== undefined) numbers.push(n);
  }
  if (numbers.length < MIN_RECENT) return -Infinity;
  return numbers.sort((a, b) => a - b)[Math.floor(numbers.length / 10)];
}
