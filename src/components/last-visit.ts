"use client";

import { useSyncExternalStore } from "react";

/**
 * When the reader's previous visit ended, so headlines since then can be marked new.
 *
 * `seen` is updated whenever the page is hidden or closed. Coming back after more than 30 minutes
 * away starts a new visit (marks move on to what arrived since `seen`); a reload or a quick switch
 * to another tab continues the current one and keeps its marks. The tab may stay open for days.
 */
const KEY = "deshboard:visit";
const NEW_VISIT_AFTER_MS = 30 * 60_000;

interface Visit {
  /** Headlines after this are new. 0 on a first visit: nothing is marked. */
  since: number;
  /** When the reader last had the page in front of them. */
  seen: number;
}

const listeners = new Set<() => void>();
let visit: Visit | undefined;

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(visit));
  } catch {
    // Storage unavailable: marks last for this page view only.
  }
}

/** Reads the stored visit and starts a new one if the reader has been away long enough. */
function resume(): Visit {
  let stored: Partial<Visit> = {};
  try {
    stored = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Visit>;
  } catch {
    // Unreadable: treat as a first visit.
  }
  const now = Date.now();
  const seen = stored.seen ?? 0;
  visit = { since: seen && now - seen > NEW_VISIT_AFTER_MS ? seen : (stored.since ?? 0), seen: now };
  save();
  return visit;
}

function onHide() {
  if (!visit) return;
  visit = { ...visit, seen: Date.now() };
  save();
}

function onVisibility() {
  if (document.visibilityState === "hidden") return onHide();
  const before = visit?.since;
  resume();
  if (visit!.since !== before) for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  if (!listeners.size) {
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onHide);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onHide);
    }
  };
}

function snapshot(): number {
  return (visit ?? resume()).since;
}

/** ISO time after which headlines are new, or null on a first visit and during server rendering. */
export function useLastVisit(): string | null {
  const since = useSyncExternalStore(subscribe, snapshot, () => 0);
  return since ? new Date(since).toISOString() : null;
}
