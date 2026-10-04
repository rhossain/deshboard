import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import type { RawItem } from "./rss";
import { cleanTitle, resolveUrl } from "./utils";

const MIN_TITLE = 12;
const MAX_TITLE = 220;
const MAX_ITEMS = 60;

const JUNK = /^(read more|more|details|বিস্তারিত|আরও|আরো পড়ুন|সব খবর|view all|see all)$/i;
const HEADINGS = "h1,h2,h3,h4,h5,h6";
/** Timestamps / labels that some sites put inside the link next to the headline. */
const NOISE = 'time, script, style, [class*="time" i], [class*="date" i], [class*="ago" i], [class*="tag" i]';

const fits = (s: string) => s.length >= MIN_TITLE && s.length <= MAX_TITLE;

function hostKey(host: string) {
  return host.replace(/^www\./, "").toLowerCase();
}

/** Element text with timestamps and labels removed. */
function textOf($el: cheerio.Cheerio<AnyNode>) {
  const clone = $el.clone();
  clone.find(NOISE).remove();
  return cleanTitle(clone.text());
}

function isHidden($el: cheerio.Cheerio<AnyNode>) {
  return /display\s*:\s*none|visibility\s*:\s*hidden/i.test($el.attr("style") ?? "") || $el.is("[hidden]");
}

/**
 * Extract headline links from a homepage.
 *
 * A link counts as an article when it points to the same site and its
 * pathname matches the source's `articlePattern` (e.g. `^/article/\d+`).
 * Title preference for each link:
 *   1. first visible heading inside the link
 *   2. the link's own text (timestamps / labels removed)
 *   3. the link's title attribute or image alt text
 *   4. for empty "overlay" links, the single heading in the surrounding card
 * When the same URL appears several times, the best-scoring text wins.
 * Page order is preserved, so the top stories come first.
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

    let title = "";
    let score = 0;

    a.find(HEADINGS).each((_, h) => {
      const $h = $(h);
      if (isHidden($h)) return;
      const t = textOf($h);
      if (fits(t)) {
        title = t;
        score = 4;
        return false;
      }
    });

    if (!title) {
      const own = textOf(a);
      if (fits(own)) {
        title = own;
        score = 3;
      }
    }

    if (!title) {
      const attr = cleanTitle(a.attr("title") ?? a.find("img[alt]").first().attr("alt") ?? "");
      if (fits(attr)) {
        title = attr;
        score = 2;
      }
    }

    if (!title && cleanTitle(a.text()).length === 0) {
      // Overlay link: <div class="card"><a href=…></a><h3>Title</h3></div>
      // Only trust a container that links to this one article.
      let node = a.parent();
      for (let depth = 0; depth < 3 && node.length && !node.is("body,html"); depth++, node = node.parent()) {
        const targets = new Set(
          node
            .find("a[href]")
            .map((_, x) => resolveUrl($(x).attr("href") ?? "", pageUrl)?.replace(/[?#].*$/, ""))
            .get()
            .filter((h) => h && pattern.test(new URL(h).pathname)),
        );
        if (targets.size > 1) break;
        const hs = node.find(HEADINGS).filter((_, h) => !isHidden($(h)) && fits(textOf($(h))));
        if (hs.length === 1) {
          title = textOf(hs.first());
          score = 1;
          break;
        }
        if (hs.length > 1) break;
      }
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
