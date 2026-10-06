import { readFileSync } from "node:fs";
import path from "node:path";
import type { Category } from "./categories";
import { seedResults } from "./site";
import type { NewsFeed } from "./types";

/**
 * The feed from `npm run fetch`, trimmed to a few headlines per source (in `category` only, when
 * given) for prerendering into the page. Undefined when nothing has been fetched yet.
 */
export function readSeed(category?: Category): NewsFeed | undefined {
  try {
    const feed = JSON.parse(readFileSync(path.join(process.cwd(), "public", "data", "news.json"), "utf8")) as NewsFeed;
    return { ...feed, results: seedResults(feed.results, category) };
  } catch {
    return undefined;
  }
}
