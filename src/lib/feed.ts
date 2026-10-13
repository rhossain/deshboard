import type { Category } from "./categories";
import { dedupeByLink } from "./fetchers/utils";
import { cachedLogoShapes } from "./logos";
import { cachedResult, forBoard } from "./news";
import { seedResults } from "./site";
import { ACTIVE_SOURCES } from "./sources";
import { ageSteps, itemTime } from "./stories";

/**
 * The server's cached headlines, trimmed to a few per source (in `category` only, when given) for
 * rendering into the page, with the whole cache's section and card counts, headline ages and the logos'
 * measurements. `fullCards` as in seedResults: /api/news/head gives every source a full card. Never
 * fetches; undefined while nothing is cached yet.
 */
export function cachedSeed(category?: Category, fullCards?: number) {
  const results = cachedResults();
  if (!results.length) return undefined;
  const generatedAt = new Date().toISOString();
  // Counted as the board counts them: every headline once, however many outlets list it.
  const all = dedupeByLink(results.flatMap((r) => r.items));
  const counts: Partial<Record<Category, number>> = {};
  const totals: Record<string, number> = {};
  for (const it of all) {
    counts[it.category] = (counts[it.category] ?? 0) + 1;
    if (!category || it.category === category) totals[it.sourceId] = (totals[it.sourceId] ?? 0) + 1;
  }
  return {
    generatedAt,
    results: seedResults(results, category, fullCards),
    counts,
    category,
    totals,
    ages: ageSteps(category ? all.filter((it) => it.category === category) : all, generatedAt),
    logoShapes: cachedLogoShapes(),
  };
}

/** The board's share of each source's cache, so the counts match what it will load. */
export function cachedResults() {
  return ACTIVE_SOURCES.flatMap((s) => {
    const result = cachedResult(s.id);
    return result ? [forBoard(result)] : [];
  });
}

/**
 * Each section's newest cached headline time, for the sitemap. Times in the future (a portal's clock
 * or time zone gone wrong) count as now.
 */
export function cachedNewestByCategory(): Partial<Record<Category, string>> {
  const now = Date.now();
  const newest: Partial<Record<Category, string>> = {};
  for (const it of cachedResults().flatMap((r) => r.items)) {
    const t = Date.parse(itemTime(it) ?? "");
    if (Number.isNaN(t)) continue;
    const at = new Date(Math.min(t, now)).toISOString();
    if (!newest[it.category] || at > newest[it.category]!) newest[it.category] = at;
  }
  return newest;
}
