import { readStore, writeStoreSoon } from "./store";
import type { NewsItem } from "./types";

/**
 * Homepage-scraped headlines carry no publish time. Instead, remember when each one first showed
 * up: a good stand-in, since outlets put new stories on their homepage as they publish them.
 *
 * The first time a source is fetched, its headlines were already there for an unknown time, so
 * they get no time at all; only headlines that appear after that are stamped.
 */
interface SeenData {
  /** Source id → when it was first fetched. */
  sources: Record<string, string>;
  /** Link → [first seen (ISO, or "" if it was there on the first fetch), last seen (ms)]. */
  links: Record<string, [string, number]>;
}

/** Links not seen for this long are forgotten. */
const FORGET_MS = 3 * 24 * 3600_000;
const NAME = "first-seen";

const g = globalThis as unknown as { __firstSeen?: SeenData };
const data: SeenData = (g.__firstSeen ??= readStore<SeenData>(NAME, { sources: {}, links: {} }));

/** Sets `seenAt` on undated items, recording new ones. */
export function stampFirstSeen(sourceId: string, items: NewsItem[], now = Date.now()): void {
  const undated = items.filter((it) => !it.publishedAt);
  if (!undated.length) return;

  const iso = new Date(now).toISOString();
  const baseline = !data.sources[sourceId];
  if (baseline) data.sources[sourceId] = iso;

  for (const it of undated) {
    let rec = data.links[it.link];
    if (rec) rec[1] = now;
    else rec = data.links[it.link] = [baseline ? "" : iso, now];
    if (rec[0]) it.seenAt = rec[0];
  }

  writeStoreSoon(NAME, () => {
    const cutoff = Date.now() - FORGET_MS;
    for (const [link, [, last]] of Object.entries(data.links)) if (last < cutoff) delete data.links[link];
    return data;
  });
}
