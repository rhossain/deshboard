/**
 * What an outlet's article page says about itself in its <head>: the title, picture and publish time
 * it gives link previews. The shared-link function (functions/s/[[path]].ts) reads them for a shared
 * headline's picture, and for an old link the share index no longer has.
 */

export interface OutletHead {
  title?: string;
  /** Absolute http(s) address of og:image (or twitter:image). */
  image?: string;
  /** ISO string. */
  published?: string;
}

/** How much of the page is read looking for </head>: Prothom Alo's runs to about 350,000 characters. */
const HEAD_MAX_CHARS = 400_000;
/** Who is asking: outlets see an honest name and where to read about it. */
export const BOT_USER_AGENT = "Mozilla/5.0 (compatible; BartaboardBot/1.0; +https://bartaboard.com/about/)";

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

/** The <meta> tags of an HTML head, by property, name or itemprop (lower-cased); the first of each wins. */
function metaTags(head: string): Map<string, string> {
  const tags = new Map<string, string>();
  for (const [tag] of head.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = new Map<string, string>();
    for (const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
      attrs.set(m[1].toLowerCase(), m[2] ?? m[3] ?? m[4] ?? "");
    }
    const name = (attrs.get("property") ?? attrs.get("name") ?? attrs.get("itemprop"))?.toLowerCase();
    const content = attrs.get("content");
    if (name && content && !tags.has(name)) tags.set(name, decodeEntities(content).trim());
  }
  return tags;
}

/** The title, picture and publish time in an article page's head (`html` may stop anywhere after it). */
export function parseHead(html: string, pageUrl: string): OutletHead {
  const head = html.split(/<\/head>/i)[0];
  const tags = metaTags(head);

  const rawImage = tags.get("og:image") ?? tags.get("og:image:url") ?? tags.get("og:image:secure_url") ?? tags.get("twitter:image") ?? tags.get("twitter:image:src");
  let image: string | undefined;
  try {
    const abs = rawImage ? new URL(rawImage, pageUrl) : null;
    if (abs && (abs.protocol === "https:" || abs.protocol === "http:")) image = abs.href;
  } catch {
    // A broken address: no picture.
  }

  const titleTag = /<title[^>]*>([^<]*)<\/title>/i.exec(head)?.[1];
  const title = tags.get("og:title") ?? tags.get("twitter:title") ?? (titleTag ? decodeEntities(titleTag).trim() : undefined);
  // Some outlets (Prothom Alo) give the date only in their structured data.
  const time =
    tags.get("article:published_time") ??
    tags.get("og:published_time") ??
    tags.get("datepublished") ??
    /"datePublished"\s*:\s*"([^"]+)"/.exec(head)?.[1];
  const published = time && !Number.isNaN(Date.parse(time)) ? new Date(time).toISOString() : undefined;
  return { title: title || undefined, image, published };
}

/**
 * The article's own title, picture and publish time; null if the outlet doesn't answer in time. `why`
 * hears what went wrong when it is null ("http-403", "timeout", "not-html"…), for the response headers.
 */
export async function outletHead(link: string, timeoutMs: number, why?: (reason: string) => void): Promise<OutletHead | null> {
  try {
    // `cf`: Cloudflare keeps the outlet's page for an hour, so a link shared widely is read once.
    const init: RequestInit & { cf?: Record<string, unknown> } = {
      headers: { "user-agent": BOT_USER_AGENT, accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      cf: { cacheTtl: 3600, cacheEverything: true },
    };
    const res = await fetch(link, init);
    if (!res.ok || !res.body) {
      why?.(`http-${res.status}`);
      return null;
    }
    if (!/html/i.test(res.headers.get("content-type") ?? "")) {
      why?.("not-html");
      return null;
    }
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let html = "";
    while (html.length < HEAD_MAX_CHARS) {
      const { done, value } = await reader.read();
      if (done) break;
      html += value;
      if (/<\/head>/i.test(html)) break;
    }
    reader.cancel().catch(() => {});
    return parseHead(html, res.url || link);
  } catch (e) {
    why?.(e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError") ? "timeout" : "error");
    return null;
  }
}

/**
 * A title from the address alone, for an outlet that won't answer: the path's last part when it reads
 * as words, its separators as spaces ("padma-bridge-opens-4296596" → "Padma bridge opens"). Only the
 * last part: the ones before it are sections ("country-news"), not the story.
 */
export function slugTitle(url: URL): string | null {
  const last = url.pathname.split("/").filter(Boolean).pop();
  if (!last) return null;
  let text: string;
  try {
    text = decodeURIComponent(last);
  } catch {
    text = last;
  }
  text = text
    .replace(/\.(html?|php|aspx?)$/i, "")
    .replace(/[-_+]+/g, " ")
    .replace(/\b\d{4,}\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  // At least two words with letters: "news" and "a1b2c3d4e5" aren't titles.
  return text.split(" ").length >= 2 && /\p{L}{3,}/u.test(text) ? text[0].toUpperCase() + text.slice(1) : null;
}
