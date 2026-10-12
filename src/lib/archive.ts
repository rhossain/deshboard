import { dhakaDay } from "@/components/time";
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

/**
 * A day's headlines: what was kept of it before, with the fresh ones added. The cache only reaches back 72
 * hours, so the oldest day it has is partial; merging keeps the part that has already left it. The fresh
 * copy of a link wins (a corrected title, a found time). Newest first.
 */
export function mergeDay(kept: NewsItem[], fresh: NewsItem[]): NewsItem[] {
  const byLink = new Map<string, NewsItem>();
  for (const it of kept) byLink.set(it.link, it);
  for (const it of fresh) byLink.set(it.link, it);
  return [...byLink.values()].sort((a, b) => newestFirst(itemTime(a), itemTime(b)));
}
