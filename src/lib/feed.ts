import type { Category } from "./categories";
import { dedupeByLink } from "./fetchers/utils";
import { cachedLogoShapes } from "./logos";
import { cachedResult, forBoard } from "./news";
import { seedResults } from "./site";
import { ACTIVE_SOURCES } from "./sources";

/**
 * The server's cached headlines, trimmed to a few per source (in `category` only, when given) for
 * rendering into the page, with the whole cache's section and card counts and the logos' measurements. Never
 * fetches; undefined while nothing is cached yet.
 */
export function cachedSeed(category?: Category) {
  // The board's share of each source's cache, so the counts match what it will load.
  const results = ACTIVE_SOURCES.flatMap((s) => {
    const result = cachedResult(s.id);
    return result ? [forBoard(result)] : [];
  });
  if (!results.length) return undefined;
  // Counted as the board counts them: every headline once, however many outlets list it.
  const counts: Partial<Record<Category, number>> = {};
  const totals: Record<string, number> = {};
  for (const it of dedupeByLink(results.flatMap((r) => r.items))) {
    counts[it.category] = (counts[it.category] ?? 0) + 1;
    if (!category || it.category === category) totals[it.sourceId] = (totals[it.sourceId] ?? 0) + 1;
  }
  return {
    generatedAt: new Date().toISOString(),
    results: seedResults(results, category),
    counts,
    category,
    totals,
    logoShapes: cachedLogoShapes(),
  };
}
