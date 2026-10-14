import { withPictures } from "./archive";
import { categorize, unmappedSection } from "./categories";
import { stampFirstSeen } from "./first-seen";
import { googleNewsFallback } from "./google-news";
import { getHealth, recordHealth } from "./health";
import { extractHeadlines } from "./fetchers/html";
import { fetchText } from "./fetchers/http";
import { parseFeed, type RawItem } from "./fetchers/rss";
import { parseNewsSitemap } from "./fetchers/sitemap";
import { canonicalLink, dedupeByLink, dhakaDate, addressKey, shiftDhakaAsUtc, titleKey } from "./fetchers/utils";
import { ACTIVE_SOURCES, getSource } from "./sources";
import { readStore, writeStoreSoon } from "./store";
import { itemTime, newestFirst } from "./stories";
import type { NewsItem, NewsSource, SourceResult } from "./types";

/** How long a source's result is reused before it is fetched again. */
const TTL_MS = Number(process.env.NEWS_CACHE_SECONDS ?? 600) * 1000;
/** Failed sources are retried sooner. */
const ERROR_TTL_MS = 60_000;
const CONCURRENCY = 8;
/** Headlines older than this drop off (as long as first-seen.ts remembers a link). */
export const MAX_AGE_MS = 72 * 3600_000;
/**
 * The board's headlines go back this far: two days. The cache keeps all of MAX_AGE_MS, for the day
 * files (which the search and shared links reach further back with) and the first publish times.
 */
export const BOARD_MAX_AGE_MS = 48 * 3600_000;
/** The board gets each source's newest this many at most: a day or more for all but the busiest outlets. */
const PER_SOURCE = 300;
/** Publish times up to this far ahead of now are clock drift; later ones are wrong. */
const MAX_AHEAD_MS = 15 * 60_000;
/** A safety limit on what is kept, should a sitemap start listing thousands of links. */
const MAX_KEPT = 3000;

type CacheEntry = { at: number; result: SourceResult };
const CACHE_STORE = "news-cache";

