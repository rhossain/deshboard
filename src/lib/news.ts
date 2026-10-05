import { categorize } from "./categories";
import { extractHeadlines } from "./fetchers/html";
import { fetchText } from "./fetchers/http";
import { parseFeed, type RawItem } from "./fetchers/rss";
import { parseNewsSitemap } from "./fetchers/sitemap";
import { dedupeByLink, dhakaDate } from "./fetchers/utils";
import { ACTIVE_SOURCES, getSource } from "./sources";
import type { NewsItem, NewsSource, SourceResult } from "./types";

/** How long a source's result is reused before it is fetched again. */
const TTL_MS = Number(process.env.NEWS_CACHE_SECONDS ?? 600) * 1000;
/** Failed sources are retried sooner. */
const ERROR_TTL_MS = 60_000;
const CONCURRENCY = 8;

// Survives hot reloads in dev and is shared by all requests in one server process.
const g = globalThis as unknown as {
  __newsCache?: Map<string, { at: number; result: SourceResult }>;
  __newsInflight?: Map<string, Promise<SourceResult>>;
};
const cache = (g.__newsCache ??= new Map());
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
    const news: NewsItem[] = dedupeByLink(items).map(({ tags, ...it }) => ({
      ...it,
      sourceId: source.id,
      sourceName: source.name,
      lang: source.lang,
      category: categorize(it.link, tags),
    }));
    return { ...base, ok: true, count: news.length, fetchedUrl: url, durationMs: Date.now() - started, items: news };
  } catch (err) {
    return {
      ...base,
      ok: false,
      count: 0,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - started,
      items: [],
    };
  }
}

/** Fetch one source, using the in-memory cache unless `force` is set. */
export async function getSourceNews(source: NewsSource, force = false): Promise<SourceResult> {
  const hit = cache.get(source.id);
  if (!force && hit && Date.now() - hit.at < (hit.result.ok ? TTL_MS : ERROR_TTL_MS)) return hit.result;

  const running = inflight.get(source.id);
  if (running) return running;

  const p = load(source)
    .then((result) => {
      cache.set(source.id, { at: Date.now(), result });
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

/** Fetch every active source (or a subset) in parallel. */
export async function getNews({ lang, sourceIds, force }: NewsQuery = {}) {
  let sources = ACTIVE_SOURCES;
  if (sourceIds?.length) {
    sources = sourceIds.map(getSource).filter((s): s is NewsSource => !!s && ACTIVE_SOURCES.includes(s));
  }
  if (lang) sources = sources.filter((s) => s.lang === lang);

  const results = await mapLimit(sources, CONCURRENCY, (s) => getSourceNews(s, force));
  const items = results.flatMap((r) => r.items);
  const statuses = results.map((r) => {
    const { items: _omit, ...status } = r; // eslint-disable-line @typescript-eslint/no-unused-vars
    return status;
  });
  return { items, statuses, generatedAt: new Date().toISOString() };
}
