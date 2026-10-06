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
}

/** A logo's pixel size, and whether it is light on a transparent background (made for a dark header). */
export interface LogoShape {
  width: number;
  height: number;
  light: boolean;
}