// Survives hot reloads in dev and is shared by all requests in one server process. Starts from the
// copy on disk, so a restart serves the last headlines instead of fetching all sources again.
const g = globalThis as unknown as {
  __newsCache?: Map<string, CacheEntry>;
  __newsInflight?: Map<string, Promise<SourceResult>>;
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

/**
 * A source's headlines: this fetch's, then the ones kept from before, so a short feed (ten items, an
 * hour's worth for some outlets) builds up between runs while a sitemap of a thousand is cut down.
 * Headlines with no time stay only while they are on the page; the rest drop off at MAX_AGE_MS.
 *
 * A link keeps the earliest publish time it had: Google News (and some sites' feeds) re-date an article
 * when it is edited, which would bring a day-old story back to the top of Latest. And one headline at
 * two addresses (another section's, an older id) is shown once.
 */
export function mergeNews(fresh: NewsItem[], kept: NewsItem[], now = Date.now()): NewsItem[] {
  const cutoff = new Date(now - MAX_AGE_MS).toISOString();
  const ahead = new Date(now + MAX_AHEAD_MS).toISOString();
  // (Kept ones still ahead of now were kept before such times were left out; see load.)
  const recent = (it: NewsItem) => (itemTime(it) ?? "") >= cutoff && (itemTime(it) ?? "") <= ahead;
  const firstTime = new Map<string, string>();
  for (const it of kept) if (it.publishedAt) firstTime.set(addressKey(it.link), it.publishedAt);
  const redated = withPictures(fresh, kept).map((it) => {
    const first = it.publishedAt && firstTime.get(addressKey(it.link));
    return first && first < it.publishedAt! ? { ...it, publishedAt: first } : it;
  });
  // dedupeByLink keeps the first of each link, so this fetch's title and section win.
  const titles = new Set<string>();
  return dedupeByLink([...redated.filter((it) => !itemTime(it) || recent(it)), ...kept.filter(recent)])
    .filter((it) => {
      const key = titleKey(it.title);
      if (titles.has(key)) return false;
      titles.add(key);
      return true;
    })
    .sort((a, b) => newestFirst(itemTime(a), itemTime(b)))
    .slice(0, MAX_KEPT);
}

/**
 * A source's result as the board gets it: the headlines of the last BOARD_MAX_AGE_MS, and only its
 * newest PER_SOURCE of those. Undated ones are on the outlet's page now, so they stay.
 */
export function forBoard<T extends SourceResult>(result: T, now = Date.now()): T {
  const cutoff = new Date(now - BOARD_MAX_AGE_MS).toISOString();
  const items = result.items.filter((it) => (itemTime(it) ?? cutoff) >= cutoff).slice(0, PER_SOURCE);
  return items.length === result.items.length ? result : { ...result, items };
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * The source's own feed or page; when that fails (most often a site blocking automated requests),
 * its articles from Google News instead.
 */
async function fetchWithFallback(
  source: NewsSource,
): Promise<{ items: RawItem[]; url: string; via?: "google-news"; directError?: string }> {
  try {
    // A site that can't be read at all goes straight to Google News; its notes say why.
    if (source.method === "google-news") throw new Error(source.notes ?? "The site can't be read directly");
    return await fetchRaw(source);
  } catch (err) {
    const directError = message(err);
    try {
      return { ...(await googleNewsFallback(source)), via: "google-news", directError };
    } catch (fallbackErr) {
      throw Object.assign(new Error(directError), { fallbackError: message(fallbackErr) });
    }
  }
}

async function load(source: NewsSource): Promise<SourceResult> {
  const started = Date.now();
  // Headlines kept from before that no section was found for get another look, by their words.
  const kept = (cache.get(source.id)?.result.items ?? []).map((it) => ({
    ...it,
    link: canonicalLink(it.link),
    ...(it.category === "other" ? { category: categorize(it.link, [], it.title) } : {}),
  }));
  const base = {
    sourceId: source.id,
    sourceName: source.name,
    method: source.method,
    fetchedAt: new Date().toISOString(),
  };
  try {
    const { items, url, via, directError } = await fetchWithFallback(source);
    const futureLimit = new Date(Date.now() + MAX_AHEAD_MS).toISOString();
    const unmapped = new Map<string, number>();
    const news: NewsItem[] = dedupeByLink(items.map((it) => ({ ...it, link: canonicalLink(it.link) }))).map(({ tags, ...it }) => {
      const category = categorize(it.link, tags, it.title);
      if (category === "other") {
        const section = unmappedSection(it.link, tags);
        unmapped.set(section, (unmapped.get(section) ?? 0) + 1);
      }
      // Google's dates are right; only the site's own feed has the Dhaka-time quirk.
      const publishedAt = source.dhakaTimeAsUtc && !via ? shiftDhakaAsUtc(it.publishedAt) : it.publishedAt;
      return {
        ...it,
        // A time still ahead of now is a feed's time-zone mistake: it would sit atop Latest for hours.
        // Left out, the headline is timed by when it was first seen.
        publishedAt: publishedAt && publishedAt <= futureLimit ? publishedAt : undefined,
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
      // What this fetch found; `items` also has the ones kept from before.
      count: news.length,
      ...(via ? { via, directError } : {}),
      fetchedUrl: url,
      durationMs: Date.now() - started,
      items: mergeNews(news, kept),
    };
    recordHealth(result, unmapped);
    return result;
  } catch (err) {
    const result = {
      ...base,
      ok: false,
      count: 0,
      error: message(err),
      ...(err instanceof Error && "fallbackError" in err ? { fallbackError: String(err.fallbackError) } : {}),
      durationMs: Date.now() - started,
      // Keep what we have; it ages out on its own if the source stays unreachable.
      items: mergeNews([], kept),
    };
    // Read before this failure is recorded: then it is set only if the last update failed too.
    const failingSince = getHealth(source.id).failingSince ?? result.fetchedAt;
    recordHealth(result, new Map());
    return { ...result, failingSince };
  }
}

/**
 * The cached result for a source, without fetching (undefined if it was never fetched): all of its
 * last 72 hours; forBoard trims it for the board.
 */
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
  const items = results.flatMap((r) => forBoard(r).items);
  const statuses = results.map((r) => {
    const { items: _omit, ...status } = r; // eslint-disable-line @typescript-eslint/no-unused-vars
    return status;
  });
  return { items, statuses, generatedAt: new Date().toISOString() };
}
