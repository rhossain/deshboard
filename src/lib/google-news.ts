import { FetchError, fetchText } from "./fetchers/http";
import { googleNewsFeedUrl, looksLikeArticle, parseGoogleNewsFeed, resolveArticle, siteHost } from "./fetchers/google-news";
import type { RawItem } from "./fetchers/rss";
import { readStore, writeStoreSoon } from "./store";
import type { NewsSource } from "./types";

/**
 * The fallback for a source whose own site refuses us: its last day of articles from Google News,
 * with each article's real address (so sections, sharing and duplicate checks work as for any
 * other source). Finding an address takes two requests to Google, so addresses are kept on disk
 * and looked up within a budget: newest articles first, a share for every source, and a pause if
 * Google asks us to slow down. Articles still waiting for their address appear on a later fetch.
 */

const STORE = "google-news-links";
/** Articles shown per source, newest first. */
const PER_SOURCE = 30;
/** Address lookups per source per fetch, so one busy site can't use up the budget. */
const LOOKUPS_PER_SOURCE = 10;
/**
 * Address lookups in any ten minutes, across all sources: enough for every fallback source's first
 * fetch (some 33 sites × LOOKUPS_PER_SOURCE), so none is left empty while the cache fills.
 */
const BUDGET = 400;
const BUDGET_WINDOW_MS = 10 * 60_000;
/** Lookups running at once. */
const CONCURRENCY = 3;
/** A lookup that failed is tried again after this long. */
const RETRY_FAILED_MS = 60 * 60_000;
/** Addresses are kept this long (the feed only lists the last day). */
const KEEP_MS = 3 * 24 * 3600_000;

/** An article's address, or a failed lookup (no `url`), and when. */
type Link = { url?: string; at: number };

// Shared by every source in one process (and kept across hot reloads in dev).
const g = globalThis as unknown as {
  __googleLinks?: Record<string, Link>;
  __googleBudget?: { since: number; used: number; pausedUntil: number };
  __googleSlots?: { running: number; waiting: (() => void)[] };
};
const links = (g.__googleLinks ??= readStore<Record<string, Link>>(STORE, {}));
const budget = (g.__googleBudget ??= { since: 0, used: 0, pausedUntil: 0 });
const slots = (g.__googleSlots ??= { running: 0, waiting: [] });

/** One lookup from the budget, if any are left. */
function takeLookup(now = Date.now()): boolean {
  if (now < budget.pausedUntil) return false;
  if (now - budget.since >= BUDGET_WINDOW_MS) Object.assign(budget, { since: now, used: 0 });
  if (budget.used >= BUDGET) return false;
  budget.used++;
  return true;
}

async function inSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (slots.running >= CONCURRENCY) await new Promise<void>((resolve) => slots.waiting.push(resolve));
  slots.running++;
  try {
    return await fn();
  } finally {
    slots.running--;
    slots.waiting.shift()?.();
  }
}

/**
 * Looks up an article's address, keeping the answer; only an article on the source's own site
 * counts (not the homepage or a section page).
 */
async function lookUp(id: string, host: string): Promise<void> {
  try {
    const url = await inSlot(() => resolveArticle(id));
    links[id] = siteHost(url) === host && looksLikeArticle(url) ? { url, at: Date.now() } : { at: Date.now() };
  } catch (err) {
    links[id] = { at: Date.now() };
    // Google is limiting us: stop looking up until the window is over.
    if (err instanceof FetchError && err.status === 429) budget.pausedUntil = Date.now() + BUDGET_WINDOW_MS;
  }
}

function prune(now = Date.now()): void {
  for (const [id, link] of Object.entries(links)) if (now - link.at > KEEP_MS) delete links[id];
}

/** The source's articles from Google News; throws when it has none we can show yet. */
export async function googleNewsFallback(source: NewsSource): Promise<{ items: RawItem[]; url: string }> {
  const url = googleNewsFeedUrl(source.homepage, source.lang);
  const host = siteHost(source.homepage);
  const res = await fetchText(url, { accept: "application/rss+xml, application/xml, text/xml, */*" });
  const entries = parseGoogleNewsFeed(res.text, host)
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
    .slice(0, PER_SOURCE);
  if (!entries.length) throw new Error("Google News has no headlines from this site in the last day");

  const now = Date.now();
  const due = entries
    .filter(({ id }) => !links[id] || (!links[id].url && now - links[id].at > RETRY_FAILED_MS))
    .slice(0, LOOKUPS_PER_SOURCE)
    .filter(() => takeLookup(now));
  await Promise.all(due.map(({ id }) => lookUp(id, host)));
  prune(now);
  writeStoreSoon(STORE, () => links);

  const items = entries.flatMap(({ id, title, publishedAt }) => {
    const link = links[id]?.url;
    // (Checked again here for addresses kept from before the check existed.)
    return link && looksLikeArticle(link) ? [{ title, link, publishedAt }] : [];
  });
  if (!items.length) throw new Error("Google News lists this site's headlines, but their addresses aren't known yet");
  return { items, url };
}
