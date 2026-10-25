"use client";

import { useEffect, useState } from "react";

/**
 * Whether the person reading the public board is signed in to the admin (docs/admin.md "Saving from the board"), so
 * its share sheet can offer "Save for a social post" — and nothing else changes for anyone else.
 *
 * Cloudflare Access signs the admin in at /admin, and its cookie comes along on this origin's calls to /api/admin.
 * So the check is one GET /api/admin/ping — but only in a browser the admin has used: the admin page leaves a mark
 * in localStorage (markAdminSeen) and only then does a board page ask the door at all. A reader who never opened
 * the admin costs nothing; one whose session has run out gets Access's sign-in page back (not JSON), the mark is
 * taken away, and the asking stops until the admin signs in again. The answer is kept for the tab (sessionStorage)
 * for a while, so moving around the site doesn't ask each time.
 */
const MARK = "bartaboard:admin";
const CACHE = "bartaboard:admin-session";
const CACHE_TTL_MS = 10 * 60_000;

let asking: Promise<string | null> | null = null;

/** The admin page says it was opened here (AdminShell, once Access let the person in). */
export function markAdminSeen(): void {
  try {
    localStorage.setItem(MARK, "1");
  } catch {
    // Storage blocked: the board just won't offer the admin's tile here.
  }
}

/** The admin's address when signed in here, else null. Asked once a page view. */
export function adminSession(): Promise<string | null> {
  if (asking) return asking;
  asking = (async () => {
    try {
      if (localStorage.getItem(MARK) !== "1") return null;
    } catch {
      return null;
    }
    try {
      const cached = JSON.parse(sessionStorage.getItem(CACHE) ?? "null") as { email?: string; at?: number } | null;
      if (cached?.email && typeof cached.at === "number" && Date.now() - cached.at < CACHE_TTL_MS) return cached.email;
    } catch {
      // No cache: ask.
    }
    let email: string | null = null;
    try {
      const res = await fetch("/api/admin/ping", { credentials: "same-origin", cache: "no-store" });
      if (res.ok && !res.redirected && res.headers.get("content-type")?.includes("json")) {
        const body = (await res.json()) as { email?: string };
        if (typeof body.email === "string" && body.email) email = body.email;
      }
    } catch {
      // Access sent its sign-in page from another origin: not signed in.
    }
    try {
      if (email) sessionStorage.setItem(CACHE, JSON.stringify({ email, at: Date.now() }));
      else {
        sessionStorage.removeItem(CACHE);
        localStorage.removeItem(MARK);
      }
    } catch {
      // Fine either way.
    }
    return email;
  })();
  return asking;
}

/** The signed-in admin's address, once known; null before, and for everyone else. */
export function useAdminSession(): string | null {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    let off = false;
    adminSession().then((e) => !off && setEmail(e));
    return () => {
      off = true;
    };
  }, []);
  return email;
}
