"use client";

import { useEffect, useState } from "react";

type Door =
  | { state: "checking" }
  | { state: "open"; email: string; at: string }
  | { state: "closed"; status: number; error: string };

/**
 * The admin's first screen: asks /api/admin/ping who is signed in. Until the queue and settings arrive (Phase 2
 * onwards), this is the door's smoke test — "open" means Cloudflare Access let the request through and the
 * middleware accepted its token.
 */
export function AdminShell() {
  const [door, setDoor] = useState<Door>({ state: "checking" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/ping", { credentials: "same-origin", cache: "no-store" });
        const body = (await res.json().catch(() => ({}))) as { email?: string; at?: string; error?: string };
        if (cancelled) return;
        if (res.ok && body.email) setDoor({ state: "open", email: body.email, at: body.at ?? new Date().toISOString() });
        else setDoor({ state: "closed", status: res.status, error: body.error ?? res.statusText });
      } catch (e) {
        if (!cancelled) setDoor({ state: "closed", status: 0, error: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="mt-8 rounded-2xl border border-line bg-surface p-5 shadow-card">
      {door.state === "checking" && <p className="text-sm text-muted">Checking who is signed in…</p>}
      {door.state === "open" && (
        <>
          <p className="text-sm">
            <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">Signed in</span>{" "}
            <span className="ml-2 font-semibold">{door.email}</span>
          </p>
          <p className="mt-3 text-sm text-muted">The door works. The Page&rsquo;s queue, settings and history arrive here next.</p>
        </>
      )}
      {door.state === "closed" && (
        <>
          <p className="text-sm">
            <span className="rounded-full bg-danger-soft px-3 py-1 text-xs font-semibold text-danger">Not signed in</span>{" "}
            <span className="ml-2 text-muted">
              {door.status ? `${door.status}: ` : ""}
              {door.error}
            </span>
          </p>
          <p className="mt-3 text-sm text-muted">
            This page is meant to be reached through Cloudflare Access, which asks for a sign-in first. Reload the page to sign
            in again.
          </p>
        </>
      )}
    </section>
  );
}
