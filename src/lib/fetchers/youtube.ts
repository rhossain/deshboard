import { looksLikeXml } from "./http";
import { asArray, cleanTitle, parseDate, textOf } from "./utils";
import { xmlParser } from "./xml";

export interface FeedVideo {
  id: string;
  title: string;
  publishedAt: string;
  views?: number;
}

type Node = Record<string, unknown>;

const BANGLA = /[ঀ-৿]/;

/**
 * A channel's uploads feed (youtube.com/feeds/videos.xml?channel_id=…, Atom): its latest 15 videos.
 * Shorts are left out: the feed links them as /shorts/… instead of /watch?v=….
 */
export function parseYouTubeFeed(xml: string): FeedVideo[] {
  if (!looksLikeXml(xml)) throw new Error("Response is not XML (probably an HTML error page)");
  const feed = (xmlParser.parse(xml) as Node).feed as Node | undefined;
  if (!feed) throw new Error("Not a YouTube feed");
  const videos: FeedVideo[] = [];
  for (const e of asArray(feed.entry as Node | Node[])) {
    const id = textOf(e.videoId);
    const raw = cleanTitle(e.title);
    const href = textOf((e.link as Node | undefined)?.["@_href"]);
    const publishedAt = parseDate(e.published);
    if (!id || !raw || !publishedAt || href.includes("/shorts/") || /#shorts\b/i.test(raw)) continue;
    const stats = ((e.group as Node | undefined)?.community as Node | undefined)?.statistics as Node | undefined;
    const views = Number(stats?.["@_views"]);
    videos.push({
      id,
      title: cleanVideoTitle(raw),
      publishedAt,
      ...(Number.isFinite(views) && views > 0 ? { views } : {}),
    });
  }
  return videos;
}

/**
 * Channels pad their titles for search: "খবর | Health Minister | News | Jamuna TV", hashtags,
 * "🛑 LIVE:". Keeps the Bangla parts ("খবর"); a title with none keeps its first part.
 */
export function cleanVideoTitle(raw: string): string {
  const s = raw
    .replace(/#\S+/g, " ")
    .replace(/[\u{1F000}-\u{1FAFF}☀-➿️]/gu, " ")
    .replace(/^\s*live\s*[:।|]?\s*/i, "");
  const parts = s
    .split(/\s*[|｜]\s*|\s+l\s+/)
    // "খবর। American Aircraft। ATN News": the danda as a separator, before English tags.
    .map((p) => p.replace(/(\s*।\s*[^ঀ-৿।]*)+$/u, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const bangla = parts.filter((p) => BANGLA.test(p));
  return (bangla.length ? bangla : parts.slice(0, 1)).join(" · ") || raw;
}
