import { categorize, unmappedSection } from "./categories";
import { stampFirstSeen } from "./first-seen";
import { recordHealth } from "./health";
import { extractHeadlines } from "./fetchers/html";
import { fetchText } from "./fetchers/http";
import { parseFeed, type RawItem } from "./fetchers/rss";
import { parseNewsSitemap } from "./fetchers/sitemap";
import { dedupeByLink, dhakaDate, shiftDhakaAsUtc } from "./fetchers/utils";
import { ACTIVE_SOURCES, getSource } from "./sources";
import { readStore, writeStoreSoon } from "./store";
import type { NewsItem, NewsSource, SourceResult } from "./types";

/** How long a source's result is reused before it is fetched again. */
const TTL_MS = Number(process.env.NEWS_CACHE_SECONDS ?? 600) * 1000;
/** Failed sources are retried sooner. */
const ERROR_TTL_MS = 60_000;
const CONCURRENCY = 8;

type CacheEntry = { at: number; result: SourceResult };
const CACHE_STORE = "news-cache";

// Survives hot reloads in dev and is shared by all requests in one server process. Starts from the
// copy on disk, so a restart serves the last headlines instead of fetching all sources again.
const g = globalThis as unknown as {
  __newsCache?: Map<string, CacheEntry>;
  __newsInflight?: Map<string, Promise<SourceResult>>;
  __newsRefresher?: ReturnType<typeof setInterval>;
};
const cache = (g.__newsCache ??= new Map(Object.entries(readStore<Record<string, CacheEntry>>(CACHE_STORE, {}))));
const inflight = (g.__newsInflight ??= new Map());

async function fetchRaw(source: NewsSource): Promise<{ items: RawItem[]; url: string }> {
  if (!source.url) throw new Error("No URL configured");

  switch (source.method) {
    case "rss": {
      const res = await fetchText(source.url, { accept: "application/rss+xml, application/xml, text/xml, */*" });
      return { items: parseFeed(res.text, res.url), url: res.url };
    }
    case "sitemap": {
      // Dated sitemaps (one file per day): try today, then yesterday.
      const candidates = source.url.includes("{YYYY-MM-DD}")
        ? [0, -1].map((d) => source.url!.replace("{YYYY-MM-DD}", dhakaDate(d)))
        : [source.url];
      let lastErr: unknown;
      for (const url of candidates) {
        try {
          const res = await fetchText(url, { accept: "application/xml, text/xml, */*" });
          const items = parseNewsSitemap(res.text, res.url);
          if (items.length) return { items, url: res.url };
          lastErr = new Error("Sitemap is empty");
        } catch (err) {
          lastErr = err;
        }
      }
      throw lastErr;
    }
    case "html": {
      if (!source.articlePattern) throw new Error("No articlePattern configured");
      const res = await fetchText(source.url, { accept: "text/html,application/xhtml+xml" });
      const items = extractHeadlines(res.text, res.url, source.articlePattern);
      if (!items.length) throw new Error("No headlines matched articlePattern (layout may have changed)");
      return { items, url: res.url };
    }
    default:
      throw new Error(`Source is marked "${source.method}" and is not fetched`);
  }
}

async function load(source: NewsSource): Promise<SourceResult> {
  const started = Date.now();
  const base = {
    sourceId: source.id,
    sourceName: source.name,
    method: source.method,
    fetchedAt: new Date().toISOString(),
  };
  try {
    const { items, url } = await fetchRaw(source);
    const unmapped = new Map<string, number>();
    const news: NewsItem[] = dedupeByLink(items).map(({ tags, ...it }) => {
      const category = categorize(it.link, tags);
      if (category === "other") {
        const section = unmappedSection(it.link, tags);
        unmapped.set(section, (unmapped.get(section) ?? 0) + 1);
      }
      return {
        ...it,
        publishedAt: source.dhakaTimeAsUtc ? shiftDhakaAsUtc(it.publishedAt) : it.publishedAt,
        sourceId: source.id,
        sourceName: source.name,
        lang: source.lang,
        category,
      };
    });
    stampFirstSeen(source.id, news);
    const result = {
      ...base,
      ok: true,
      count: news.length,
      fetchedUrl: url,
      durationMs: Date.now() - started,
      items: news,
    };
    recordHealth(result, unmapped);
    return result;
  } catch (err) {
    const result = {
      ...base,
      ok: false,
      count: 0,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - started,
      items: [],
    };
    recordHealth(result, new Map());
    return result;
  }
}

