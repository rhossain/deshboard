import { dhakaDay } from "@/components/time";
import { addressKey, titleKey } from "./fetchers/utils";
import { itemTime, newestFirst } from "./stories";
import type { NewsItem } from "./types";

/**
 * Days of headlines kept as day files (`/data/days/<date>.json`, see NewsDay): the search looks back
 * through them once the board's own 72 hours run out (docs/search.md), and shared links find old
 * headlines in them.
 */
export const KEEP_DAYS = 30;

/** The Dhaka days kept, newest first: today and the KEEP_DAYS - 1 before it. */
export function keptDates(now = Date.now()): string[] {
  return Array.from({ length: KEEP_DAYS }, (_, i) => dhakaDay(now - i * 86_400_000));
}

/** Dated headlines by Dhaka day. Undated ones are left out: they are on the board while on their homepage. */
export function byDay(items: NewsItem[]): Map<string, NewsItem[]> {
  const days = new Map<string, NewsItem[]>();
  for (const it of items) {
    const time = itemTime(it);
    if (!time) continue;
    const day = dhakaDay(time);
    const list = days.get(day);
    if (list) list.push(it);
    else days.set(day, [it]);
  }
  return days;
}

/** Same article: same address (see addressKey), or the same outlet's same headline. */
function articleKeys(it: NewsItem): [string, string] {
  return [addressKey(it.link), `${it.sourceId}\n${titleKey(it.title)}`];
}

/**
 * A day's headlines: what was kept of it before, with the fresh ones added. The cache only reaches back 72
 * hours, so the oldest day it has is partial; merging keeps the part that has already left it. The fresh
 * copy of an article wins (a corrected title, a found time). Newest first.
 */
export function mergeDay(kept: NewsItem[], fresh: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  const out: NewsItem[] = [];
  for (const it of [...fresh, ...kept]) {
    const keys = articleKeys(it);
    if (keys.some((k) => seen.has(k))) continue;
    for (const k of keys) seen.add(k);
    out.push(it);
  }
  return out.sort((a, b) => newestFirst(itemTime(a), itemTime(b)));
}
