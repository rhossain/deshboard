"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CATEGORIES, type Category } from "@/lib/categories";
import { sourceProblem } from "@/lib/problems";
import { isFetched } from "@/lib/sources";
import type { Lang, NewsItem, NewsSource, NewsStreamMessage, SourceResult, SourceStatus } from "@/lib/types";
import { fullTime, timeAgo } from "./time";

type View = "sources" | "latest";
type LangFilter = "all" | Lang;
type Order = "default" | "newest";

const AUTO_REFRESH_MS = 10 * 60 * 1000;
const PER_CARD = 8;

const CATEGORY_LABEL = new Map(CATEGORIES.map((c) => [c.id, c.label]));

const METHOD_LABEL: Record<string, string> = { rss: "RSS", sitemap: "Sitemap", html: "HTML" };

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

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line py-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">BD News Desk</h1>
          <p className="mt-1 text-sm text-muted">
            Headlines from {fetchedCount} Bangladeshi news portals · RSS, news sitemaps and homepages
          </p>
        </div>
        <div className="flex items-center gap-3">
          {generatedAt && !loading && (
            <span className="text-xs text-muted" title={fullTime(generatedAt)}>
              Updated {timeAgo(generatedAt, now)}
            </span>
          )}
          <button
            onClick={() => load(true)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90 disabled:opacity-60 dark:text-black"
          >
            <RefreshIcon spinning={loading} />
            {loading ? `Fetching… ${received}/${fetchedCount}` : "Refresh"}
          </button>
        </div>
      </header>

      {/* Status bar */}
      {hasData && (
        <div className="mt-4 rounded-xl border border-line bg-surface px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Stat label="sources OK" value={`${okCount}/${fetchedCount}`} />
            <Stat label="headlines" value={allItems.length.toLocaleString()} />
            {failures.length > 0 && (
              <button
                onClick={() => setShowFailures((v) => !v)}
                className="text-danger underline-offset-2 hover:underline"
              >
                {failures.length} failed {showFailures ? "▲" : "▼"}
              </button>
            )}
          </div>
          {showFailures && failures.length > 0 && (
            <ul className="mt-3 grid gap-1 border-t border-line pt-3 text-xs sm:grid-cols-2">
              {failures.map((f) => {
                const source = sourceById.get(f.sourceId);
                const problem = source && sourceProblem(source, f);
                return (
                  <li key={f.sourceId} className="flex gap-2">
                    <span className="font-medium">{f.sourceName}</span>
                    <span className="text-muted" title={f.error}>
                      — {problem?.message ?? f.error}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* Controls */}
      <div className="sticky top-0 z-10 -mx-4 mt-4 flex flex-wrap items-center gap-3 bg-background/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: "sources", label: "By source" },
            { value: "latest", label: "Latest" },
          ]}
        />
        {view === "sources" && (
          <Segmented
            value={order}
            onChange={setOrder}
            options={[
              { value: "default", label: "Default order" },
              { value: "newest", label: "Newest first" },
            ]}
          />
        )}
        <Segmented
          value={lang}
          onChange={setLang}
          options={[
            { value: "all", label: "All" },
            { value: "bn", label: "বাংলা" },
            { value: "en", label: "English" },
          ]}
        />
        <select
          value={onlySource}
          onChange={(e) => setOnlySource(e.target.value)}
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm"
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
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search headlines… / শিরোনাম খুঁজুন"
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent sm:max-w-xs"
        />
        {hasData && (
          <div className="flex w-full flex-wrap gap-1.5" role="group" aria-label="Filter by category">
            <CategoryChip active={!category} onClick={() => setCategory("")} label="All" count={matching.length} />
            {CATEGORIES.map((c) => (
              <CategoryChip
                key={c.id}
                active={category === c.id}
                onClick={() => setCategory(category === c.id ? "" : c.id)}
                label={c.label}
                title={c.bn}
                count={categoryCounts.get(c.id) ?? 0}
              />
            ))}
          </div>
        )}
      </div>

      {error && (
        <p className="mt-6 rounded-lg border border-danger/40 bg-surface p-4 text-sm text-danger">
          Could not load news: {error}
        </p>
      )}

      {!hasData && loading && <SkeletonGrid />}

      {hasData && view === "latest" && <LatestList items={filtered} sourceById={sourceById} now={now} />}

      {hasData && view === "sources" && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleSources.map((s) => (
            <SourceCard
              key={s.id}
              source={s}
              status={statusById.get(s.id)}
              items={itemsBySource.get(s.id) ?? []}
              filtering={!!query.trim() || !!category}
              now={now}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** ISO dates sort as strings; items without a date go last. */
function byNewest(a: NewsItem, b: NewsItem): number {
  return (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "");
}

function LatestList({
  items,
  sourceById,
  now,
}: {
  items: NewsItem[];
  sourceById: Map<string, NewsSource>;
  now: number;
}) {
  const dated = items
    .filter((i) => i.publishedAt)
    .sort(byNewest)
    .slice(0, 300);
  const undated = items.length - items.filter((i) => i.publishedAt).length;

  return (
    <section className="mt-4">
      {undated > 0 && (
        <p className="mb-3 text-xs text-muted">
          Showing dated headlines only. {undated.toLocaleString()} headlines from homepage-scraped sources have no
          timestamp; see them in “By source”.
        </p>
      )}
      <ol className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {dated.map((it) => (
          <li key={it.link} className="flex gap-4 px-4 py-3 hover:bg-accent-soft/50">
            <time
              dateTime={it.publishedAt}
              title={fullTime(it.publishedAt)}
              className="w-24 shrink-0 pt-0.5 text-xs tabular-nums text-muted"
            >
              {timeAgo(it.publishedAt, now)}
            </time>
            <div className="min-w-0">
              <a
                href={it.link}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium leading-snug hover:text-accent hover:underline"
              >
                {it.title}
              </a>
              <div className="mt-0.5 text-xs text-muted">
                {sourceById.get(it.sourceId)?.name ?? it.sourceName}
                {it.category !== "other" && <> · {CATEGORY_LABEL.get(it.category)}</>}
              </div>
            </div>
          </li>
        ))}
        {dated.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted">No headlines match.</li>}
      </ol>
    </section>
  );
}

function SourceCard({
  source,
  status,
  items,
  filtering,
  now,
}: {
  source: NewsSource;
  status?: SourceStatus;
  items: NewsItem[];
  filtering: boolean;
  now: number;
}) {
  const [expanded, setExpanded] = useState(false);
  if (filtering && items.length === 0) return null;
  const shown = expanded ? items : items.slice(0, PER_CARD);
  const problem = sourceProblem(source, status);
  const pending = !problem && !status;

  return (
    <article className={`flex flex-col rounded-xl border border-line bg-surface ${problem ? "opacity-80" : ""}`}>
      <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <SourceLogo source={source} />
          <p className="mt-1 text-xs text-muted">
            {source.kind} · {source.lang === "bn" ? "বাংলা" : "English"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {METHOD_LABEL[source.method] && (
            <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
              {METHOD_LABEL[source.method]}
            </span>
          )}
          <span
            className={`h-2 w-2 rounded-full ${problem ? "bg-danger" : pending ? "bg-line" : "bg-accent"}`}
            title={problem ? problem.message : pending ? "Loading" : `${status?.count} items`}
          />
        </div>
      </header>

      {problem ? (
        <div className="flex-1 px-4 py-4 text-sm">
          <p className="text-danger">{problem.message}</p>
          {problem.detail && <p className="mt-1 text-xs text-muted">Details: {problem.detail}</p>}
          <a
            href={source.homepage}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-xs font-medium text-accent hover:underline"
          >
            Visit {new URL(source.homepage).host.replace(/^www\./, "")} →
          </a>
        </div>
      ) : pending ? (
        <ul className="flex-1 space-y-3 px-4 py-4" aria-busy aria-label="Loading headlines">
          {Array.from({ length: 4 }, (_, i) => (
            <li key={i} className="h-4 animate-pulse rounded bg-line" style={{ width: `${90 - i * 12}%` }} />
          ))}
        </ul>
      ) : (
        <ul className="flex-1 divide-y divide-line">
          {shown.map((it) => (
            <li key={it.link} className="px-4 py-2.5">
              <a
                href={it.link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[15px] leading-snug hover:text-accent hover:underline"
              >
                {it.title}
              </a>
              {it.publishedAt && (
                <time
                  dateTime={it.publishedAt}
                  title={fullTime(it.publishedAt)}
                  className="mt-0.5 block text-xs text-muted"
                >
                  {timeAgo(it.publishedAt, now)}
                </time>
              )}
            </li>
          ))}
          {status?.ok && items.length === 0 && <li className="px-4 py-4 text-sm text-muted">No headlines.</li>}
        </ul>
      )}

      {items.length > PER_CARD && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="border-t border-line px-4 py-2 text-left text-xs font-medium text-accent hover:underline"
        >
          {expanded ? "Show less" : `Show all ${items.length}`}
        </button>
      )}
    </article>
  );
}

/**
 * True for a light logo on a transparent background (made for a dark header),
 * which would vanish on our white logo plate. Logos are proxied through our
 * own origin, so the canvas is not tainted.
 */
function isLightOnTransparent(img: HTMLImageElement): boolean {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = Math.max(1, Math.round((64 * img.naturalHeight) / img.naturalWidth));
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let opaque = 0;
    let luminance = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 128) continue;
      opaque++;
      luminance += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
    }
    const transparentShare = 1 - opaque / (px.length / 4);
    return opaque > 0 && transparentShare > 0.1 && luminance / opaque > 200;
  } catch {
    return false;
  }
}

/**
 * The source's logo from /api/logo, linking to its homepage. Wide images are
 * shown alone; square ones (favicons) sit next to the name; if there is no
 * image the name is shown as text.
 */
function SourceLogo({ source }: { source: NewsSource }) {
  const [kind, setKind] = useState<"loading" | "logo" | "icon" | "none">("loading");
  const [light, setLight] = useState(false);

  // Logos are drawn on a fixed plate so they read the same in light and dark mode.
  const plate = light ? "bg-neutral-800" : "bg-white";

  return (
    <a
      href={source.homepage}
      target="_blank"
      rel="noopener noreferrer"
      title={source.name}
      className="flex h-9 min-w-0 items-center gap-2 font-semibold hover:text-accent"
    >
      {kind !== "none" && (
        // eslint-disable-next-line @next/next/no-img-element -- proxied third-party logos of unknown size
        <img
          src={`/api/logo/${source.id}`}
          alt={kind === "logo" ? source.name : ""}
          onLoad={(e) => {
            const img = e.currentTarget;
            const { naturalWidth: w, naturalHeight: h } = img;
            setKind(w && h && w / h >= 1.8 ? "logo" : "icon");
            setLight(isLightOnTransparent(img));
          }}
          onError={() => setKind("none")}
          className={
            kind === "logo"
              ? `h-9 w-auto max-w-[200px] rounded-md object-contain object-left px-1.5 py-1 ${plate}`
              : kind === "icon"
                ? `h-6 w-6 shrink-0 rounded object-contain ${plate}`
                : "absolute h-px w-px opacity-0"
          }
        />
      )}
      {kind !== "logo" && <span className="truncate">{source.name}</span>}
    </a>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-surface p-0.5" role="group">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`rounded-md px-3 py-1.5 text-sm transition ${
            value === o.value ? "bg-accent text-white dark:text-black" : "text-muted hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function CategoryChip({
  active,
  onClick,
  label,
  title,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  title?: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      title={title}
      disabled={!active && count === 0}
      className={`rounded-full border px-3 py-1 text-xs transition disabled:opacity-40 ${
        active
          ? "border-accent bg-accent text-white dark:text-black"
          : "border-line bg-surface text-muted hover:border-accent hover:text-foreground"
      }`}
    >
      {label} <span className="tabular-nums opacity-70">{count.toLocaleString()}</span>
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="font-semibold tabular-nums">{value}</span> <span className="text-muted">{label}</span>
    </span>
  );
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={`h-4 w-4 ${spinning ? "animate-spin" : ""}`}
      aria-hidden
    >
      <path d="M16.5 10a6.5 6.5 0 1 1-1.9-4.6M16.5 3.5v3.9h-3.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SkeletonGrid() {
  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="h-72 animate-pulse rounded-xl border border-line bg-surface" />
      ))}
      <p className="col-span-full text-center text-sm text-muted">
        Fetching headlines from all sources… the first load can take 10–20 seconds.
      </p>
    </div>
  );
}
