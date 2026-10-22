"use client";

import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { BartaboardLogo } from "../BartaboardLogo";
import { ArrowUpRightIcon, ClockIcon, ListIcon, SlidersIcon } from "../ui";
import { api, PLATFORM_LABEL, type Platform, type QueueData, type SocialPost } from "./api";
import { HealthView, HistoryView, SettingsView } from "./OtherViews";
import { QueueView } from "./QueueView";

type Tab = "queue" | "history" | "settings" | "health";

const PulseIcon = ({ className = "h-5 w-5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <path d="M3 12h4l2.5-6 4 12 2.5-6h5" />
  </svg>
);

const TABS: { id: Tab; label: string; icon: (p: { className?: string }) => ReactNode; blurb: string }[] = [
  { id: "queue", label: "Queue", icon: ListIcon, blurb: "Today's and tomorrow's posts: review, edit, add." },
  { id: "history", label: "History", icon: ClockIcon, blurb: "What went out, and what didn't." },
  { id: "settings", label: "Settings", icon: SlidersIcon, blurb: "Policies, times and what's left out." },
  { id: "health", label: "Health", icon: PulseIcon, blurb: "The deploy's runs, Facebook, Instagram, Telegram." },
];

/** Posts that want a look: drafts still to go out, and failures. */
function attention(data: QueueData | null, now: number): { drafts: number; failed: number } {
  if (!data) return { drafts: 0, failed: 0 };
  const open = data.posts.filter((p) => Date.parse(p.scheduledAt) > now - 45 * 60_000);
  return { drafts: open.filter((p) => p.status === "draft").length, failed: open.filter((p) => p.status === "failed").length };
}

/**
 * The admin (/admin/): who is signed in (Cloudflare Access let them through), then the queue — the Facebook Page's
 * or Instagram's — and the rest. A sidebar on a desktop, a bar along the bottom on a phone. The queue reloads every
 * minute while the page is in view.
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

  // The tab in the address (#history), so a reload and the phone's back button keep their place.
  useEffect(() => {
    const fromHash = () => {
      const h = window.location.hash.replace("#", "") as Tab;
      if (TABS.some((t) => t.id === h)) setTab(h);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);
  const go = (t: Tab) => {
    setTab(t);
    if (window.location.hash !== `#${t}`) window.history.pushState(null, "", `#${t}`);
    window.scrollTo({ top: 0 });
  };

  const onChange = useCallback((post: SocialPost) => {
    setData((d) => (d ? { ...d, posts: d.posts.some((p) => p.id === post.id) ? d.posts.map((p) => (p.id === post.id ? post : p)) : [...d.posts, post] } : d));
  }, []);

  const onPause = (paused: boolean) =>
    api
      .settings({ paused })
      .then((settings) => setData((d) => (d ? { ...d, settings } : d)))
      .catch((e) => setError(e.message));

  const wants = attention(data, now);
  const current = TABS.find((t) => t.id === tab)!;

  const badge = data && (
    <span className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${data.live ? "bg-accent text-accent-ink" : "bg-gold/15 text-gold"}`}>
      {PLATFORM_LABEL[data.platform]} · {data.live ? "Live" : "Trial"}
    </span>
  );

  const platformSwitch = (
    <div className="inline-flex rounded-full border border-line bg-surface-2 p-1" role="tablist" aria-label="Platform">
      {(["facebook", "instagram"] as Platform[]).map((p) => (
        <button
          key={p}
          type="button"
          role="tab"
          aria-selected={platform === p}
          onClick={() => {
            if (p === platform) return;
            setData(null);
            setPlatform(p);
          }}
          className={`h-8 rounded-full px-4 text-[13px] font-semibold transition ${platform === p ? "bg-accent text-accent-ink shadow-sm" : "text-muted hover:text-foreground"}`}
        >
          {PLATFORM_LABEL[p]}
        </button>
      ))}
    </div>
  );

  const navItem = (t: (typeof TABS)[number], layout: "side" | "bottom") => {
    const on = tab === t.id;
    const count = t.id === "queue" ? wants.drafts + wants.failed : 0;
    const Icon = t.icon;
    return (
      <button
        key={t.id}
        type="button"
        onClick={() => go(t.id)}
        aria-current={on ? "page" : undefined}
        className={
          layout === "side"
            ? `flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${on ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2 hover:text-foreground"}`
            : `relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${on ? "text-accent" : "text-muted"}`
        }
      >
        <span className="relative">
          <Icon className="h-5 w-5" />
          {count > 0 && layout === "bottom" && (
            <span className={`absolute -right-2.5 -top-1.5 min-w-4 rounded-full px-1 text-center text-[10px] leading-4 ${wants.failed ? "bg-danger text-white" : "bg-gold text-white"}`}>
              {count}
            </span>
          )}
        </span>
        <span>{t.label}</span>
        {count > 0 && layout === "side" && (
          <span className={`ml-auto rounded-full px-2 text-[11px] leading-5 ${wants.failed ? "bg-danger text-white" : "bg-gold text-white"}`} title={`${wants.drafts} to review, ${wants.failed} failed`}>
            {count}
          </span>
        )}
      </button>
    );
  };

  let body: ReactNode;
  if (door === "checking") body = <p className="text-sm text-muted">Checking who is signed in…</p>;
  else if (door === "closed")
    body = (
      <p className="rounded-2xl border border-line bg-surface p-5 text-sm">
        Not signed in. This page is reached through Cloudflare Access, which asks for a sign-in first: reload to sign in again.
      </p>
    );
  else
    body = (
      <>
        {error && (
          <div role="alert" className="mb-4 flex items-start gap-3 rounded-2xl border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-danger">
            <span className="flex-1">{error}</span>
            <button type="button" className="font-semibold" onClick={() => setError(null)} aria-label="Dismiss">
              ×
            </button>
          </div>
        )}
        {notice && (
          <div role="status" className="mb-4 flex items-start gap-3 rounded-2xl border border-accent/40 bg-accent-soft px-4 py-3 text-sm text-accent">
            <span className="flex-1">{notice}</span>
            <button type="button" className="font-semibold" onClick={() => setNotice(null)} aria-label="Dismiss">
              ×
            </button>
          </div>
        )}

        {tab === "queue" &&
          (data && data.platform === platform ? (
            <QueueView data={data} now={now} onChange={onChange} onError={onError} onReload={reload} onPause={onPause} />
          ) : (
            <p className="text-sm text-muted">Loading the queue…</p>
          ))}
        {tab === "history" && <HistoryView onError={onError} />}
        {tab === "settings" &&
          (data ? (
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
          ) : (
            <p className="text-sm text-muted">Loading…</p>
          ))}
        {tab === "health" && <HealthView onError={onError} />}
      </>
    );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      {/* The sidebar, on a desktop. */}
      <aside className="hidden border-r border-line bg-surface lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:px-4 lg:py-6">
        {/* The compact lockup: the one with the tagline is wider than the sidebar. */}
        <Link href="/" className="flex px-2 text-[24px]" aria-label="Bartaboard home">
          <BartaboardLogo tagline={false} />
        </Link>
        <p className="mt-3 px-2 font-display text-2xl font-semibold tracking-tight">Admin</p>
        {email && <p className="mt-1 truncate px-2 text-xs text-muted" title={email}>{email}</p>}
        <div className="mt-2 px-2">{badge}</div>
        <nav className="mt-6 space-y-1" aria-label="Admin sections">
          {TABS.map((t) => navItem(t, "side"))}
        </nav>
        {door === "open" && data && (
          <div className="mt-6 space-y-2 border-t border-line pt-5">
            <p className="px-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Quick</p>
            <button
              type="button"
              onClick={() => onPause(!data.settings.paused)}
              className={`flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-semibold ${data.settings.paused ? "bg-danger-soft text-danger" : "text-muted hover:bg-surface-2 hover:text-foreground"}`}
            >
              {data.settings.paused ? "Resume posting" : "Pause posting"}
            </button>
            <button type="button" onClick={reload} className="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-semibold text-muted hover:bg-surface-2 hover:text-foreground">
              Refresh
            </button>
          </div>
        )}
        <a href="/bn/" target="_blank" rel="noreferrer" className="mt-auto flex items-center gap-1.5 px-2 text-xs font-semibold text-muted hover:text-foreground">
          Open the board <ArrowUpRightIcon className="h-3.5 w-3.5" />
        </a>
      </aside>

      <div className="min-w-0">
        {/* The top bar, on a phone or tablet. */}
        <header className="sticky top-0 z-20 border-b border-line bg-[var(--background)]/95 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 pb-2 pt-[max(env(safe-area-inset-top),0.5rem)] sm:px-6">
            <Link href="/" className="flex shrink-0 text-[22px]" aria-label="Bartaboard home">
              <BartaboardLogo tagline={false} />
            </Link>
            <span className="font-display text-lg font-semibold">Admin</span>
            <span className="flex-1" />
            {badge}
          </div>
        </header>

        <main className="mx-auto max-w-4xl px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 lg:pb-16 lg:pt-8">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{current.label}</h1>
              <p className="mt-0.5 text-sm text-muted">{current.blurb}</p>
            </div>
            {door === "open" && tab === "queue" && platformSwitch}
            {door === "open" && tab === "settings" && <span className="text-xs text-muted lg:hidden">{email}</span>}
          </div>
          {body}
        </main>

        {door === "open" && (
          <nav
            data-bottom-nav
            aria-label="Admin sections"
            className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface/95 pb-safe backdrop-blur lg:hidden"
          >
            {TABS.map((t) => navItem(t, "bottom"))}
          </nav>
        )}
      </div>
    </div>
  );
}
