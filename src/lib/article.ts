import * as cheerio from "cheerio";
import { cache } from "react";
import { fetchText } from "./fetchers/http";
import { cleanTitle } from "./fetchers/utils";
import { cachedResult } from "./news";
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
const META_MAX = 500;
const META_TIMEOUT_MS = 5000;

type Meta = { title?: string; description?: string; image?: string };
const g = globalThis as unknown as { __articleMeta?: Map<string, { at: number; meta: Meta }> };
const metaCache = (g.__articleMeta ??= new Map());

const hostKey = (host: string) => host.replace(/^www\./, "").toLowerCase();
/** Compare links regardless of scheme, `www.`, a trailing slash or percent-encoding. */
const linkKey = (link: string) => {
  try {
    const u = new URL(link);
    return hostKey(u.host) + u.pathname.replace(/\/$/, "");
  } catch {
    return link;
  }
};

/** The source whose site (or a subdomain of it) serves `url`. */
function sourceFor(url: URL): NewsSource | undefined {
  const host = hostKey(url.host);
  const matches = SOURCES.filter((s) => {
    const home = new URL(s.homepage);
    const site = hostKey(home.host);
    const base = home.pathname.replace(/\/$/, "");
    return (
      (host === site || host.endsWith(`.${site}`)) && (url.pathname === base || url.pathname.startsWith(`${base}/`))
    );
  });
  // The most specific homepage wins: bangla.thedailystar.net is "The Daily Star Bangla", and
  // tbsnews.net/bangla/… is "TBS Bangla", not "The Business Standard".
  return matches.sort((a, b) => b.homepage.length - a.homepage.length)[0];
}

/**
 * The article URL in a share path (`/s/<host>/<path>`), or null. Only links to the outlets on the
 * board are accepted, so a share link can't be used to send readers to an arbitrary site.
 */
export function articleUrl(segments: string[]): { url: URL; source: NewsSource } | null {
  if (!segments.length) return null;
  try {
    const url = new URL(`https://${segments.join("/")}`);
    const source = sourceFor(url);
    return source ? { url, source } : null;
  } catch {
    return null;
  }
}

function findItem(link: string): NewsItem | undefined {
  const key = linkKey(link);
  for (const s of ACTIVE_SOURCES) {
    const hit = cachedResult(s.id)?.items.find((it) => linkKey(it.link) === key);
    if (hit) return hit;
  }
}

/** Title, summary and image from the article's Open Graph tags; cached, and empty on failure. */
async function articleMeta(link: string): Promise<Meta> {
  const hit = metaCache.get(link);
  if (hit && Date.now() - hit.at < META_TTL_MS) return hit.meta;

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
  const items = ACTIVE_SOURCES.flatMap((s) => cachedResult(s.id)?.items ?? []);
  const story = findStories(items).find((st) => st.items.some((it) => it.link === item.link));
  return story?.items.filter((it) => it.link !== item.link) ?? [];
}

/**
 * The shared headline for a share path's segments, or null when the link isn't to an outlet on the
 * board or no title can be found. Memoized per request (metadata and page both ask).
 */
export const getSharedArticle = cache(async (path: string): Promise<SharedArticle | null> => {
  const found = articleUrl(path.split("/"));
  if (!found) return null;
  const item = findItem(found.url.href);
  const link = item?.link ?? found.url.href;
  const meta = await articleMeta(link);
  // Prefer the headline as it appeared on the board; fall back to the article's own title.
  const title = item?.title ?? meta.title;
  if (!title) return null;
  return {
    link,
    title,
    source: item ? (SOURCES.find((s) => s.id === item.sourceId) ?? found.source) : found.source,
    item,
    description: meta.description,
    image: meta.image,
    related: item ? relatedTo(item) : [],
  };
});
