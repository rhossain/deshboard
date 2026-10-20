"use client";

import { useCallback, useEffect, useState } from "react";
import { api, PLATFORM_LABEL, type Platform, type QueueData, type SocialPost } from "./api";
import { HealthView, HistoryView, SettingsView } from "./OtherViews";
import { QueueView } from "./QueueView";

type Tab = "queue" | "history" | "settings" | "health";
const TABS: [Tab, string][] = [
  ["queue", "Queue"],
  ["history", "History"],
  ["settings", "Settings"],
  ["health", "Health"],
];

/**
 * The admin (/admin/): who is signed in (Cloudflare Access let them through), then the queue — the Facebook Page's
 * or Instagram's — and the rest. The queue reloads every minute while the page is in view.
 */
export function AdminShell() {
  const [email, setEmail] = useState<string | null>(null);
  const [door, setDoor] = useState<"checking" | "open" | "closed">("checking");
  const [tab, setTab] = useState<Tab>("queue");
  const [platform, setPlatform] = useState<Platform>("facebook");
  const [data, setData] = useState<QueueData | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const onError = useCallback((m: string) => setError(m), []);

  const reload = useCallback(async () => {
    try {
      const d = await api.queue(platform);
      // A reply for the platform shown before a switch is dropped.
      setData((prev) => (d.platform === platform || !prev ? d : prev));
      setNow(Date.parse(d.now));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [platform]);

  useEffect(() => {
    let off = false;
    fetch("/api/admin/ping", { credentials: "same-origin", cache: "no-store" })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as { email?: string };
        if (off) return;
        if (res.ok && body.email) {
          setEmail(body.email);
          setDoor("open");
        } else setDoor("closed");
      })
      .catch(() => !off && setDoor("closed"));
    return () => {
      off = true;
    };
  }, []);

  useEffect(() => {
    if (door !== "open") return;
    const first = setTimeout(reload, 0);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") reload();
    }, 60_000);
    const tick = setInterval(() => setNow((n) => n + 30_000), 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      clearInterval(tick);
    };
  }, [door, reload]);

  const onChange = useCallback((post: SocialPost) => {
    setData((d) => (d ? { ...d, posts: d.posts.some((p) => p.id === post.id) ? d.posts.map((p) => (p.id === post.id ? post : p)) : [...d.posts, post] } : d));
  }, []);

  if (door === "checking") return <p className="mt-8 text-sm text-muted">Checking who is signed in…</p>;
  if (door === "closed")
    return (
      <p className="mt-8 rounded-2xl border border-line bg-surface p-5 text-sm">
        Not signed in. This page is reached through Cloudflare Access, which asks for a sign-in first: reload to sign in again.
      </p>
    );

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <span className="text-muted">{email}</span>
        {data && (
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${data.live ? "bg-accent text-accent-ink" : "bg-gold/15 text-gold"}`}>
            {PLATFORM_LABEL[data.platform]} · {data.live ? "Live" : "Trial"}
          </span>
        )}
      </div>
      <nav className="sticky top-0 z-20 -mx-4 mt-4 flex gap-1 overflow-x-auto border-b border-line bg-[var(--background)] px-4 sm:mx-0 sm:px-0" aria-label="Admin sections">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`h-11 shrink-0 border-b-2 px-3 text-sm font-semibold transition ${tab === id ? "border-accent text-foreground" : "border-transparent text-muted hover:text-foreground"}`}
            aria-current={tab === id ? "page" : undefined}
          >
            {label}
          </button>
        ))}
      </nav>

      {error && (
        <div role="alert" className="mt-4 flex items-start gap-3 rounded-2xl border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-danger">
          <span className="flex-1">{error}</span>
          <button className="font-semibold" onClick={() => setError(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      {notice && (
        <div role="status" className="mt-4 flex items-start gap-3 rounded-2xl border border-accent/40 bg-accent-soft px-4 py-3 text-sm text-accent">
          <span className="flex-1">{notice}</span>
          <button className="font-semibold" onClick={() => setNotice(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      {tab === "queue" && (
        <div className="mt-5 inline-flex rounded-full border border-line bg-surface p-1" role="tablist" aria-label="Platform">
          {(["facebook", "instagram"] as Platform[]).map((p) => (
            <button
              key={p}
              role="tab"
              aria-selected={platform === p}
              onClick={() => {
                if (p === platform) return;
                setData(null);
                setPlatform(p);
              }}
              className={`h-8 rounded-full px-4 text-[13px] font-semibold transition ${platform === p ? "bg-accent text-accent-ink" : "text-muted hover:text-foreground"}`}
            >
              {PLATFORM_LABEL[p]}
            </button>
          ))}
        </div>
      )}

      {tab === "queue" &&
        (data && data.platform === platform ? (
          <QueueView
            data={data}
            now={now}
            onChange={onChange}
            onError={onError}
            onReload={reload}
            onPause={(paused) =>
              api
                .settings({ paused })
                .then((settings) => setData((d) => (d ? { ...d, settings } : d)))
                .catch((e) => setError(e.message))
            }
          />
        ) : (
          <p className="mt-6 text-sm text-muted">Loading the queue…</p>
        ))}
      {tab === "history" && <HistoryView onError={onError} />}
      {tab === "settings" && data && (
        <SettingsView
          key={JSON.stringify([data.settings, data.pageSlots])}
          settings={data.settings}
          slots={data.pageSlots}
          blocks={data.blocks}
          onSaved={(settings) => {
            setData((d) => (d ? { ...d, settings } : d));
            setNotice("Settings saved. The next run (within 15 minutes) uses them.");
          }}
          onError={onError}
          onBlocksChanged={reload}
        />
      )}
      {tab === "health" && <HealthView onError={onError} />}
    </>
  );
}
