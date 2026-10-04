import * as cheerio from "cheerio";
import type { RawItem } from "./rss";
import { cleanTitle, resolveUrl } from "./utils";

const MIN_TITLE = 12;
const MAX_TITLE = 220;
const MAX_ITEMS = 60;

const JUNK = /^(read more|more|details|বিস্তারিত|আরও|আরো পড়ুন|সব খবর|view all|see all)$/i;

function hostKey(host: string) {
  return host.replace(/^www\./, "").toLowerCase();
}

/**
 * Extract headline links from a homepage.
 *
 * A link counts as an article when it points to the same site and its
 * pathname matches the source's `articlePattern` (e.g. `^/article/\d+`).
 * When the same URL appears several times (image link + headline link),
 * the best text is kept: a heading inside the link wins, then the longest
 * text that still looks like a headline. Page order is preserved, so the
 * top stories come first.
 */
export function extractHeadlines(html: string, pageUrl: string, articlePattern: string): RawItem[] {
  const $ = cheerio.load(html);
  const pattern = new RegExp(articlePattern, "i");
  const pageHost = hostKey(new URL(pageUrl).host);

  const best = new Map<string, { title: string; score: number; order: number }>();
  let order = 0;

  $("a[href]").each((_, el) => {
    const a = $(el);
    const link = resolveUrl(a.attr("href") ?? "", pageUrl);
    if (!link) return;
    const u = new URL(link);
    if (hostKey(u.host) !== pageHost) return;
    if (!pattern.test(u.pathname)) return;

    const heading = cleanTitle(a.find("h1,h2,h3,h4,h5").first().text());
    const own = cleanTitle(a.text());
    const attr = cleanTitle(a.attr("title") ?? a.find("img[alt]").first().attr("alt") ?? "");

    let title = "";
    let score = 0;
    if (heading.length >= MIN_TITLE && heading.length <= MAX_TITLE) {
      title = heading;
      score = 3;
    } else if (own.length >= MIN_TITLE && own.length <= MAX_TITLE) {
      title = own;
      score = 2;
    } else if (attr.length >= MIN_TITLE && attr.length <= MAX_TITLE) {
      title = attr;
      score = 1;
    }
    if (!title || JUNK.test(title)) return;

    const key = u.origin + u.pathname;
    const prev = best.get(key);
    if (!prev) {
      best.set(key, { title, score, order: order++ });
    } else if (score > prev.score || (score === prev.score && title.length > prev.title.length)) {
      best.set(key, { ...prev, title, score });
    }
  });

  return [...best.entries()]
    .sort((a, b) => a[1].order - b[1].order)
    .slice(0, MAX_ITEMS)
    .map(([link, v]) => ({ title: v.title, link }));
}
