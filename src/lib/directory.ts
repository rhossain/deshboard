import { CATEGORIES, type Category } from "./categories";
import { CHANNELS } from "./channels";
import { ACTIVE_SOURCES } from "./sources";
import { itemTime, newestFirst } from "./stories";
import type { Lang, LogoShape, NewsItem, NewsSource, SourceResult, Video, VideoChannel, VideoFeed } from "./types";

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

/** An outlet's own page. */
export const outletPath = (id: string) => `/sources/${id}`;

/**
 * What the server's cache holds from an outlet, newest first, and the time of its newest item (never
 * later than now: a portal's clock or time zone can put a headline in the future).
 */
export function outletContent(
  o: Outlet,
  results: Pick<SourceResult, "sourceId" | "items">[],
  videoFeed?: VideoFeed,
  now = Date.now(),
): { headlines: NewsItem[]; videos: Video[]; updated?: string } {
  const headlines = (results.find((r) => r.sourceId === o.source?.id)?.items ?? [])
    .slice()
    .sort((a, b) => newestFirst(itemTime(a), itemTime(b)));
  const videos = videoFeed?.videos.filter((v) => v.channel === o.channel?.id) ?? [];
  const newest = [headlines[0] && itemTime(headlines[0]), videos[0]?.publishedAt]
    .map((t) => Date.parse(t ?? ""))
    .filter((t) => !Number.isNaN(t));
  return {
    headlines,
    videos,
    updated: newest.length ? new Date(Math.min(Math.max(...newest), now)).toISOString() : undefined,
  };
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

const KIND: Record<NewsSource["kind"], string> = {
  Newspaper: "Newspaper",
  Online: "Online news site",
  TV: "TV station",
  Agency: "News agency",
};
const LANG: Record<Lang, string> = { bn: "Bangla", en: "English" };
const LABEL = new Map(CATEGORIES.map((c) => [c.id, c.label.toLowerCase()]));

/** "a, b and c". */
function list(words: string[]): string {
  return words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

function plural(n: number, word: string): string {
  return `${n.toLocaleString("en-US")} ${word}${n === 1 ? "" : "s"}`;
}

/** "127 headlines on the board now, most on national, politics and sports." */
function headlineSummary(items: { category: Category }[]): string {
  if (!items.length) return "No headlines on the board right now.";
  const counts = new Map<Category, number>();
  for (const it of items) if (it.category !== "other") counts.set(it.category, (counts.get(it.category) ?? 0) + 1);
  const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c]) => LABEL.get(c)!);
  return `${plural(items.length, "headline")} on the board now${top.length ? `, most on ${list(top)}` : ""}.`;
}

function videoSummary(count: number | undefined): string {
  return count === undefined ? "" : count ? `${plural(count, "video")} in the last day.` : "No videos in the last day.";
}

/**
 * Every outlet Bartaboard reads, grouped for the sources page, with what the server's cache holds from
 * each (`results`, `logoShapes` for the logos measured so far, `videos`). A station whose news site and
 * YouTube channel are both read appears once, with both.
 */
export function buildDirectory(
  results: Pick<SourceResult, "sourceId" | "items">[],
  logoShapes: Record<string, LogoShape | null>,
  videos?: VideoFeed,
): DirectoryGroup[] {
  const items = new Map<string, { category: Category }[]>();
  for (const r of results) items.set(r.sourceId, r.items);
  const videoCounts = new Map<string, number>();
  if (videos) {
    for (const c of videos.channels) videoCounts.set(c.id, 0);
    for (const v of videos.videos) videoCounts.set(v.channel, (videoCounts.get(v.channel) ?? 0) + 1);
  }

  const site = (s: NewsSource): DirectoryEntry => {
    const channel = CHANNEL_OF_SITE.get(s.id);
    const videoLine = channel ? videoSummary(videoCounts.get(channel.id)) : "";
    return {
      id: s.id,
      name: s.name,
      label: `${KIND[s.kind]} · ${LANG[s.lang]}`,
      summary: [headlineSummary(items.get(s.id) ?? []), videoLine].filter(Boolean).join(" "),
      href: outletPath(s.id),
      homepage: s.homepage,
      // Only logos already measured, so the page never waits on fetching one.
      ...(logoShapes[s.id] && { logo: `/api/logo/${s.id}`, logoShape: logoShapes[s.id]! }),
      boardHref: `/?source=${s.id}`,
      youtubeId: channel?.youtubeId,
    };
  };
  const channel = (c: VideoChannel): DirectoryEntry => ({
    id: c.id,
    name: c.name,
    label: "TV news channel · YouTube",
    summary: videoSummary(videoCounts.get(c.id)),
    href: outletPath(c.id),
    youtubeId: c.youtubeId,
  });

  const of = (test: (s: NewsSource) => boolean) => ACTIVE_SOURCES.filter(test).map(site);
  return [
    { id: "bangla-newspapers", title: "Bangla newspapers", entries: of((s) => s.kind === "Newspaper" && s.lang === "bn") },
    { id: "english-newspapers", title: "English newspapers", entries: of((s) => s.kind === "Newspaper" && s.lang === "en") },
    { id: "online", title: "Online news sites", entries: of((s) => s.kind === "Online") },
    { id: "tv", title: "TV stations", entries: of((s) => s.kind === "TV") },
    { id: "agencies", title: "News agencies", entries: of((s) => s.kind === "Agency") },
    {
      id: "tv-channels",
      title: "More TV news channels",
      // Channels whose station has no news site among the ones read here.
      entries: OUTLETS.filter((o) => !o.source).map((o) => channel(o.channel!)),
    },
  ].filter((g) => g.entries.length);
}
