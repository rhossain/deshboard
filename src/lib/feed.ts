import { readFileSync } from "node:fs";
import path from "node:path";
import type { Category } from "./categories";
import { dedupeByLink } from "./fetchers/utils";
import { seedResults } from "./site";
import type { NewsFeed, NewsSeed } from "./types";

/**
 * The feed from `npm run fetch`, trimmed to a few headlines per source (in `category` only, when
 * given) for prerendering into the page. Undefined when nothing has been fetched yet.
 */
export function readSeed(category?: Category): NewsSeed | undefined {
  try {
    const feed = JSON.parse(readFileSync(path.join(process.cwd(), "public", "data", "news.json"), "utf8")) as NewsFeed;
    // Counted as the board counts them: every headline once, however many outlets list it.
    const counts: NewsSeed["counts"] = {};
    const totals: NewsSeed["totals"] = {};
    for (const it of dedupeByLink(feed.results.flatMap((r) => r.items))) {
      counts[it.category] = (counts[it.category] ?? 0) + 1;
      if (!category || it.category === category) totals[it.sourceId] = (totals[it.sourceId] ?? 0) + 1;
    }
    return { ...feed, results: seedResults(feed.results, category), counts, category, totals };
  } catch {
    return undefined;
  }
}
