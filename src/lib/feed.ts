import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { Category } from "./categories";
import { dedupeByLink } from "./fetchers/utils";
import { seedResults } from "./site";
import { ageSteps, itemTime } from "./stories";
import type { NewsFeed, NewsSeed, VideoFeed } from "./types";

/**
 * The feed from `npm run fetch`, trimmed to a few headlines per source (in `category` only, when
 * given) for prerendering into the page. Undefined when nothing has been fetched yet.
 */
export function readSeed(category?: Category): NewsSeed | undefined {
  const feed = readFeed();
  return feed && toSeed(feed, category);
}

/** Part of `feed` for a page (see NewsSeed); `fullCards` as in seedResults. */
export function toSeed(feed: NewsFeed, category?: Category, fullCards?: number): NewsSeed {
  // Counted as the board counts them: every headline once, however many outlets list it.
  const all = dedupeByLink(feed.results.flatMap((r) => r.items));
  const counts: NewsSeed["counts"] = {};
  const totals: NewsSeed["totals"] = {};
  for (const it of all) {
    counts[it.category] = (counts[it.category] ?? 0) + 1;
    if (!category || it.category === category) totals[it.sourceId] = (totals[it.sourceId] ?? 0) + 1;
  }
  return {
    ...feed,
    results: seedResults(feed.results, category, fullCards),
    counts,
    category,
    totals,
    ages: ageSteps(category ? all.filter((it) => it.category === category) : all, feed.generatedAt),
  };
}

const parsed = new Map<string, { mtimeMs: number; data: unknown }>();

/**
 * A file under public/data, parsed once per version of it: a build reads news.json for every page (a
 * few MB each time). Callers must not change what they get.
 */
function readData<T>(name: string): T | undefined {
  const file = path.join(process.cwd(), "public", "data", name);
  try {
    const { mtimeMs } = statSync(file);
    const hit = parsed.get(file);
    if (hit?.mtimeMs === mtimeMs) return hit.data as T;
    const data = JSON.parse(readFileSync(file, "utf8")) as T;
    parsed.set(file, { mtimeMs, data });
    return data;
  } catch {
    return undefined;
  }
}

/** The whole feed from `npm run fetch`, or undefined when nothing has been fetched yet. */
export function readFeed(): NewsFeed | undefined {
  return readData<NewsFeed>("news.json");
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

/** Cards prerendered into the Videos page: its first screenful (VideoBoard's first page). */
const SEED_CARDS = 24;

/**
 * The videos feed from `npm run fetch`, trimmed to its first few cards for prerendering into the
 * Videos page: the newest videos, with every video of their stories (Video.story), so the cards are
 * whole and don't grow when the rest of the feed arrives. Undefined when nothing has been fetched yet.
 */
export function readVideoSeed(): VideoFeed | undefined {
  const feed = readVideos();
  if (!feed) return undefined;
  const stories = new Set<string>();
  const lone = new Set<string>();
  for (const v of feed.videos) {
    if (stories.size + lone.size >= SEED_CARDS) break;
    if (v.story) stories.add(v.story);
    else lone.add(v.id);
  }
  const counts: Record<string, number> = {};
  for (const v of feed.videos) counts[v.channel] = (counts[v.channel] ?? 0) + 1;
  return { ...feed, videos: feed.videos.filter((v) => lone.has(v.id) || (!!v.story && stories.has(v.story))), counts };
}

/** The whole videos feed from `npm run fetch`, or undefined when nothing has been fetched yet. */
export function readVideos(): VideoFeed | undefined {
  return readData<VideoFeed>("videos.json");
}
