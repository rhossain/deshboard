import { readFileSync } from "node:fs";
import path from "node:path";
import type { Category } from "./categories";
import { dedupeByLink } from "./fetchers/utils";
import { seedResults } from "./site";
import { itemTime } from "./stories";
import type { NewsFeed, NewsSeed, VideoFeed } from "./types";

/**
 * The feed from `npm run fetch`, trimmed to a few headlines per source (in `category` only, when
 * given) for prerendering into the page. Undefined when nothing has been fetched yet.
 */
export function readSeed(category?: Category): NewsSeed | undefined {
  const feed = readFeed();
  if (!feed) return undefined;
  // Counted as the board counts them: every headline once, however many outlets list it.
  const counts: NewsSeed["counts"] = {};
  const totals: NewsSeed["totals"] = {};
  for (const it of dedupeByLink(feed.results.flatMap((r) => r.items))) {
    counts[it.category] = (counts[it.category] ?? 0) + 1;
    if (!category || it.category === category) totals[it.sourceId] = (totals[it.sourceId] ?? 0) + 1;
  }
  return { ...feed, results: seedResults(feed.results, category), counts, category, totals };
}

/** The whole feed from `npm run fetch`, or undefined when nothing has been fetched yet. */
export function readFeed(): NewsFeed | undefined {
  try {
    return JSON.parse(readFileSync(path.join(process.cwd(), "public", "data", "news.json"), "utf8")) as NewsFeed;
  } catch {
    return undefined;
  }
}

/**
 * Each section's newest headline time, for the sitemap. Times later than the fetch (a portal's clock
 * or time zone gone wrong) count as the fetch time.
 */
export function newestByCategory(feed: NewsFeed): Partial<Record<Category, string>> {
  const newest: Partial<Record<Category, string>> = {};
  for (const it of feed.results.flatMap((r) => r.items)) {
    const t = Date.parse(itemTime(it) ?? "");
    if (Number.isNaN(t)) continue;
    const at = new Date(Math.min(t, Date.parse(feed.generatedAt))).toISOString();
    if (!newest[it.category] || at > newest[it.category]!) newest[it.category] = at;
  }
  return newest;
}

/** Videos prerendered into the Videos page: its first screenful (VideoBoard's first page). */
const SEED_VIDEOS = 24;

/**
 * The videos feed from `npm run fetch`, trimmed to its newest few for prerendering into the Videos
 * page. Undefined when nothing has been fetched yet.
 */
export function readVideoSeed(): VideoFeed | undefined {
  const feed = readVideos();
  return feed && { ...feed, videos: feed.videos.slice(0, SEED_VIDEOS) };
}

/** The whole videos feed from `npm run fetch`, or undefined when nothing has been fetched yet. */
export function readVideos(): VideoFeed | undefined {
  try {
    return JSON.parse(readFileSync(path.join(process.cwd(), "public", "data", "videos.json"), "utf8")) as VideoFeed;
  } catch {
    return undefined;
  }
}
