import type { Category } from "./categories";
import type { Lang, NewsDay, NewsFeed, NewsItem, NewsSeed, SourceResult } from "./types";

/**
 * The headline files as the static site serves them (`npm run fetch` writes them, the build and the
 * board read them): about a tenth smaller than plain NewsItem objects, which repeat the outlet's id,
 * name and language on every headline and spell out every time.
 *
 * They live in a folder of their own (DATA_DIR): a page still open on the code from before a format
 * change keeps asking for the old files, and fails to find them instead of misreading the new ones.
 */
export const DATA_DIR = "/data/v2";

/**
 * A headline: its title, link and section, then its publish and first-seen times in seconds since
 * 1970 (0 for none; trailing ones left out). The outlet is the one it is listed under. The fetch's own
 * day archive (.data/days) also has its picture, or "" when it was looked for and none found (see
 * NewsItem.image); the files the site serves leave it out (see withoutPictures).
 */
export type PackedItem = [title: string, link: string, category: Category, publishedAt?: number, seenAt?: number, image?: string];

/** A source's headlines, with the outlet given once. */
export interface PackedSource {
  sourceId: string;
  sourceName: string;
  /** The outlet's language (unset when it has no headlines). */
  lang?: Lang;
  items: PackedItem[];
}

/** A source's result (SourceResult) with its headlines packed. */
export type PackedResult = Omit<SourceResult, "items"> & Pick<PackedSource, "lang" | "items">;

/** `news.json`: NewsFeed, packed. */
export type PackedFeed = Omit<NewsFeed, "results"> & { results: PackedResult[] };

/** `head/<all|category>.json`: NewsSeed, packed. */
export type PackedSeed = Omit<NewsSeed, "results"> & { results: PackedResult[] };

/** `days/<date>.json`: NewsDay, packed: the day's headlines by outlet, each outlet's newest first. */
export interface PackedDay {
  date: string;
  sources: PackedSource[];
}

/**
 * A run of a source's headlines in the build before, unchanged and in the same order: [from, count],
 * by their place in its list.
 */
export type Run = [from: number, count: number];

/**
 * `delta.json`: how the build's news.json differs from the one before it (`from`), for a board that
 * has that one: each source's result, its headlines either new (packed) or runs of the ones it had.
 * A refresh downloads this instead of the whole feed again (see applyDelta).
 */
export type FeedDelta = Omit<NewsFeed, "results" | "generatedAt"> & {
  from: string;
  generatedAt: string;
  results: (Omit<PackedResult, "items"> & { items: (PackedItem | Run)[] })[];
};

const toSeconds = (iso: string | undefined) => (iso ? Date.parse(iso) / 1000 : 0);
const toIso = (seconds: number | undefined) => (seconds ? new Date(Math.round(seconds * 1000)).toISOString() : undefined);

/** `withPicture`: for the fetch's own archive (packDay); the board's files have no pictures. */
export function packItem(it: NewsItem, withPicture = false): PackedItem {
  const packed: PackedItem = [it.title, it.link, it.category, toSeconds(it.publishedAt), toSeconds(it.seenAt)];
  if (withPicture && it.image !== undefined) {
    packed.push(it.image ?? "");
    return packed;
  }
  while (packed.length > 3 && !packed[packed.length - 1]) packed.pop();
  return packed;
}

export function unpackItem(
  [title, link, category, publishedAt, seenAt, image]: PackedItem,
  { sourceId, sourceName, lang }: Pick<PackedSource, "sourceId" | "sourceName" | "lang">,
): NewsItem {
  const item: NewsItem = { title, link, sourceId, sourceName, lang: lang ?? "bn", category };
  const published = toIso(publishedAt);
  const seen = toIso(seenAt);
  if (published) item.publishedAt = published;
  if (seen) item.seenAt = seen;
  if (image !== undefined) item.image = image || null;
  return item;
}

function packResult({ items, ...status }: SourceResult): PackedResult {
  return { ...status, ...(items[0] && { lang: items[0].lang }), items: items.map((it) => packItem(it)) };
}

function unpackResult({ items, lang, ...status }: PackedResult): SourceResult {
  return { ...status, items: items.map((it) => unpackItem(it, { ...status, lang })) };
}

export function packFeed<T extends NewsFeed>(feed: T): Omit<T, "results"> & { results: PackedResult[] } {
  return { ...feed, results: feed.results.map(packResult) };
}

