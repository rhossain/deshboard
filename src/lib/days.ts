import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { byDay, keptDates, mergeDay } from "./archive";
import { addressKey } from "./fetchers/utils";
import { DIR, ENABLED } from "./store";
import type { NewsDay, NewsItem } from "./types";

/** The day files (see archive.ts), next to the other stores; served at /data/days/<date>.json. */
const DAYS_DIR = path.join(DIR, "days");
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function file(date: string): string {
  return path.join(DAYS_DIR, `${date}.json`);
}

/** A kept day's file as served, or null when there is none. */
export function readDay(date: string): string | null {
  if (!DATE.test(date)) return null;
  try {
    return readFileSync(file(date), "utf8");
  } catch {
    return null;
  }
}

/**
 * A kept day's file as the site serves it (the search reads it): without the headlines' pictures, which
 * only the share page needs (see NewsItem.image). Null when there is none.
 */
export function servedDay(date: string): string | null {
  const text = readDay(date);
  if (!text) return null;
  try {
    const day = JSON.parse(text) as NewsDay;
    return JSON.stringify({ ...day, items: day.items.map(({ image: _image, ...it }) => it) } satisfies NewsDay); // eslint-disable-line @typescript-eslint/no-unused-vars
  } catch {
    return text;
  }
}

/** A kept day's headlines, with their pictures; empty when there is no such day. */
export function dayItems(date: string): NewsItem[] {
  return parseDay(readDay(date), date);
}

/** A day file's headlines; a damaged file is started over rather than stopping every save from here on. */
function parseDay(text: string | null, date: string): NewsItem[] {
  if (!text) return [];
  try {
    return (JSON.parse(text) as NewsDay).items;
  } catch (err) {
    console.warn(`[days] ${date}.json could not be read, starting it over:`, err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Merges the cached headlines into the day files, after each background refresh: the cache reaches back
 * 72 hours, the files KEEP_DAYS days. Days that left the window are deleted. On a read-only disk this
 * fails quietly, and the search simply has no earlier headlines.
 */
export function saveDays(items: NewsItem[]): void {
  if (!ENABLED) return;
  const keep = keptDates();
  try {
    mkdirSync(DAYS_DIR, { recursive: true });
    const days = byDay(items);
    // Each address on one day only: the one its time now falls on (an article moves when its time is
    // corrected). By address alone: an outlet's same headline on two days can be two articles (a daily column).
    const dayOf = new Map<string, string>();
    for (const [date, fresh] of days) for (const it of fresh) dayOf.set(addressKey(it.link), date);
    for (const [date, fresh] of days) {
      if (!keep.includes(date)) continue;
      const before = readDay(date);
      const kept = parseDay(before, date).filter((it) => (dayOf.get(addressKey(it.link)) ?? date) === date);
      const after = JSON.stringify({ date, items: mergeDay(kept, fresh) } satisfies NewsDay);
      if (after === before) continue;
      // Write then rename, so a reader never gets a half-written file.
      writeFileSync(`${file(date)}.tmp`, after);
      renameSync(`${file(date)}.tmp`, file(date));
    }
    for (const name of readdirSync(DAYS_DIR)) {
      if (!keep.includes(name.replace(/\.json$/, ""))) rmSync(path.join(DAYS_DIR, name), { force: true });
    }
  } catch (err) {
    console.warn("[days] could not save:", err instanceof Error ? err.message : err);
  }
}
