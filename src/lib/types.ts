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
