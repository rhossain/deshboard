import { SOURCES } from "./sources";
import type { NewsSource } from "./types";

/**
 * Shared headlines go out as Deshboard links: `/s/www.prothomalo.com/bangladesh/abc123` opens a
 * page with the headline, its outlet and a button to the article. The article URL is the path
 * minus the scheme, so the link stays readable and needs no database.
 */
export function sharePath(link: string): string {
  return `/s/${link.replace(/^https?:\/\//, "")}`;
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
  href: (url: string, title: string) => string;
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
    href: (url, title) => `https://wa.me/?text=${enc(`${title}\n${url}`)}`,
  },
  {
    id: "x",
    label: "X",
    color: "currentColor",
    href: (url, title) => `https://x.com/intent/post?text=${enc(title)}&url=${enc(url)}`,
  },
  {
    id: "telegram",
    label: "Telegram",
    color: "#26a5e4",
    href: (url, title) => `https://t.me/share/url?url=${enc(url)}&text=${enc(title)}`,
  },
];