/** The cached result for a source, without fetching (undefined if it was never fetched). */
export function cachedResult(sourceId: string): (SourceResult & { cachedAt: number }) | undefined {
  const hit = cache.get(sourceId);
  return hit && { ...hit.result, cachedAt: hit.at };
}

/** Fetch one source, using the cache unless `force` is set. */
export async function getSourceNews(source: NewsSource, force = false): Promise<SourceResult> {
  const hit = cache.get(source.id);
  if (!force && hit && Date.now() - hit.at < (hit.result.ok ? TTL_MS : ERROR_TTL_MS)) return hit.result;

  const running = inflight.get(source.id);
  if (running) return running;

  const p = load(source)
    .then((result) => {
      cache.set(source.id, { at: Date.now(), result });
      writeStoreSoon(CACHE_STORE, () => Object.fromEntries(cache));
      return result;
    })
    .finally(() => inflight.delete(source.id));
  inflight.set(source.id, p);
  return p;
}

async function mapLimit<T, R>(list: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(list.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (i < list.length) {
      const idx = i++;
      out[idx] = await fn(list[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

export interface NewsQuery {
  lang?: "bn" | "en";
  sourceIds?: string[];
  force?: boolean;
}

/** Read `?lang=bn|en`, `?source=id1,id2` and `?refresh=1`. */
export function newsQueryFrom(url: string): NewsQuery {
  const { searchParams } = new URL(url);
  const lang = searchParams.get("lang");
  const source = searchParams.get("source");
  return {
    lang: lang === "bn" || lang === "en" ? lang : undefined,
    sourceIds: source ? source.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
    force: searchParams.get("refresh") === "1",
  };
}

function selectSources({ lang, sourceIds }: NewsQuery): NewsSource[] {
  let sources = ACTIVE_SOURCES;
  if (sourceIds?.length) {
    sources = sourceIds.map(getSource).filter((s): s is NewsSource => !!s && ACTIVE_SOURCES.includes(s));
  }
  if (lang) sources = sources.filter((s) => s.lang === lang);
  return sources;
}

/** Fetch every active source (or a subset) in parallel. */
export async function getNews(query: NewsQuery = {}) {
  const results = await mapLimit(selectSources(query), CONCURRENCY, (s) => getSourceNews(s, query.force));
  const items = results.flatMap((r) => r.items);
  const statuses = results.map((r) => {
    const { items: _omit, ...status } = r; // eslint-disable-line @typescript-eslint/no-unused-vars
    return status;
  });
  return { items, statuses, generatedAt: new Date().toISOString() };
}

/** Like `getNews`, but hands over each source's result as soon as it is ready. */
export async function eachSourceNews(query: NewsQuery, onResult: (result: SourceResult) => void): Promise<void> {
  await mapLimit(selectSources(query), CONCURRENCY, async (s) => {
    const result = await getSourceNews(s, query.force);
    onResult(result);
  });
}

/**
 * Keeps the cache warm so readers never wait for a fetch: refreshes stale sources now, then every
 * half TTL (so a source is at most 1.5 × TTL old). Started once per server from instrumentation.ts.
 */
export function startBackgroundRefresh(): void {
  if (g.__newsRefresher) return;
  const run = () => getNews().catch((err) => console.warn("[news] background refresh failed:", err));
  g.__newsRefresher = setInterval(run, Math.max(60_000, TTL_MS / 2));
  g.__newsRefresher.unref?.();
  void run();
}
