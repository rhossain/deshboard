import { FetchError, fetchText, looksLikeXml, USER_AGENT } from "./http";
import { asArray, cleanTitle, parseDate, textOf } from "./utils";
import { xmlParser } from "./xml";

/**
 * Google News, as a stand-in for sites that refuse our requests (Cloudflare's bot checks): its
 * search feed lists a site's articles from the last day. Its links are opaque Google ids, turned
 * into the article's own address by `resolveArticle` (see src/lib/google-news.ts for the caching).
 */

export interface GoogleNewsEntry {
  /** Google's article id (the last part of news.google.com/rss/articles/<id>). */
  id: string;
  title: string;
  publishedAt?: string;
}

type Node = Record<string, unknown>;

/** The site's host as Google matches it: "www." dropped, other subdomains kept (bangla.…). */
export function siteHost(homepage: string): string {
  return new URL(homepage).hostname.replace(/^www\./, "");
}

/**
 * The search feed for one site's last day. Bangla sites are searched in Google's Bangladesh
 * edition; it has no English one, so English sites use the US edition (which has them).
 */
export function googleNewsFeedUrl(homepage: string, lang: "bn" | "en"): string {
  const edition = lang === "bn" ? "hl=bn&gl=BD&ceid=BD:bn" : "hl=en-US&gl=US&ceid=US:en";
  return `https://news.google.com/rss/search?q=${encodeURIComponent(`site:${siteHost(homepage)} when:1d`)}&${edition}`;
}

/**
 * The feed's articles from `host` itself; a site search also turns up its e-paper and sister
 * sites, told apart by each item's <source url>. Titles lose the " - Publisher" Google appends.
 */
export function parseGoogleNewsFeed(xml: string, host: string): GoogleNewsEntry[] {
  if (!looksLikeXml(xml)) throw new Error("Google News returned a web page instead of a feed");
  const channel = ((xmlParser.parse(xml) as Node).rss as Node | undefined)?.channel as Node | undefined;
  if (!channel) throw new Error("Not a Google News feed");
  const entries: GoogleNewsEntry[] = [];
  for (const it of asArray(channel.item as Node | Node[])) {
    const source = it.source as Node | string | undefined;
    const publisherUrl = typeof source === "object" ? textOf(source["@_url"]) : "";
    let publisherHost = "";
    try {
      publisherHost = siteHost(publisherUrl);
    } catch {
      continue;
    }
    if (publisherHost !== host) continue;
    const id = /\/articles\/([^?/]+)/.exec(textOf(it.link))?.[1];
    const publisher = cleanTitle(source);
    let title = cleanTitle(it.title);
    if (publisher && title.endsWith(` - ${publisher}`)) title = title.slice(0, -publisher.length - 3).trim();
    if (id && title) entries.push({ id, title, publishedAt: parseDate(it.pubDate) });
  }
  return entries;
}

/** The two values on an article's Google page that its address lookup needs. */
export function articleSignature(html: string): { signature: string; timestamp: number } | undefined {
  const signature = /data-n-a-sg="([^"]+)"/.exec(html)?.[1];
  const timestamp = Number(/data-n-a-ts="(\d+)"/.exec(html)?.[1]);
  return signature && timestamp ? { signature, timestamp } : undefined;
}

/** The article's own address, from the lookup's reply (`["garturlres","https://…",1]`, JSON in JSON). */
export function parseResolvedUrl(body: string): string | undefined {
  const url = /\\"garturlres\\",\\"(https?:\/\/[^"\\]+)\\"/.exec(body)?.[1];
  return url && /^https?:\/\//.test(url) ? url : undefined;
}

const TIMEOUT_MS = 12_000;

/** Turns a Google article id into the article's own address: two requests to news.google.com. */
export async function resolveArticle(id: string): Promise<string> {
  const page = await fetchText(`https://news.google.com/rss/articles/${id}`, { accept: "text/html", timeoutMs: TIMEOUT_MS });
  const sig = articleSignature(page.text);
  if (!sig) throw new FetchError("Google News article page had no signature");

  const request = [
    "garturlreq",
    [["X", "X", ["X", "X"], null, null, 1, 1, "US:en", null, 1, null, null, null, null, null, 0, 1], "X", "X", 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0],
    id,
    sig.timestamp,
    sig.signature,
  ];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch("https://news.google.com/_/DotsSplashUi/data/batchexecute", {
      method: "POST",
      headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: new URLSearchParams({ "f.req": JSON.stringify([[["Fbv4je", JSON.stringify(request), null, "generic"]]]) }),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) throw new FetchError(`HTTP ${res.status}`, res.status);
    const url = parseResolvedUrl(await res.text());
    if (!url) throw new FetchError("Google News did not return the article's address");
    return url;
  } catch (err) {
    if (err instanceof FetchError) throw err;
    throw new FetchError(err instanceof Error && err.name === "AbortError" ? "Timed out" : String(err));
  } finally {
    clearTimeout(timer);
  }
}
