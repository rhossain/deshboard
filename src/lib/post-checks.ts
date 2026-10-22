import { BROWSER_UA, CRAWLER_UA } from "./card-picture-rules";
import type { NewsItem, Video } from "./types";

export { BROWSER_UA, CRAWLER_UA };

/**
 * The checks every Facebook post passes before it goes out (scripts/post-facebook.ts): each link answers Facebook's
 * crawler with its own headline or video title and picture, each picture loads and is big enough, each video still
 * plays on other sites, each article is still up, and no text is empty or has a gap. A card that fails is left out
 * and the pick made again (checkedPick); a post that can't be made whole isn't made.
 */

/**
 * The title of the site's own card, which a share link shows when it can't find its headline (or the share function
 * didn't answer): a preview with it is a broken one.
 */
export const FALLBACK_TITLE = /every Bangladeshi headline, on one board|has left Bartaboard/i;
/** How many times, and how far apart, a link whose preview came out as the fallback card is read again. */
export const PREVIEW_TRIES = 4;
export const PREVIEW_RETRY_MS = Number(process.env.FB_CHECK_RETRY_MS) || 20_000;

/** The site's own picture, which a share page shows when the headline has none: a bare preview. */
export const SITE_PICTURE = /\/opengraph-image/;
/** Smallest picture a card or preview may have (Facebook shows smaller ones as a thumbnail, or not at all). */
export const MIN_PICTURE = { width: 200, height: 150, bytes: 2000 };

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const decode = (text: string) =>
  text.replace(/&(amp|lt|gt|quot|#39|#x27);/g, (_, e: string) => ({ amp: "&", lt: "<", gt: ">", quot: '"' })[e] ?? "'");
export const normal = (text: string) => decode(text).replace(/\s+/g, " ").trim();

/** A meta tag's content in a page (either attribute order). */
export function metaContent(html: string, property: string): string {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (!new RegExp(`(?:property|name)=["']${property}["']`, "i").test(tag)) continue;
    const content = /content=(["'])(.*?)\1/i.exec(tag)?.[2];
    if (content !== undefined) return normal(content);
  }
  return "";
}

/** What a link-preview crawler gets at a link now: the status (redirects not followed), og:title and og:image. */
export async function crawl(link: string): Promise<{ status: number; title: string; image: string; error?: string }> {
  try {
    const res = await fetch(link, { headers: { "user-agent": CRAWLER_UA }, redirect: "manual", signal: AbortSignal.timeout(20_000) });
    const html = res.status === 200 ? await res.text() : "";
    return { status: res.status, title: metaContent(html, "og:title"), image: metaContent(html, "og:image") };
  } catch (err) {
    return { status: 0, title: "", image: "", error: (err as Error).name };
  }
}

/** Whether the title a page shows is the one expected (the same text, or nearly: most of its words). */
export function sameTitle(shown: string, expected: string): boolean {
  const a = normal(shown).toLowerCase();
  const b = normal(expected).toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  const words = (t: string) => t.split(/[\s,.:;!?'"‘’“”|—–-]+/u).filter((w) => w.length > 1);
  const seen = new Set(words(a));
  const wanted = words(b);
  return wanted.length > 0 && wanted.filter((w) => seen.has(w)).length / wanted.length >= 0.6;
}

/** A picture's width and height from its first bytes (JPEG, PNG, GIF, WebP); null when it can't tell. */
export function pictureSize(b: Uint8Array): { width: number; height: number } | null {
  const u16 = (i: number) => (b[i] << 8) | b[i + 1];
  const le16 = (i: number) => b[i] | (b[i + 1] << 8);
  if (b[0] === 0x89 && b[1] === 0x50) return { width: (u16(16) << 16) | u16(18), height: (u16(20) << 16) | u16(22) };
  if (b[0] === 0x47 && b[1] === 0x49) return { width: le16(6), height: le16(8) };
  if (b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i + 9 < b.length; ) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: u16(i + 7), height: u16(i + 5) };
      i += 2 + u16(i + 2);
    }
    return null;
  }
  if (String.fromCharCode(...b.slice(8, 12)) === "WEBP") {
    const kind = String.fromCharCode(...b.slice(12, 16));
    if (kind === "VP8 ") return { width: le16(26) & 0x3fff, height: le16(28) & 0x3fff };
    if (kind === "VP8L") {
      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (kind === "VP8X") return { width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
  }
  return null;
}

/** What is wrong with a picture as Facebook would fetch it (missing, not a picture, too small); null if nothing. */
export async function pictureProblem(url: string | undefined): Promise<string | null> {
  if (!url || !/^https?:\/\//.test(url)) return `no picture (${url || "none"})`;
  try {
    const res = await fetch(url, { headers: { "user-agent": CRAWLER_UA }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return `picture ${url} answers ${res.status}`;
    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) return `picture ${url} isn't a picture (${type || "no type"})`;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length < MIN_PICTURE.bytes) return `picture ${url} is only ${bytes.length} bytes`;
    const size = pictureSize(bytes);
    if (size && (size.width < MIN_PICTURE.width || size.height < MIN_PICTURE.height))
      return `picture ${url} is only ${size.width}×${size.height}`;
    return null;
  } catch (err) {
    return `picture ${url} didn't load (${(err as Error).name})`;
  }
}

/**
 * What is wrong with a Bartaboard link as Facebook's crawler would read it now; null if nothing. It must answer
 * (not redirect), with its own title (not the site's fallback card, not another headline) and, when `picture`, a
 * picture of its own that loads. Read again a little later while it isn't right (the upload may not be everywhere yet).
 */
export async function linkProblem(link: string, expected: string, picture: boolean, tries = PREVIEW_TRIES): Promise<string | null> {
  let problem: string | null = null;
  for (let i = 0; i < tries; i++) {
    if (i) await sleep(PREVIEW_RETRY_MS);
    const page = await crawl(link);
    if (page.status !== 200) problem = page.status ? `${link} answers ${page.status}` : `${link} didn't answer (${page.error})`;
    else if (!page.title || FALLBACK_TITLE.test(page.title)) problem = `${link} shows the site's fallback card ("${page.title}")`;
    else if (!sameTitle(page.title, expected)) problem = `${link} shows "${page.title}", not "${normal(expected)}"`;
    else if (picture && (!page.image || SITE_PICTURE.test(page.image))) problem = `${link} has no picture of its own`;
    else problem = picture ? await pictureProblem(page.image) : null;
    if (!problem) return null;
  }
  return problem;
}

/** Whether YouTube still has the video, and lets other sites play it (Bartaboard plays it on its own page). */
export async function videoProblem(video: Video): Promise<string | null> {
  const watch = `https://www.youtube.com/watch?v=${video.id}`;
  try {
    const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watch)}`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 401 || res.status === 403) return `${watch} can't be played on other sites`;
    if (res.status === 400 || res.status === 404) return `${watch} is private or gone`;
    return null;
  } catch {
    // YouTube not answering says nothing about the video: the link and thumbnail checks still apply.
    return null;
  }
}

/** Whether the outlet has taken the article down (404 or 410). Any other answer passes: some outlets refuse GitHub. */
export async function articleProblem(item: NewsItem): Promise<string | null> {
  try {
    const res = await fetch(item.link, { headers: { "user-agent": BROWSER_UA }, signal: AbortSignal.timeout(15_000) });
    void res.body?.cancel();
    return res.status === 404 || res.status === 410 ? `${item.link} is gone from ${item.sourceName} (${res.status})` : null;
  } catch {
    return null;
  }
}

/** The first of several checks to find a problem, or null. */
export async function firstProblem(...checks: Promise<string | null>[]): Promise<string | null> {
  return (await Promise.all(checks)).find(Boolean) ?? null;
}

/** Problems with a post's own text: empty, or with a placeholder left in it. */
export function textProblem(label: string, text: string | undefined): string | null {
  if (!text?.trim()) return `${label} is empty`;
  if (/\b(undefined|null|NaN)\b|\[object |\uFFFD/.test(text)) return `${label} has a gap in it: "${text.slice(0, 80)}"`;
  return null;
}

/** How many times a pick is made again with the cards that failed left out. */
export const PICK_ROUNDS = 4;

/**
 * Picks, then checks what was picked; what fails is reported and left out (`reject`) and the pick made again, until
 * everything picked passes. Empty when nothing does in PICK_ROUNDS: nothing is posted from it.
 */
export async function checkedPick<T, K>(
  label: string,
  pick: () => T[],
  key: (card: T) => K,
  check: (card: T) => Promise<string | null>,
  reject: (card: T) => void,
  report: (message: string) => void,
): Promise<T[]> {
  const known = new Map<K, Promise<string | null>>();
  for (let round = 0; round < PICK_ROUNDS; round++) {
    const cards = pick();
    if (!cards.length) return [];
    const problems = await Promise.all(
      cards.map((c) => {
        const k = key(c);
        if (!known.has(k)) known.set(k, check(c));
        return known.get(k)!;
      }),
    );
    if (problems.every((p) => !p)) return cards;
    problems.forEach((p, i) => {
      if (!p) return;
      reject(cards[i]);
      report(`Left out of the ${label}: ${p}`);
    });
  }
  report(`No ${label} passed the checks after ${PICK_ROUNDS} picks.`);
  return [];
}

