"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { NewsItem } from "@/lib/types";

/**
 * Saved headlines, kept per device in localStorage. The whole item is stored, so a saved headline
 * stays readable after it drops out of its source's feed.
 */
export interface SavedEntry {
  item: NewsItem;
  savedAt: string;
}

const KEY = "deshboard:saved";
const MAX = 500;
const EMPTY = "[]";
const listeners = new Set<() => void>();
// Cached so snapshots are stable, and so saving still works for the session if storage is blocked.
let current: string | null = null;

function snapshot(): string {
  if (current === null) {
    try {
      current = localStorage.getItem(KEY) ?? EMPTY;
    } catch {
      current = EMPTY;
    }
  }
  return current;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    current = e.newValue ?? EMPTY;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function parse(raw: string): SavedEntry[] {
  try {
    const list = JSON.parse(raw) as SavedEntry[];
    return Array.isArray(list) ? list.filter((e) => e?.item?.link) : [];
  } catch {
    return [];
  }
}

/** Saved headlines, newest first, and a toggle that saves or removes one. */
export function useSaved(): { saved: SavedEntry[]; savedLinks: Set<string>; toggleSaved: (item: NewsItem) => void } {
  const raw = useSyncExternalStore(subscribe, snapshot, () => EMPTY);
  const saved = useMemo(() => parse(raw), [raw]);
  const savedLinks = useMemo(() => new Set(saved.map((e) => e.item.link)), [saved]);

  const toggleSaved = useCallback((item: NewsItem) => {
    const list = parse(snapshot());
    const at = list.findIndex((e) => e.item.link === item.link);
    if (at >= 0) list.splice(at, 1);
    else list.unshift({ item, savedAt: new Date().toISOString() });
    current = JSON.stringify(list.slice(0, MAX));
    try {
      localStorage.setItem(KEY, current);
    } catch {
      // Storage unavailable: keep the in-memory copy.
    }
    for (const l of listeners) l();
  }, []);

  return { saved, savedLinks, toggleSaved };
}
