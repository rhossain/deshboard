"use client";

import { useSyncExternalStore } from "react";
import { VIDEO_LAYOUT_ATTR, VIDEO_LAYOUT_KEY, type VideoLayout } from "@/lib/video-layout";

const listeners = new Set<() => void>();
/** Where the default layout turns from a list into a grid (Tailwind's `sm`). */
const WIDE = "(min-width: 640px)";

function read(): VideoLayout | null {
  const l = document.documentElement.getAttribute(VIDEO_LAYOUT_ATTR);
  return l === "grid" || l === "list" ? l : null;
}

function apply(layout: VideoLayout) {
  document.documentElement.setAttribute(VIDEO_LAYOUT_ATTR, layout);
}

export function setVideoLayout(layout: VideoLayout) {
  try {
    localStorage.setItem(VIDEO_LAYOUT_KEY, layout);
  } catch {
    // Storage blocked: the choice still applies until the page is closed.
  }
  apply(layout);
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const wide = window.matchMedia(WIDE);
  // Another tab changed the layout.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== VIDEO_LAYOUT_KEY || (e.newValue !== "grid" && e.newValue !== "list")) return;
    apply(e.newValue);
    listener();
  };
  window.addEventListener("storage", onStorage);
  wide.addEventListener("change", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
    wide.removeEventListener("change", listener);
  };
}

/** The reader's choice; null for the default, and while prerendering. */
export function useVideoLayoutChoice(): VideoLayout | null {
  return useSyncExternalStore(subscribe, read, () => null);
}

/** The layout in force: the reader's choice, or the default for this screen. "grid" while prerendering. */
export function useVideoLayout(): VideoLayout {
  return useSyncExternalStore(
    subscribe,
    () => read() ?? (window.matchMedia(WIDE).matches ? "grid" : "list"),
    () => "grid",
  );
}
