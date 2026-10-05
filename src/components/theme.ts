"use client";

import { useSyncExternalStore } from "react";
import { applyThemeColor, THEME_KEY, type Theme } from "@/lib/theme";

const listeners = new Set<() => void>();

function read(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return (document.documentElement.getAttribute("data-theme") as Theme | null) ?? "system";
  }
}

function apply(theme: Theme) {
  const root = document.documentElement;
  // Without this, every element with a `transition` class would fade at its own speed.
  root.classList.add("theme-switching");
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  applyThemeColor(theme);
  void root.offsetWidth;
  requestAnimationFrame(() => root.classList.remove("theme-switching"));
}

export function setTheme(theme: Theme) {
  try {
    if (theme === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Storage blocked: the choice still applies until the page is closed.
  }
  const animate =
    !!document.startViewTransition &&
    document.visibilityState === "visible" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (animate) {
    // A skipped transition still applies the theme; only its promise rejects.
    document.startViewTransition(() => apply(theme)).ready.catch(() => {});
  } else {
    apply(theme);
  }
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab changed the theme.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== THEME_KEY) return;
    apply(read());
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** The saved theme preference. "system" while server rendering; the <head> script has already painted the right colours. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, read, () => "system");
}
