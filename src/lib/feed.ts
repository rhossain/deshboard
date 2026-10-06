import type { Category } from "./categories";
import { cachedResult } from "./news";
import { seedResults } from "./site";
import { ACTIVE_SOURCES } from "./sources";

/**
 * The server's cached headlines, trimmed to a few per source (in `category` only, when given) for
 * rendering into the page. Never fetches; undefined while nothing is cached yet.
 */
export function cachedSeed(category?: Category) {
  const results = ACTIVE_SOURCES.flatMap((s) => cachedResult(s.id) ?? []);
  if (!results.length) return undefined;
  return { generatedAt: new Date().toISOString(), results: seedResults(results, category) };
}
