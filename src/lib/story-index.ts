import { DATA_DIR } from "./packed";
import { shareKey } from "./share";
import { clusterStories, type Story, storiesOf } from "./stories";
import type { Lang, NewsFeed, NewsItem } from "./types";

/**
 * `stories.json`: the board's headlines grouped into stories at build time, so Top stories needn't group them on
 * the reader's phone. Grouping eleven thousand headlines (clusterTitles) takes half a second on a laptop and several
 * on a phone, with the page frozen meanwhile; `npm run fetch` does it once and writes the result beside news.json.
 *
 * Each language's stories are listed as the share keys (share.ts shareKey, 8 characters) of their headlines, the
 * lead first then newest first — the board has the headlines themselves, in the whole feed of the same build
 * (`generatedAt` says which), and only needs to know which go together. Bangla and English are grouped apart, as
 * the board groups them when one language is chosen: no story spans the two (their titles share no words), so
 * "all languages" is both lists together. A board whose feed is of another build groups for itself, as before.
 */
export const STORIES_FILE = `${DATA_DIR}/stories.json`;

export interface StoryIndex {
  /** The build this is for: news.json's generatedAt. */
  generatedAt: string;
  bn: string[][];
  en: string[][];
}

/** The feed's stories, by language, as stories.json has them. */
export function buildStoryIndex(feed: NewsFeed): StoryIndex {
  const items = feed.results.flatMap((r) => r.items);
  const now = Date.parse(feed.generatedAt) || Date.now();
  const keysOf = (lang: Lang) =>
    clusterStories(
      items.filter((it) => it.lang === lang),
      { now },
    ).map((story) => story.map((it) => shareKey(it.link)));
  return { generatedAt: feed.generatedAt, bn: keysOf("bn"), en: keysOf("en") };
}

/** The board's headlines by their share key, for storiesFromIndex: made once a feed. */
export function keyItems(items: NewsItem[]): Map<string, NewsItem> {
  return new Map(items.map((it) => [shareKey(it.link), it]));
}

/**
 * The index's stories among the board's headlines (`byKey`, keyItems of the whole feed of the same build), for
 * one language or both, ranked as findStories ranks them. A headline the index names that the board hasn't is left
 * out; a story that then has one outlet left goes.
 */
export function storiesFromIndex(index: StoryIndex, byKey: Map<string, NewsItem>, lang: Lang | "all", now: number): Story[] {
  const lists = lang === "all" ? [...index.bn, ...index.en] : index[lang];
  const clusters: NewsItem[][] = [];
  for (const keys of lists) {
    const found = keys.map((k) => byKey.get(k)).filter((it): it is NewsItem => !!it);
    if (found.length < 2 || new Set(found.map((it) => it.sourceId)).size < 2) continue;
    clusters.push(found);
  }
  return storiesOf(clusters, now);
}
