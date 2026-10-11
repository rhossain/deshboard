import { CATEGORIES } from "./categories";
import { dedupeByLink } from "./fetchers/utils";
import { SITE_NAME, SITE_URL } from "./site";
import { itemTime, newestFirst } from "./stories";
import type { NewsFeed, NewsItem, Video, VideoFeed } from "./types";

/** Items in each feed: enough for a reader polling every few hours. */
const ITEMS = 50;

/** RSS for a page's newest headlines or videos. `path` is the page; the feed is `path` + feed.xml. */
interface Channel {
  title: string;
  description: string;
  path: string;
  updated?: string;
  /** `source` is the outlet that published it, `category` its section. */
  items: { title: string; link: string; time?: string; source: string; category?: string }[];
}

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const date = (iso: string) => new Date(iso).toUTCString();

function rss(c: Channel): Response {
  const page = `${SITE_URL}${c.path}`;
  const items = c.items
    .map(
      (it) => `    <item>
      <title>${escape(it.title)}</title>
      <link>${escape(it.link)}</link>
      <description>${escape([it.source, it.category].filter(Boolean).join(" · "))}</description>
      <guid isPermaLink="true">${escape(it.link)}</guid>${it.time ? `\n      <pubDate>${date(it.time)}</pubDate>` : ""}${it.category ? `\n      <category>${escape(it.category)}</category>` : ""}
    </item>`,
    )
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escape(c.title)}</title>
    <link>${escape(page)}</link>
    <description>${escape(c.description)}</description>
    <language>bn</language>${c.updated ? `\n    <lastBuildDate>${date(c.updated)}</lastBuildDate>` : ""}
    <ttl>15</ttl>
    <atom:link href="${escape(`${page}feed.xml`)}" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}

const LABEL = new Map(CATEGORIES.map((c) => [c.id, c.label]));

/** The newest headlines, each once (two outlets can list the same story), in one section when given. */
export function headlinesRss(
  feed: NewsFeed | undefined,
  channel: Omit<Channel, "items" | "updated">,
  inSection?: (it: NewsItem) => boolean,
): Response {
  const items = dedupeByLink((feed?.results ?? []).flatMap((r) => r.items))
    .filter((it) => itemTime(it) && (!inSection || inSection(it)))
    .sort((a, b) => newestFirst(itemTime(a), itemTime(b)))
    .slice(0, ITEMS);
  return rss({
    ...channel,
    updated: feed?.generatedAt,
    items: items.map((it) => ({
      title: it.title,
      link: it.link,
      // Never in the future: a portal's clock or time zone can be off.
      time: feed && itemTime(it)! > feed.generatedAt ? feed.generatedAt : itemTime(it),
      source: it.sourceName,
      category: LABEL.get(it.category),
    })),
  });
}

/** The newest videos, linking to YouTube. */
export function videosRss(feed: VideoFeed | undefined, channel: Omit<Channel, "items" | "updated">): Response {
  const names = new Map(feed?.channels.map((c) => [c.id, c.name]));
  return rss({
    ...channel,
    updated: feed?.generatedAt,
    items: (feed?.videos ?? []).slice(0, ITEMS).map((v: Video) => ({
      title: v.title,
      link: `https://www.youtube.com/watch?v=${v.id}`,
      time: v.publishedAt,
      source: names.get(v.channel) ?? v.channel,
    })),
  });
}

/** For a page's <link rel="alternate">: its feed's address and title. */
export function feedLink(path: string, title: string) {
  return { "application/rss+xml": [{ url: `${path}feed.xml`, title: `${title} · ${SITE_NAME}` }] };
}
