import { SOURCES } from "./sources";
import type { NewsSource } from "./types";

/**
 * Shared headlines go out as short Bartaboard links, `/s/261014-k3x9pq2m` (see shortSharePath): a page
 * with the headline, its outlet and a button to the article, found by the key among the cached headlines
 * and the day files (article.ts). Links from before short ones existed carry the article's address instead,
 * `/s/www.prothomalo.com/bangladesh/abc123` (the path minus the scheme); they still work.
 */
export function sharePath(link: string): string {
  return `/s/${link.replace(/^https?:\/\//, "")}`;
}

/**
 * A short share link: the Dhaka day the headline is filed under (its time's, as the day files have it,
 * see archive.ts) as `yymmdd`, and its key (see shareKey): `/s/261014-k3x9pq2m`. The day says which day
 * file to look in once the headline has left the cache. The static site's links have the same form.
 */
const SHARE_ID = /^(\d{2})(\d{2})(\d{2})-([0-9a-z]{8})$/;

/**
 * cyrb53 (bryc, public domain): a fast 53-bit string hash that gives the same number in every
 * JavaScript engine, so the browser and the server (and the static site) agree on a link's key.
 */
function cyrb53(text: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/**
 * An article's key: its address (as linkKey sees it, so scheme, `www.` and a trailing slash don't
 * matter) hashed to eight base-36 characters, about 2.8 trillion values.
 */
export function shareKey(link: string): string {
  return (cyrb53(linkKey(link)) % 36 ** 8).toString(36).padStart(8, "0");
}

/** The short share path for a headline filed under `date` (a Dhaka day, "2026-10-14"). */
export function shortSharePath(link: string, date: string): string {
  return `/s/${date.slice(2).replaceAll("-", "")}-${shareKey(link)}`;
}

/** The day ("2026-10-14") and key in a short share path's segments, or null if it isn't a short link. */
export function sharedId(segments: string[]): { date: string; key: string } | null {
  const m = segments.length === 1 ? SHARE_ID.exec(segments[0]) : null;
  return m ? { date: `20${m[1]}-${m[2]}-${m[3]}`, key: m[4] } : null;
}

/**
 * What a shared link says alongside the link itself, in WhatsApp, Telegram, X and the system share
 * menu: the headline, where it is from, and where it was found.
 */
export function shareText(title: string, sourceName: string): string {
  return `“${title}” — ${sourceName} · Bartaboard`;
}

/** Shared videos use YouTube's short link in the same form: `/s/youtu.be/<video id>`. */
const VIDEO_HOST = "youtu.be";
const VIDEO_ID = /^[\w-]{11}$/;

export function videoSharePath(id: string): string {
  return `/s/${VIDEO_HOST}/${id}`;
}

/** The YouTube video ID in a share path's segments, or null if it isn't a video's. */
export function sharedVideoId(segments: string[]): string | null {
  return segments.length === 2 && segments[0] === VIDEO_HOST && VIDEO_ID.test(segments[1]) ? segments[1] : null;
}

const hostKey = (host: string) => host.replace(/^www\./, "").toLowerCase();

/** Compare links regardless of scheme, `www.`, a trailing slash or percent-encoding. */
export function linkKey(link: string): string {
  try {
    const u = new URL(link);
    return hostKey(u.host) + u.pathname.replace(/\/$/, "");
  } catch {
    return link;
  }
}

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

export interface ShareTarget {
  id: string;
  label: string;
  /** Brand colour for the icon. */
  color: string;
  /** The site's share address for a link and its text (see shareText; Facebook takes the link alone). */
  href: (url: string, text: string) => string;
}

const enc = encodeURIComponent;

export const SHARE_TARGETS: ShareTarget[] = [
  {
    id: "facebook",
    label: "Facebook",
    color: "#0866ff",
    href: (url) => `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`,
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    color: "#25d366",
    href: (url, text) => `https://wa.me/?text=${enc(`${text}\n${url}`)}`,
  },
  {
    id: "x",
    label: "X",
    color: "currentColor",
    href: (url, text) => `https://x.com/intent/post?text=${enc(text)}&url=${enc(url)}`,
  },
  {
    id: "telegram",
    label: "Telegram",
    color: "#26a5e4",
    href: (url, text) => `https://t.me/share/url?url=${enc(url)}&text=${enc(text)}`,
  },
];
