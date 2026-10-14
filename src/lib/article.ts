import * as cheerio from "cheerio";
import { cache } from "react";
import { fetchText } from "./fetchers/http";
import { cleanTitle } from "./fetchers/utils";
import { dayItems } from "./days";
import { cachedResult } from "./news";
import { slugTitle } from "./outlet-head";
import { articleUrl, linkKey, sharedId, shareKey } from "./share";
import { ACTIVE_SOURCES, SOURCES } from "./sources";
import { findStories } from "./stories";
import type { NewsItem, NewsSource } from "./types";

/** A shared headline: what the share page shows and what social sites get as the preview card. */
export interface SharedArticle {
  link: string;
  title: string;
  source: NewsSource;
  item?: NewsItem;
  /** The article's own summary and image, read from its Open Graph tags. */
  description?: string;
  image?: string;
  /** The same story from other outlets, when it is still on the board. */
  related: NewsItem[];
}

const META_TTL_MS = 6 * 3600_000;
const META_RETRY_MS = 3600_000;
const META_MAX = 500;
const META_TIMEOUT_MS = 5000;

type Meta = { title?: string; description?: string; image?: string };
const g = globalThis as unknown as { __articleMeta?: Map<string, { at: number; meta: Meta }> };
const metaCache = (g.__articleMeta ??= new Map());

const cachedItems = () => ACTIVE_SOURCES.flatMap((s) => cachedResult(s.id)?.items ?? []);

function findItem(link: string): NewsItem | undefined {
  const key = linkKey(link);
  return cachedItems().find((it) => linkKey(it.link) === key);
}

const DAY_MS = 86_400_000;
/** The day `days` from `date`; `date` itself when it isn't a real day ("2026-13-45" from a mistyped link). */
function shiftDay(date: string, days: number): string {
  const time = Date.parse(`${date}T00:00:00Z`);
  return Number.isNaN(time) ? date : new Date(time + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * The headline a short link (`/s/261014-k3x9pq2m`, see shortSharePath) names: among the cached ones
 * (the last 72 hours, with the homepage ones that have no time), then in its day's file and the days
 * either side (a headline moves day when its outlet corrects its time).
 */
function findByKey(key: string, date: string): NewsItem | undefined {
  const hit = (items: NewsItem[]) => items.find((it) => shareKey(it.link) === key);
  const cached = hit(cachedItems());
  if (cached) return cached;
  for (const day of [date, shiftDay(date, -1), shiftDay(date, 1)]) {
    const found = hit(dayItems(day));
    if (found) return found;
  }
}

/** Title, summary and image from the article's Open Graph tags; cached, and empty on failure. */
async function articleMeta(link: string): Promise<Meta> {
  const hit = metaCache.get(link);
  // A page that gave no picture (or didn't answer in time) is asked again sooner.
  if (hit && Date.now() - hit.at < (hit.meta.image ? META_TTL_MS : META_RETRY_MS)) return hit.meta;

  let meta: Meta = {};
  try {
    const res = await fetchText(link, { accept: "text/html,application/xhtml+xml", timeoutMs: META_TIMEOUT_MS });
    const $ = cheerio.load(res.text);
    const tag = (...names: string[]) => {
      for (const n of names) {
        const v = $(`meta[property="${n}"], meta[name="${n}"]`).attr("content")?.trim();
        if (v) return v;
      }
    };
    const image = tag("og:image", "twitter:image");
    meta = {
      title: cleanTitle(tag("og:title", "twitter:title") ?? $("title").first().text()) || undefined,
      description: cleanTitle(tag("og:description", "description", "twitter:description") ?? "") || undefined,
      image: image ? new URL(image, res.url).href : undefined,
    };
  } catch {
    // The page still works from the cached headline; only the summary and image are missing.
  }

  if (metaCache.size >= META_MAX) metaCache.delete(metaCache.keys().next().value!);
  metaCache.set(link, { at: Date.now(), meta });
  return meta;
}

/** The other outlets' headlines in the same story as `item`. */
function relatedTo(item: NewsItem): NewsItem[] {
  const story = findStories(cachedItems()).find((st) => st.items.some((it) => it.link === item.link));
  return story?.items.filter((it) => it.link !== item.link) ?? [];
}

/**
 * The shared headline for a share path's segments: a short link's (see shortSharePath), or an article
 * address on one of the board's outlets. Null when there is none, or no title can be found. Memoized
 * per request (metadata and page both ask).
 */
export const getSharedArticle = cache(async (path: string): Promise<SharedArticle | null> => {
  const segments = path.split("/");
  const id = sharedId(segments);
  let item: NewsItem | undefined;
  let url: URL;
  let source: NewsSource;
  if (id) {
    item = findByKey(id.key, id.date);
    const found = item && SOURCES.find((s) => s.id === item!.sourceId);
    if (!item || !found) return null;
    url = new URL(item.link);
    source = found;
  } else {
    const found = articleUrl(segments);
    if (!found) return null;
    ({ url, source } = found);
    item = findItem(url.href);
    if (item) source = SOURCES.find((s) => s.id === item!.sourceId) ?? source;
  }
  const link = item?.link ?? url.href;
  const meta = await articleMeta(link);
  // Prefer the headline as it appeared on the board; then the article's own title; then its address.
  const title = item?.title ?? meta.title ?? slugTitle(url);
  if (!title) return null;
  return {
    link,
    title,
    source,
    item,
    description: meta.description,
    // The picture the refresh found (see pictures.ts), else the one on the article's page now.
    image: item?.image ?? meta.image,
    related: item ? relatedTo(item) : [],
  };
});
