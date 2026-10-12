import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { byDay, keptDates, mergeDay } from "./archive";
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
 * Merges the cached headlines into the day files, after each background refresh: the cache reaches back
 * 72 hours, the files KEEP_DAYS days. Days that left the window are deleted. On a read-only disk this
 * fails quietly, and the search simply has no earlier headlines.
 */
export function saveDays(items: NewsItem[]): void {
  if (!ENABLED) return;
  const keep = keptDates();
  try {
    mkdirSync(DAYS_DIR, { recursive: true });
    for (const [date, fresh] of byDay(items)) {
      if (!keep.includes(date)) continue;
      const before = readDay(date);
      const kept = before ? (JSON.parse(before) as NewsDay).items : [];
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
