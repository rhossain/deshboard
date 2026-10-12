import { channelName, sourceName } from "./bn-names";
import { CATEGORIES, type Category } from "./categories";
import { CHANNELS } from "./channels";
import { type Locale, localDigits, localePath } from "./i18n";
import { ACTIVE_SOURCES } from "./sources";
import { itemTime, newestFirst } from "./stories";
import type { Lang, LogoShape, NewsFeed, NewsItem, NewsSource, Video, VideoChannel, VideoFeed } from "./types";

/** An outlet with a page of its own: a news site (with its station's channel, if read) or a channel alone. */
export interface Outlet {
  id: string;
  name: string;
  source?: NewsSource;
  channel?: VideoChannel;
}

const ACTIVE_IDS = new Set(ACTIVE_SOURCES.map((s) => s.id));
const CHANNEL_OF_SITE = new Map(CHANNELS.filter((c) => c.site).map((c) => [c.site!, c]));

/** Every outlet with a page: the news sites in display order, then the channels with no site here. */
export const OUTLETS: Outlet[] = [
  ...ACTIVE_SOURCES.map((s) => ({ id: s.id, name: s.name, source: s, channel: CHANNEL_OF_SITE.get(s.id) })),
  ...CHANNELS.filter((c) => !c.site || !ACTIVE_IDS.has(c.site)).map((c) => ({ id: c.id, name: c.name, channel: c })),
];

/** An outlet's own page, in `locale`. */
export const outletPath = (id: string, locale: Locale = "en") => localePath(`/sources/${id}/`, locale);

/** An outlet's name in the page's language. */
export function outletName(o: Outlet, locale: Locale = "en"): string {
  return o.source ? sourceName(o.source.id, o.name, locale) : channelName(o.channel!.id, o.name, locale);
}

/** What the current feeds hold from an outlet, newest first, and the time of its newest item. */
export function outletContent(
  o: Outlet,
  feed?: NewsFeed,
  videoFeed?: VideoFeed,
): { headlines: NewsItem[]; videos: Video[]; updated?: string } {
  const headlines = (feed?.results.find((r) => r.sourceId === o.source?.id)?.items ?? [])
    .slice()
    .sort((a, b) => newestFirst(itemTime(a), itemTime(b)));
  const videos = videoFeed?.videos.filter((v) => v.channel === o.channel?.id) ?? [];
  const newest = [headlines[0] && itemTime(headlines[0]), videos[0]?.publishedAt].filter((t): t is string => !!t);
  // Capped at the fetch time: a portal's clock or time zone can put a headline in the future.
  const cap = feed?.generatedAt ?? videoFeed?.generatedAt;
  const updated = newest.sort().at(-1);
  return { headlines, videos, updated: updated && cap && updated > cap ? cap : updated };
}

/** One outlet on the sources page: a news site, a TV channel on YouTube, or a station with both. */
export interface DirectoryEntry {
  id: string;
  name: string;
  /** What it is, e.g. "Newspaper · Bangla". */
  label: string;
  /** One line from the current feeds: how much of it is on the board, and on what. */
  summary: string;
  homepage?: string;
  logo?: string;
  logoShape?: LogoShape;
  /** Its own page (see OUTLETS). */
  href: string;
  /** The board showing only this outlet's headlines. */
  boardHref?: string;
  youtubeId?: string;
}

export interface DirectoryGroup {
  id: string;
  title: string;
  entries: DirectoryEntry[];
}

const KIND: Record<Locale, Record<NewsSource["kind"], string>> = {
  en: { Newspaper: "Newspaper", Online: "Online news site", TV: "TV station", Agency: "News agency" },
  bn: { Newspaper: "সংবাদপত্র", Online: "অনলাইন সংবাদ সাইট", TV: "টিভি স্টেশন", Agency: "সংবাদ সংস্থা" },
};
const LANG: Record<Locale, Record<Lang, string>> = {
  en: { bn: "Bangla", en: "English" },
  bn: { bn: "বাংলা", en: "ইংরেজি" },
};
const LABEL: Record<Locale, Map<Category, string>> = {
  en: new Map(CATEGORIES.map((c) => [c.id, c.label.toLowerCase()])),
  bn: new Map(CATEGORIES.map((c) => [c.id, c.bn])),
};
const CHANNEL_LABEL: Record<Locale, string> = { en: "TV news channel · YouTube", bn: "টিভি সংবাদ চ্যানেল · ইউটিউব" };

