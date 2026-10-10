"use client";

import { useMemo, useState, useSyncExternalStore } from "react";

/**
 * Where Supabase keeps the signed-in session in localStorage (see src/lib/supabase.ts). The header reads
 * it from here, so the board shows who is signed in without loading the Supabase client.
 */
export const AUTH_STORAGE_KEY = "bartaboard:auth";

export interface AccountSummary {
  email: string;
  name?: string;
  avatar?: string;
}

function subscribe(listener: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === AUTH_STORAGE_KEY || e.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

function snapshot(): string | null {
  try {
    return localStorage.getItem(AUTH_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** The signed-in account on this device, or null. Read from the stored session, never checked with the server. */
export function useAccount(): AccountSummary | null {
  const raw = useSyncExternalStore(subscribe, snapshot, () => null);
  return useMemo(() => {
    if (!raw) return null;
    try {
      const user = (JSON.parse(raw) as { user?: { email?: string; user_metadata?: Record<string, unknown> } }).user;
      if (!user?.email) return null;
      const meta = user.user_metadata ?? {};
      const text = (v: unknown) => (typeof v === "string" && v ? v : undefined);
      return { email: user.email, name: text(meta.full_name) ?? text(meta.name), avatar: text(meta.avatar_url) };
    } catch {
      return null;
    }
  }, [raw]);
}

/** A profile photo, or the first letter of the email on the accent colour. */
export function Avatar({ email, src, className = "" }: { email: string; src?: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (src && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a small remote photo; not worth the image optimizer
      <img
        src={src}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className={`shrink-0 rounded-full object-cover ${className}`}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full bg-accent font-semibold uppercase text-accent-ink ${className}`}
    >
      {email.charAt(0)}
    </span>
  );
}
