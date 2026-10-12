"use client";

import { useSyncExternalStore } from "react";
import { NEWS_DENSITY_ATTR, NEWS_DENSITY_KEY, type NewsDensity } from "@/lib/news-density";

const listeners = new Set<() => void>();

function read(): NewsDensity {
  return document.documentElement.getAttribute(NEWS_DENSITY_ATTR) === "compact" ? "compact" : "comfortable";
}

function apply(density: NewsDensity) {
  if (density === "compact") document.documentElement.setAttribute(NEWS_DENSITY_ATTR, "compact");
  else document.documentElement.removeAttribute(NEWS_DENSITY_ATTR);
}

export function setNewsDensity(density: NewsDensity) {
  try {
    if (density === "compact") localStorage.setItem(NEWS_DENSITY_KEY, density);
    else localStorage.removeItem(NEWS_DENSITY_KEY);
  } catch {
    // Storage blocked: the choice still applies until the page is closed.
  }
  apply(density);
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab changed it.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== NEWS_DENSITY_KEY) return;
    apply(e.newValue === "compact" ? "compact" : "comfortable");
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** The reader's density; "comfortable" while prerendering. */
export function useNewsDensity(): NewsDensity {
  return useSyncExternalStore(subscribe, read, () => "comfortable");
}
