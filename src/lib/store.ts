import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Small JSON files on disk, so cached headlines and first-seen times survive restarts.
 * Set `NEWS_DATA_DIR` to move them (default `.data/`), or `NEWS_PERSIST=0` to keep everything in memory.
 * On hosts with a read-only or throwaway filesystem (serverless), writes fail quietly and the app
 * behaves as if persistence were off.
 */
const DIR = process.env.NEWS_DATA_DIR || path.join(process.cwd(), ".data");
const ENABLED = process.env.NEWS_PERSIST !== "0";
const WRITE_DELAY_MS = 2000;

const g = globalThis as unknown as { __storeTimers?: Map<string, ReturnType<typeof setTimeout>> };
const timers = (g.__storeTimers ??= new Map());

export function readStore<T>(name: string, fallback: T): T {
  if (!ENABLED) return fallback;
  try {
    return JSON.parse(readFileSync(path.join(DIR, `${name}.json`), "utf8")) as T;
  } catch {
    return fallback;
  }
}

/** Writes `get()` to disk shortly, coalescing bursts of changes into one write. */
export function writeStoreSoon(name: string, get: () => unknown): void {
  if (!ENABLED || timers.has(name)) return;
  const timer = setTimeout(() => {
    timers.delete(name);
    try {
      mkdirSync(DIR, { recursive: true });
      const file = path.join(DIR, `${name}.json`);
      // Write then rename, so a crash mid-write never leaves a half-written file behind.
      writeFileSync(`${file}.tmp`, JSON.stringify(get()));
      renameSync(`${file}.tmp`, file);
    } catch (err) {
      console.warn(`[store] could not save ${name}:`, err instanceof Error ? err.message : err);
    }
  }, WRITE_DELAY_MS);
  timer.unref?.();
  timers.set(name, timer);
}
