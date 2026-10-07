import type { Category } from "./categories";

export type Lang = "bn" | "en";

/** How a source is fetched. `unclear` and `unavailable` are kept for reference but not fetched. */
export type Method = "rss" | "sitemap" | "html" | "unclear" | "unavailable";

export interface NewsSource {
  id: string;
  name: string;
  lang: Lang;
  kind: "Newspaper" | "Online" | "TV" | "Agency";
  homepage: string;
  method: Method;
  /** Feed / sitemap / page URL. May contain `{YYYY-MM-DD}` (Dhaka date). */
  url?: string;
  /** HTML sources only: regex tested against the article URL's pathname. */
  articlePattern?: string;
  /** The feed writes Dhaka wall-clock time but labels it UTC; its dates are shifted back 6 hours. */
  dhakaTimeAsUtc?: boolean;
  notes?: string;
}

export interface NewsItem {
  title: string;
  link: string;
  /** ISO string, when the source provides a date. */
  publishedAt?: string;
  /**
   * ISO string: when Deshboard first saw the headline, for items the source gives no date. Unset for
   * headlines that were already on the page when the source was first fetched (their age is unknown).
   */
  seenAt?: string;
  sourceId: string;
  sourceName: string;
  lang: Lang;
  category: Category;
}

export interface SourceResult {
  sourceId: string;
  sourceName: string;
  method: Method;
  ok: boolean;
  count: number;
  error?: string;
  fetchedUrl?: string;
  durationMs: number;
  fetchedAt: string;
  items: NewsItem[];
}

export type SourceStatus = Omit<SourceResult, "items">;

/** One line of the NDJSON stream from /api/news/stream. */
export type NewsStreamMessage = { type: "source"; result: SourceResult } | { type: "done"; generatedAt: string };

/** A logo's pixel size, and whether it is light on a transparent background (made for a dark header). */
export interface LogoShape {
  width: number;
  height: number;
  light: boolean;
}

/** A news channel on YouTube, for the Videos view (see src/lib/channels.ts). */
export interface VideoChannel {
  id: string;
  name: string;
  /** The YouTube channel ID ("UC…"): its feed is youtube.com/feeds/videos.xml?channel_id=… */
  youtubeId: string;
}

export interface Video {
  /** The YouTube video ID: the thumbnail, player and watch page are all built from it. */
  id: string;
  /** VideoChannel id. */
  channel: string;
  title: string;
  /** ISO string. */
  publishedAt: string;
  views?: number;
}

/** `/api/videos`: the Videos view, only requested when it is opened. */
export interface VideoFeed {
  generatedAt: string;
  /** Every channel in display order, with how its latest fetch went. */
  channels: (Pick<VideoChannel, "id" | "name"> & { ok: boolean; error?: string })[];
  /** The last day's videos, newest first, Shorts left out. */
  videos: Video[];
}
