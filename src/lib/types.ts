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
  /** "google-news": the site refused us (`directError`), so its headlines came from Google News. */
  via?: "google-news";
  /** Why the site's own feed or page failed, when its headlines came from elsewhere. */
  directError?: string;
  /** Why the Google News fallback failed too, when it did (`error` is then the site's own failure). */
  fallbackError?: string;
  fetchedUrl?: string;
  durationMs: number;
  fetchedAt: string;
  items: NewsItem[];
}

export type SourceStatus = Omit<SourceResult, "items">;

/** `/data/news.json`: what the board reads, written by `npm run fetch` before each build. */
export interface NewsFeed {
  generatedAt: string;
  /** Every fetched source's latest result, in display order. */
  results: SourceResult[];
  /** Source id → logo path under `/logos/`, for sources whose logo was found. */
  logos: Record<string, string>;
  /** Source id → the logo's measurements, so it is drawn at its final size on first paint. */
  logoShapes: Record<string, LogoShape>;
}

/** The feed as prerendered into a page: a few headlines per source (see seedResults). */
export interface NewsSeed extends NewsFeed {
  /** Headlines per section in the whole feed, so the section tabs start out with their final counts. */
  counts: Partial<Record<Category, number>>;
  /** The section the page is for, if any: `totals` count only its headlines. */
  category?: Category;
  /** Source id → its headlines in the whole feed, so each card starts out at its final size. */
  totals: Record<string, number>;
}

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

/** `/data/videos.json`: the Videos view, written by `npm run fetch` and only loaded when it is opened. */
export interface VideoFeed {
  generatedAt: string;
  /** Every channel in display order, with how its latest fetch went. */
  channels: (Pick<VideoChannel, "id" | "name"> & { ok: boolean; error?: string })[];
  /** The last day's videos, newest first, Shorts left out. */
  videos: Video[];
}
