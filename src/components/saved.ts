"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { NewsItem, Video } from "@/lib/types";

/**
 * Saved headlines and videos, kept per device in localStorage. The whole item is stored, so a saved
 * one stays readable after it drops out of its feed.
 */
export interface SavedEntry {
  item: NewsItem;
  savedAt: string;
}

export interface SavedVideo {
  video: Video;
  /** The channel's name when saved, so the entry doesn't need the video feed. */
  channelName: string;
  savedAt: string;
}

const MAX = 500;
const EMPTY = "[]";

/** A list in localStorage under `key`, with entries told apart by `idOf`. */
function createStore<T>(key: string, idOf: (entry: T) => string | undefined) {
  const listeners = new Set<() => void>();
  // Cached so snapshots are stable, and so saving still works for the session if storage is blocked.
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

  function parse(raw: string): T[] {
    try {
      const list = JSON.parse(raw) as T[];
      return Array.isArray(list) ? list.filter((e) => e && idOf(e)) : [];
    } catch {
      return [];
    }
  }

  /** Adds `entry` at the top, or removes it if it is already there. */
  function toggle(entry: T) {
    const list = parse(snapshot());
    const at = list.findIndex((e) => idOf(e) === idOf(entry));
    if (at >= 0) list.splice(at, 1);
    else list.unshift(entry);
    current = JSON.stringify(list.slice(0, MAX));
    try {
      localStorage.setItem(key, current);
    } catch {
      // Storage unavailable: keep the in-memory copy.
    }
    for (const l of listeners) l();
  }

  /** Entries, newest first, and the ids among them. */
  function useEntries(): { entries: T[]; ids: Set<string> } {
    const raw = useSyncExternalStore(subscribe, snapshot, () => EMPTY);
    const entries = useMemo(() => parse(raw), [raw]);
    const ids = useMemo(() => new Set(entries.map((e) => idOf(e)!)), [entries]);
    return { entries, ids };
  }

  return { toggle, useEntries };
}

const headlines = createStore<SavedEntry>("deshboard:saved", (e) => e.item?.link);
const videos = createStore<SavedVideo>("deshboard:saved-videos", (e) => e.video?.id);

/** Saved headlines, newest first, and a toggle that saves or removes one. */
export function useSaved(): { saved: SavedEntry[]; savedLinks: Set<string>; toggleSaved: (item: NewsItem) => void } {
  const { entries, ids } = headlines.useEntries();
  const toggleSaved = useCallback(
    (item: NewsItem) => headlines.toggle({ item, savedAt: new Date().toISOString() }),
    [],
  );
  return { saved: entries, savedLinks: ids, toggleSaved };
}

/** Saved videos, newest first, and a toggle that saves or removes one. */
export function useSavedVideos(): {
  savedVideos: SavedVideo[];
  savedVideoIds: Set<string>;
  toggleSavedVideo: (video: Video, channelName: string) => void;
} {
  const { entries, ids } = videos.useEntries();
  const toggleSavedVideo = useCallback(
    (video: Video, channelName: string) => videos.toggle({ video, channelName, savedAt: new Date().toISOString() }),
    [],
  );
  return { savedVideos: entries, savedVideoIds: ids, toggleSavedVideo };
}