/** "a, b and c", "ক, খ ও গ". */
function list(words: string[], locale: Locale): string {
  const and = locale === "bn" ? "ও" : "and";
  return words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} ${and} ${words.at(-1)}`;
}

function plural(n: number, word: string): string {
  return `${n.toLocaleString("en-US")} ${word}${n === 1 ? "" : "s"}`;
}

/** "127 headlines on the board now, most on national, politics and sports." */
function headlineSummary(items: { category: Category }[], locale: Locale): string {
  const bn = locale === "bn";
  if (!items.length) return bn ? "এই মুহূর্তে বোর্ডে কোনো শিরোনাম নেই।" : "No headlines on the board right now.";
  const counts = new Map<Category, number>();
  for (const it of items) if (it.category !== "other") counts.set(it.category, (counts.get(it.category) ?? 0) + 1);
  const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c]) => LABEL[locale].get(c)!);
  if (bn) {
    const n = localDigits(items.length.toLocaleString("en-US"), locale);
    return `বোর্ডে এখন ${n}টি শিরোনাম${top.length ? `, বেশির ভাগ ${list(top, locale)} বিষয়ে` : ""}।`;
  }
  return `${plural(items.length, "headline")} on the board now${top.length ? `, most on ${list(top, locale)}` : ""}.`;
}

function videoSummary(count: number | undefined, locale: Locale): string {
  if (count === undefined) return "";
  if (locale === "bn") {
    return count ? `গত এক দিনে ${localDigits(String(count), locale)}টি ভিডিও।` : "গত এক দিনে কোনো ভিডিও নেই।";
  }
  return count ? `${plural(count, "video")} in the last day.` : "No videos in the last day.";
}

const GROUP_TITLES: Record<Locale, Record<string, string>> = {
  en: {
    "bangla-newspapers": "Bangla newspapers",
    "english-newspapers": "English newspapers",
    online: "Online news sites",
    tv: "TV stations",
    agencies: "News agencies",
    "tv-channels": "More TV news channels",
  },
  bn: {
    "bangla-newspapers": "বাংলা সংবাদপত্র",
    "english-newspapers": "ইংরেজি সংবাদপত্র",
    online: "অনলাইন সংবাদ সাইট",
    tv: "টিভি স্টেশন",
    agencies: "সংবাদ সংস্থা",
    "tv-channels": "আরও টিভি সংবাদ চ্যানেল",
  },
};

/**
 * Every outlet Bartaboard reads, grouped for the sources page, with what the current feeds hold from
 * each. A station whose news site and YouTube channel are both read appears once, with both.
 */
export function buildDirectory(feed?: NewsFeed, videos?: VideoFeed, locale: Locale = "en"): DirectoryGroup[] {
  const items = new Map<string, { category: Category }[]>();
  for (const r of feed?.results ?? []) items.set(r.sourceId, r.items);
  const videoCounts = new Map<string, number>();
  if (videos) {
    for (const c of videos.channels) videoCounts.set(c.id, 0);
    for (const v of videos.videos) videoCounts.set(v.channel, (videoCounts.get(v.channel) ?? 0) + 1);
  }

  const site = (s: NewsSource): DirectoryEntry => {
    const channel = CHANNEL_OF_SITE.get(s.id);
    const videoLine = channel ? videoSummary(videoCounts.get(channel.id), locale) : "";
    return {
      id: s.id,
      name: sourceName(s.id, s.name, locale),
      label: `${KIND[locale][s.kind]} · ${LANG[locale][s.lang]}`,
      summary: [headlineSummary(items.get(s.id) ?? [], locale), videoLine].filter(Boolean).join(" "),
      href: outletPath(s.id, locale),
      homepage: s.homepage,
      logo: feed?.logos[s.id],
      logoShape: feed?.logoShapes?.[s.id],
      boardHref: localePath(`/?source=${s.id}`, locale),
      youtubeId: channel?.youtubeId,
    };
  };
  const channel = (c: VideoChannel): DirectoryEntry => ({
    id: c.id,
    name: channelName(c.id, c.name, locale),
    label: CHANNEL_LABEL[locale],
    summary: videoSummary(videoCounts.get(c.id), locale),
    href: outletPath(c.id, locale),
    youtubeId: c.youtubeId,
  });

  const of = (test: (s: NewsSource) => boolean) => ACTIVE_SOURCES.filter(test).map(site);
  const title = (id: string) => GROUP_TITLES[locale][id];
  return [
    { id: "bangla-newspapers", entries: of((s) => s.kind === "Newspaper" && s.lang === "bn") },
    { id: "english-newspapers", entries: of((s) => s.kind === "Newspaper" && s.lang === "en") },
    { id: "online", entries: of((s) => s.kind === "Online") },
    { id: "tv", entries: of((s) => s.kind === "TV") },
    { id: "agencies", entries: of((s) => s.kind === "Agency") },
    // Channels whose station has no news site among the ones read here.
    { id: "tv-channels", entries: OUTLETS.filter((o) => !o.source).map((o) => channel(o.channel!)) },
  ]
    .map((g) => ({ ...g, title: title(g.id) }))
    .filter((g) => g.entries.length);
}
