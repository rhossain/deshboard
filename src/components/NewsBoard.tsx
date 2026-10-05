"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CATEGORIES, type Category } from "@/lib/categories";
import { sourceProblem } from "@/lib/problems";
import { isFetched } from "@/lib/sources";
import type { Lang, NewsItem, NewsSource, NewsStreamMessage, SourceResult } from "@/lib/types";
import { byNewest, LatestList } from "./LatestList";
import { SourceCard } from "./SourceCard";
import { fullTime, timeAgo } from "./time";
import {
  ChevronIcon,
  Chip,
  ClockIcon,
  CloseIcon,
  GridIcon,
  RefreshIcon,
  SearchIcon,
  Segmented,
  SlidersIcon,
} from "./ui";

type View = "sources" | "latest";
type LangFilter = "all" | Lang;
type Order = "default" | "newest";

const AUTO_REFRESH_MS = 10 * 60 * 1000;

const VIEW_OPTIONS: { value: View; label: string }[] = [
  { value: "sources", label: "By source" },
  { value: "latest", label: "Latest" },
];
const ORDER_OPTIONS: { value: Order; label: string }[] = [
  { value: "default", label: "Editor's order" },
  { value: "newest", label: "Newest first" },
];
const LANG_OPTIONS: { value: LangFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "bn", label: "বাংলা" },
  { value: "en", label: "English" },
];

const dhakaDate = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Dhaka",
  weekday: "long",
  day: "numeric",
  month: "long",
});

/** Read /api/news/stream, calling `onSource` for each source as it arrives. Resolves with `generatedAt`. */
async function streamNews(
  force: boolean,
  signal: AbortSignal,
  onSource: (result: SourceResult) => void,
): Promise<string> {
  const res = await fetch(`/api/news/stream${force ? "?refresh=1" : ""}`, { cache: "no-store", signal });
  if (!res.ok || !res.body) throw new Error(`Server returned ${res.status}`);

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let generatedAt = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      const msg = JSON.parse(line) as NewsStreamMessage;
      if (msg.type === "source") onSource(msg.result);
      else generatedAt = msg.generatedAt;
    }
  }
  if (!generatedAt) throw new Error("Connection closed before all sources were fetched");
  return generatedAt;
}