export function unpackFeed<T extends PackedFeed>(feed: T): Omit<T, "results"> & { results: SourceResult[] } {
  return { ...feed, results: feed.results.map(unpackResult) };
}

/** A day's headlines by outlet, in their order (newest first, as NewsDay keeps them), with their pictures. */
export function packDay({ date, items }: NewsDay): PackedDay {
  const sources = new Map<string, PackedSource>();
  for (const it of items) {
    let source = sources.get(it.sourceId);
    if (!source) sources.set(it.sourceId, (source = { sourceId: it.sourceId, sourceName: it.sourceName, lang: it.lang, items: [] }));
    source.items.push(packItem(it, true));
  }
  return { date, sources: [...sources.values()] };
}

/**
 * A packed day as the site serves it: without the pictures (the search reads these files; the share
 * index has the pictures).
 */
export function withoutPictures({ date, sources }: PackedDay): PackedDay {
  return {
    date,
    sources: sources.map((s) => ({
      ...s,
      items: s.items.map((it) => {
        if (it.length < 6) return it;
        const packed = it.slice(0, 5) as PackedItem;
        while (packed.length > 3 && !packed[packed.length - 1]) packed.pop();
        return packed;
      }),
    })),
  };
}

/**
 * A day file, newest first; also one written before the files were packed (`items` of NewsItem), as the
 * fetch's archive and the live site have them until a run has replaced them.
 */
export function unpackDay(day: PackedDay | NewsDay): NewsDay {
  if ("items" in day) return day;
  const items = day.sources.flatMap((source) => source.items.map((it) => unpackItem(it, source)));
  // Stable: an outlet's headlines with the same time keep their order.
  items.sort((a, b) => byTime(b) - byTime(a));
  return { date: day.date, items };
}

const byTime = (it: NewsItem) => Date.parse(it.publishedAt ?? it.seenAt ?? "") || 0;

/** The same headline, as the files have it: same text, link, section and times. */
const sameItem = (a: PackedItem, b: PackedItem) => a.length === b.length && a.every((v, i) => v === b[i]);

/** How `next` differs from `prev` (see FeedDelta): what a board that has `prev` needs to have `next`. */
export function makeDelta(prev: NewsFeed, next: NewsFeed): FeedDelta {
  const before = new Map(prev.results.map((r) => [r.sourceId, r.items.map((it) => packItem(it))]));
  const results = next.results.map((result) => {
    const { items, ...status } = packResult(result);
    const old = before.get(result.sourceId) ?? [];
    const place = new Map(old.map((it, i) => [it[1], i]));
    const out: (PackedItem | Run)[] = [];
    for (const it of items) {
      const at = place.get(it[1]);
      if (at === undefined || !sameItem(old[at], it)) {
        out.push(it);
        continue;
      }
      const last = out[out.length - 1];
      if (last && typeof last[0] === "number" && (last as Run)[0] + (last as Run)[1] === at) (last as Run)[1]++;
      else out.push([at, 1]);
    }
    return { ...status, items: out };
  });
  const { results: _r, generatedAt, ...rest } = next; // eslint-disable-line @typescript-eslint/no-unused-vars
  return { ...rest, from: prev.generatedAt, generatedAt, results };
}

/**
 * The feed `delta` leads to, from the one it was made against (`base`, with its sources' headlines as
 * that build listed them). Null when `base` isn't that build, or doesn't fit it: then the whole feed is
 * the way to get there. Headlines `base` already had are the same objects.
 */
export function applyDelta(
  base: Pick<NewsFeed, "generatedAt"> & { results: Iterable<SourceResult> },
  delta: FeedDelta,
): NewsFeed | null {
  if (delta.from !== base.generatedAt) return null;
  const before = new Map([...base.results].map((r) => [r.sourceId, r.items]));
  const results: SourceResult[] = [];
  for (const { items, lang, ...status } of delta.results) {
    const old = before.get(status.sourceId) ?? [];
    const out: NewsItem[] = [];
    for (const entry of items) {
      if (typeof entry[0] === "number") {
        const [from, count] = entry as Run;
        if (from < 0 || count < 1 || from + count > old.length) return null;
        for (let i = from; i < from + count; i++) out.push(old[i]);
      } else {
        out.push(unpackItem(entry as PackedItem, { ...status, lang }));
      }
    }
    results.push({ ...status, items: out });
  }
  const { from: _f, results: _r, ...rest } = delta; // eslint-disable-line @typescript-eslint/no-unused-vars
  return { ...rest, results };
}
