"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * Per-device card preferences, kept in localStorage:
 * - `collapsed`: the reader's explicit choice per source (absent = use the default)
 * - `seen`: the lead headline's link when the card was last toggled, to mark new headlines
 */
export interface CardPrefs {
  collapsed: Record<string, boolean>;
  seen: Record<string, string>;
}

const KEY = "bd-news-desk:cards";
const EMPTY = "{}";
const listeners = new Set<() => void>();
// Cached so snapshots are stable, and so preferences still work for the session if storage is blocked.
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

function parse(raw: string): CardPrefs {
  try {
    const p = JSON.parse(raw) as Partial<CardPrefs>;
    return { collapsed: p.collapsed ?? {}, seen: p.seen ?? {} };
  } catch {
    return { collapsed: {}, seen: {} };
  }
}

export function useCardPrefs(): [CardPrefs, (change: (draft: CardPrefs) => void) => void] {
  const raw = useSyncExternalStore(subscribe, snapshot, () => EMPTY);
  const prefs = useMemo(() => parse(raw), [raw]);

  const update = useCallback((change: (draft: CardPrefs) => void) => {
    const draft = parse(snapshot());
    change(draft);
    current = JSON.stringify(draft);
    try {
      localStorage.setItem(KEY, current);
    } catch {
      // Storage unavailable (private mode, blocked): keep the in-memory copy.
    }
    for (const l of listeners) l();
  }, []);

  return [prefs, update];
}

const PHONE = "(max-width: 767px)";

/** True on phone-width screens, where cards can be collapsed. False during server rendering. */
export function useIsPhone(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(PHONE);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(PHONE).matches,
    () => false,
  );
}
