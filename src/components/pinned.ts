"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * The reader's own sources, kept per device in localStorage: news portals for News and TV channels for
 * Videos, each a ranked list. Their headlines and videos come first, ahead of everyone else's, unless
 * the reader turns that off (the list is kept either way).
 */
export interface Pins {
  /** Source or channel ids, first = shown first. */
  ids: string[];
  /** "Pinned first" switched off. */
  off: boolean;
}

export const MAX_PINS = 20;

const EMPTY = "{}";

function createPinStore(key: string) {
  const listeners = new Set<() => void>();
  // Cached so snapshots are stable, and so pins still work for the session if storage is blocked.
  let current: string | null = null;

  function snapshot(): string {
    if (current === null) {
      try {
        current = localStorage.getItem(key) ?? EMPTY;
      } catch {
        current = EMPTY;
      }
    }
    return current;
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key) return;
      current = e.newValue ?? EMPTY;
      listener();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  }

  function parse(raw: string): Pins {
    try {
      const p = JSON.parse(raw) as Partial<Pins>;
      const ids = Array.isArray(p.ids) ? p.ids.filter((id) => typeof id === "string") : [];
      return { ids: [...new Set(ids)].slice(0, MAX_PINS), off: p.off === true };
    } catch {
      return { ids: [], off: false };
    }
  }

  function save(next: Pins) {
    current = JSON.stringify({ ids: next.ids.slice(0, MAX_PINS), off: next.off });
    try {
      localStorage.setItem(key, current);
    } catch {
      // Storage unavailable: keep the in-memory copy.
    }
    for (const l of listeners) l();
  }

  function usePins(): [Pins, (change: (pins: Pins) => Pins) => void] {
    const raw = useSyncExternalStore(subscribe, snapshot, () => EMPTY);
    const pins = useMemo(() => parse(raw), [raw]);
    const update = useCallback((change: (pins: Pins) => Pins) => save(change(parse(snapshot()))), []);
    return [pins, update];
  }

  return usePins;
}

/** Pinned news portals (News: Newsstand and Latest). */
export const usePinnedSources = createPinStore("deshboard:pinned-sources");
/** Pinned TV channels (Videos). */
export const usePinnedChannels = createPinStore("deshboard:pinned-channels");

/** Adds `id` at the end of the pins (if there's room), or takes it out if it's there. */
export function togglePin(pins: Pins, id: string): Pins {
  if (pins.ids.includes(id)) return { ...pins, ids: pins.ids.filter((x) => x !== id) };
  return pins.ids.length >= MAX_PINS ? pins : { ...pins, ids: [...pins.ids, id] };
}

/**
 * Each pinned id's place (0 = first), for the ids that are still known and only while pinning is on.
 * Empty when there is nothing to put first.
 */
export function pinRanks(pins: Pins, known?: Set<string>): Map<string, number> {
  if (pins.off) return new Map();
  return new Map(pins.ids.filter((id) => !known || known.has(id)).map((id, i) => [id, i]));
}