/** `sources` is every listed portal in display order; only the fetchable ones are requested. */
export function NewsBoard({ sources }: { sources: NewsSource[] }) {
  // Latest result per source; on refresh each one is replaced as its new result arrives.
  const [results, setResults] = useState<Map<string, SourceResult>>(() => new Map());
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [received, setReceived] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("sources");
  const [order, setOrder] = useState<Order>("default");
  const [lang, setLang] = useState<LangFilter>("all");
  const [query, setQuery] = useState("");
  const [onlySource, setOnlySource] = useState<string>("");
  const [category, setCategory] = useState<Category | "">("");
  const [showFailures, setShowFailures] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const controllerRef = useRef<AbortController | null>(null);

  /** Start streaming. State is only set from callbacks, so this is safe to call from an effect. */
  const start = useCallback((force: boolean) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    streamNews(force, controller.signal, (result) => {
      setResults((prev) => new Map(prev).set(result.sourceId, result));
      setReceived((n) => n + 1);
    }).then(
      (at) => {
        setGeneratedAt(at);
        setError(null);
        setNow(Date.now());
        setLoading(false);
      },
      (err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      },
    );
  }, []);

  const load = useCallback(
    (force = false) => {
      setLoading(true);
      setReceived(0);
      start(force);
    },
    [start],
  );

  useEffect(() => {
    start(false);
    const refresh = setInterval(() => load(), AUTO_REFRESH_MS);
    const tick = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      controllerRef.current?.abort();
      clearInterval(refresh);
      clearInterval(tick);
    };
  }, [start, load]);

  const allItems = useMemo(() => [...results.values()].flatMap((r) => r.items), [results]);
  const statuses = useMemo(() => [...results.values()], [results]);
  const hasData = results.size > 0;

  const sourceById = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources]);
  const statusById = results;

  // Everything except the category filter, so the chips can show counts.
  const matching = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allItems.filter(
      (it) =>
        (lang === "all" || it.lang === lang) &&
        (!onlySource || it.sourceId === onlySource) &&
        (!q || it.title.toLowerCase().includes(q)),
    );
  }, [allItems, lang, onlySource, query]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<Category, number>();
    for (const it of matching) counts.set(it.category, (counts.get(it.category) ?? 0) + 1);
    return counts;
  }, [matching]);

  const filtered = useMemo(
    () => (category ? matching.filter((it) => it.category === category) : matching),
    [matching, category],
  );

  // Each source's headlines newest first; undated ones keep their page order at the end.
  const itemsBySource = useMemo(() => {
    const map = new Map<string, NewsItem[]>();
    for (const it of filtered) {
      const list = map.get(it.sourceId);
      if (list) list.push(it);
      else map.set(it.sourceId, [it]);
    }
    for (const list of map.values()) list.sort(byNewest);
    return map;
  }, [filtered]);

  const fetchedCount = useMemo(() => sources.filter(isFetched).length, [sources]);

  // Default: the configured source order. "Newest": the source with the most recent headline first.
  // Either way, sources that are not fetched or failed go last.
  const visibleSources = useMemo(() => {
    const latest = (id: string) => itemsBySource.get(id)?.[0]?.publishedAt ?? "";
    const broken = (s: NewsSource) => (sourceProblem(s, statusById.get(s.id)) ? 1 : 0);
    return sources
      .filter((s) => (lang === "all" || s.lang === lang) && (!onlySource || s.id === onlySource))
      .sort((a, b) => broken(a) - broken(b) || (order === "newest" ? latest(b.id).localeCompare(latest(a.id)) : 0));
  }, [sources, lang, onlySource, itemsBySource, statusById, order]);

  const okCount = statuses.filter((s) => s.ok).length;
  const failures = statuses.filter((s) => !s.ok);
  const filtering = !!query.trim() || !!category;

  // Filters that live in the sheet on phones; shown as removable pills so they are never hidden state.
  const activeFilters = [
    lang !== "all" && { key: "lang", label: lang === "bn" ? "বাংলা" : "English", clear: () => setLang("all") },
    onlySource && {
      key: "source",
      label: sourceById.get(onlySource)?.name ?? onlySource,
      clear: () => setOnlySource(""),
    },
    view === "sources" &&
      order !== "default" && { key: "order", label: "Newest first", clear: () => setOrder("default") },
  ].filter((f): f is { key: string; label: string; clear: () => void } => !!f);

  const resetFilters = () => {
    setLang("all");
    setOnlySource("");
    setOrder("default");
  };

  const changeView = (v: View) => {
    setView(v);
    window.scrollTo({ top: 0 });
  };

  const sourceSelect = (
    <select
      value={onlySource}
      onChange={(e) => setOnlySource(e.target.value)}
      className="h-11 w-full appearance-none rounded-xl border border-line bg-surface px-3.5 pr-9 text-sm font-medium outline-none focus:border-accent md:h-10 md:w-48"
      aria-label="Filter by source"
    >
      <option value="">All sources</option>
      {sources
        .filter((s) => lang === "all" || s.lang === lang)
        .map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
            {isFetched(s) ? "" : " (unavailable)"}
          </option>
        ))}
    </select>
  );

  return (
    <div className="min-h-dvh pb-28 md:pb-16">
      {/* Fetch progress */}
      <div className="fixed inset-x-0 top-0 z-40 h-0.5" aria-hidden>
        <div
          className={`h-full bg-accent transition-all duration-500 ${loading ? "opacity-100" : "opacity-0"}`}
          style={{ width: `${loading ? Math.max(4, (received / fetchedCount) * 100) : 100}%` }}
        />
      </div>

      {/* Masthead */}
      <header className="mx-auto max-w-7xl px-4 pt-[max(env(safe-area-inset-top),1.25rem)] sm:px-6 sm:pt-8">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold" suppressHydrationWarning>
              {dhakaDate.format(now)}
            </p>
            <h1 className="mt-1 font-display text-[32px] font-semibold leading-none tracking-tight sm:text-5xl">
              BD News Desk
            </h1>
          </div>
          <button
            type="button"
            onClick={() => load(true)}
            disabled={loading}
            aria-label={loading ? "Fetching headlines" : "Refresh headlines"}
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-foreground px-3.5 text-sm font-semibold text-background shadow-card transition active:scale-95 disabled:opacity-70 sm:px-5"
          >
            <RefreshIcon spinning={loading} className="h-[18px] w-[18px]" />
            <span className="hidden sm:inline">{loading ? "Fetching…" : "Refresh"}</span>
          </button>
        </div>

        {/* Status */}
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              {loading && <span className="absolute inset-0 animate-ping rounded-full bg-accent opacity-60" />}
              <span className="relative h-2 w-2 rounded-full bg-accent" />
            </span>
            {loading ? (
              <span className="tabular-nums">
                Fetching {received} of {fetchedCount} sources
              </span>
            ) : generatedAt ? (
              <span title={fullTime(generatedAt)}>Updated {timeAgo(generatedAt, now)}</span>
            ) : (
              <span>Live</span>
            )}
          </span>
          {hasData && (
            <>
              <span className="whitespace-nowrap">
                <b className="font-semibold tabular-nums text-foreground">{allItems.length.toLocaleString()}</b>{" "}
                headlines <span aria-hidden>·</span>{" "}
                <b className="font-semibold tabular-nums text-foreground">
                  {okCount}/{fetchedCount}
                </b>{" "}
                sources
              </span>
              {failures.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowFailures((v) => !v)}
                  aria-expanded={showFailures}
                  className="inline-flex items-center gap-0.5 rounded-full bg-danger-soft px-2.5 py-0.5 text-xs font-semibold text-danger"
                >
                  {failures.length} failed
                  <ChevronIcon className={`h-3.5 w-3.5 transition ${showFailures ? "rotate-180" : ""}`} />
                </button>
              )}
            </>
          )}
        </div>

        {showFailures && failures.length > 0 && (
          <ul className="mt-3 grid gap-2 rounded-2xl border border-line bg-surface p-4 text-xs shadow-card sm:grid-cols-2">
            {failures.map((f) => {
              const source = sourceById.get(f.sourceId);
              const problem = source && sourceProblem(source, f);
              return (
                <li key={f.sourceId} className="leading-relaxed">
                  <span className="font-semibold">{f.sourceName}</span>
                  <span className="text-muted" title={f.error}>
                    {" "}
                    — {problem?.message ?? f.error}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </header>

      {/* Toolbar */}
      <div className="sticky top-0 z-30 mt-4 border-b border-line bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 pt-3 sm:px-6">
          <label className="relative min-w-0 flex-1 md:max-w-sm">
            <span className="sr-only">Search headlines</span>
            <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search headlines / শিরোনাম খুঁজুন"
              enterKeyHint="search"
              className="h-11 w-full rounded-xl border border-line bg-surface pl-10 pr-10 text-[16px] outline-none transition placeholder:text-muted/80 focus:border-accent focus:ring-4 focus:ring-accent/10 md:h-10 md:text-sm [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted hover:text-foreground"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            )}
          </label>

          {/* Inline controls on tablets and desktops; phones use the bottom bar and filter sheet. */}
          <div className="hidden flex-wrap items-center gap-2 md:flex">
            <Segmented label="View" value={view} onChange={setView} options={VIEW_OPTIONS} />
            {view === "sources" && <Segmented label="Order" value={order} onChange={setOrder} options={ORDER_OPTIONS} />}
            <Segmented label="Language" value={lang} onChange={setLang} options={LANG_OPTIONS} />
            <div className="relative">
              {sourceSelect}
              <ChevronIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            </div>
          </div>
        </div>

        {hasData ? (
          <div className="mx-auto max-w-7xl">
            <div
              className="no-scrollbar fade-x flex snap-x gap-2 overflow-x-auto scroll-px-4 px-4 py-3 sm:px-6 lg:flex-wrap"
              role="group"
              aria-label="Filter by category"
            >
              <Chip active={!category} onClick={() => setCategory("")} label="All" count={matching.length} />
              {CATEGORIES.map((c) => (
                <Chip
                  key={c.id}
                  active={category === c.id}
                  onClick={() => setCategory(category === c.id ? "" : c.id)}
                  label={c.label}
                  title={c.bn}
                  count={categoryCounts.get(c.id) ?? 0}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="h-3" />
        )}
      </div>

      <main className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 sm:pt-6">
        {activeFilters.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2 md:hidden">
            {activeFilters.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={f.clear}
                className="inline-flex h-8 items-center gap-1 rounded-full bg-accent-soft pl-3 pr-2 text-xs font-semibold text-accent"
              >
                {f.label}
                <CloseIcon className="h-3.5 w-3.5" />
                <span className="sr-only">Remove filter</span>
              </button>
            ))}
          </div>
        )}

        {error && (
          <p className="mb-4 rounded-2xl border border-danger/30 bg-danger-soft p-4 text-sm text-danger">
            Could not load news: {error}
          </p>
        )}

        {!hasData && loading && <SkeletonGrid />}

        {hasData && filtering && filtered.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line px-6 py-14 text-center">
            <p className="font-display text-xl">Nothing found</p>
            <p className="mt-1 text-sm text-muted">Try another word or category.</p>
          </div>
        )}

        {hasData && view === "latest" && <LatestList items={filtered} sourceById={sourceById} now={now} />}

        {hasData && view === "sources" && (
          <div className="grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
            {visibleSources.map((s) => (
              <SourceCard
                key={s.id}
                source={s}
                status={statusById.get(s.id)}
                items={itemsBySource.get(s.id) ?? []}
                filtering={filtering}
                now={now}
              />
            ))}
          </div>
        )}
      </main>

      {/* Bottom bar (phones) */}
      <nav
        className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/90 backdrop-blur-xl backdrop-saturate-150 md:hidden"
        aria-label="View"
      >
        <div className="mx-auto grid h-16 max-w-md grid-cols-3">
          <NavButton active={view === "sources"} onClick={() => changeView("sources")} label="Sources">
            <GridIcon />
          </NavButton>
          <NavButton active={view === "latest"} onClick={() => changeView("latest")} label="Latest">
            <ClockIcon />
          </NavButton>
          <NavButton active={false} onClick={() => setFiltersOpen(true)} label="Filters" badge={activeFilters.length}>
            <SlidersIcon />
          </NavButton>
        </div>
      </nav>

      <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters">
        <div className="space-y-6">
          {view === "sources" && (
            <Field label="Order sources">
              <Segmented label="Order" value={order} onChange={setOrder} options={ORDER_OPTIONS} full />
            </Field>
          )}
          <Field label="Language">
            <Segmented label="Language" value={lang} onChange={setLang} options={LANG_OPTIONS} full />
          </Field>
          <Field label="Source">
            <div className="relative">
              {sourceSelect}
              <ChevronIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            </div>
          </Field>
        </div>
        <div className="mt-8 flex gap-3">
          <button
            type="button"
            onClick={resetFilters}
            disabled={activeFilters.length === 0}
            className="h-12 flex-1 rounded-xl border border-line text-sm font-semibold transition active:scale-[0.98] disabled:opacity-40"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={() => setFiltersOpen(false)}
            className="h-12 flex-[2] rounded-xl bg-foreground text-sm font-semibold text-background transition active:scale-[0.98]"
          >
            Show {filtered.length.toLocaleString()} headlines
          </button>
        </div>
      </Sheet>
    </div>
  );
}

function NavButton({
  active,
  onClick,
  label,
  badge = 0,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  badge?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`relative flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition active:scale-95 ${
        active ? "text-accent" : "text-muted"
      }`}
    >
      <span className="relative">
        {children}
        {badge > 0 && (
          <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] text-accent-ink">
            {badge}
          </span>
        )}
      </span>
      {label}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</p>
      {children}
    </div>
  );
}

/** A modal bottom sheet built on <dialog>, so focus trapping and Escape come from the browser. */
function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="sheet"
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      aria-label={title}
    >
      <div className="pb-safe rounded-t-3xl border border-line bg-surface shadow-2xl sm:rounded-3xl">
        <div className="px-5 pb-6 pt-3">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line sm:hidden" aria-hidden />
          <div className="mb-5 flex items-center justify-between">
            <h2 className="font-display text-2xl font-semibold">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-muted hover:text-foreground"
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>
          {children}
        </div>
      </div>
    </dialog>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3" aria-busy>
      <p className="col-span-full text-center text-sm text-muted">
        Gathering headlines from every source… the first load can take 10–20 seconds.
      </p>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="rounded-2xl border border-line bg-surface p-4 shadow-card">
          <div className="skeleton h-8 w-32 rounded-lg" />
          <div className="mt-5 space-y-4">
            {Array.from({ length: 5 }, (_, j) => (
              <div key={j} className="skeleton h-3.5 rounded-full" style={{ width: `${95 - j * 9}%` }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
