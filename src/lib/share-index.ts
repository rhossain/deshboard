import { dhakaDay } from "@/components/time";
import { shareKey, shareShard } from "./share";
import { BOARD_SHARD_DIR, packShare, type PackedVideo, type ShareMeta, type ShareShard } from "./share-lookup";
import { findStories, itemTime } from "./stories";
import type { NewsFeed, NewsItem, VideoFeed } from "./types";

/** Other outlets' headlines kept with each one (the share page shows six). */
const RELATED_MAX = 6;
const DAY_MS = 86_400_000;

/**
 * The same story from other outlets, for every headline in `items` that has any, as the stories stood
 * at `now` (findStories looks back 36 hours from it).
 */
function relatedByLink(items: NewsItem[], now: number, into: Map<string, NewsItem[]>) {
  for (const story of findStories(items, { now })) {
    for (const it of story.items) {
      if (into.has(it.link)) continue;
      const others = story.items.filter((o) => o.link !== it.link && o.sourceId !== it.sourceId);
      if (others.length) into.set(it.link, others.slice(0, RELATED_MAX));
    }
  }
}

/**
 * The share index's files (see share-lookup.ts), by path under SHARE_DIR without the extension
 * ("2026-10-14/k", "board/k"), and the meta file with the outlets' logos and the Videos view's videos.
 *
 * `days` are the day files' headlines by Dhaka date; `board` the board's, which adds the headlines
 * without a time (homepage ones), which no day has. A day's files come out the same from run to run
 * once its headlines stop changing, so the upload skips them.
 */
export function buildShareIndex(
  days: Map<string, NewsItem[]>,
  board: NewsItem[],
  feed: Pick<NewsFeed, "logos" | "logoShapes">,
  videos: VideoFeed,
  now = Date.now(),
): { files: Map<string, ShareShard>; meta: ShareMeta } {
  // Each day's headlines, with any board headline its day file lacks; the board's undated ones apart.
  const byDir = new Map<string, NewsItem[]>([...days].map(([date, items]) => [date, [...items]]));
  const known = new Set([...days.values()].flat().map((it) => it.link));
  const undated: NewsItem[] = [];
  for (const it of board) {
    if (known.has(it.link)) continue;
    const time = itemTime(it);
    if (!time) {
      undated.push(it);
      continue;
    }
    const date = dhakaDay(time);
    byDir.set(date, [...(byDir.get(date) ?? []), it]);
  }
  byDir.set(BOARD_SHARD_DIR, undated);

  // Stories: the board's as the reader saw them when sharing, each past day's as it stood at its end.
  const related = new Map<string, NewsItem[]>();
  relatedByLink(board, now, related);
  for (const [date, items] of days) {
    relatedByLink(items, Math.min(Date.parse(`${date}T00:00:00+06:00`) + DAY_MS, now), related);
  }

  // Where each headline is filed, for the related headlines' references.
  const placed = new Map<string, { dir: string; key: string }>();
  for (const [dir, items] of byDir) {
    for (const it of items) if (!placed.has(it.link)) placed.set(it.link, { dir, key: shareKey(it.link) });
  }
  const refs = (dir: string, items: NewsItem[] = []) =>
    items.flatMap((r) => {
      const at = placed.get(r.link);
      return at ? [at.dir === dir ? at.key : `${at.dir}/${at.key}`] : [];
    });

  const files = new Map<string, ShareShard>();
  for (const [dir, items] of byDir) {
    // Sorted by key, so a day whose headlines haven't changed writes the same bytes.
    const entries = items.map((it) => [shareKey(it.link), it] as const).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    for (const [key, it] of entries) {
      const path = `${dir}/${shareShard(key)}`;
      let file = files.get(path);
      if (!file) files.set(path, (file = {}));
      // An address listed twice in a day keeps its first entry.
      file[key] ??= packShare(it, refs(dir, related.get(it.link)));
    }
  }

  const channelNames = new Map(videos.channels.map((c) => [c.id, c.name]));
  const videoIndex: Record<string, PackedVideo> = {};
  for (const v of videos.videos) {
    const packed: PackedVideo = [v.title, v.channel, channelNames.get(v.channel) ?? v.channel, v.publishedAt];
    if (v.views) packed.push(v.views);
    videoIndex[v.id] = packed;
  }

  return { files, meta: { logos: feed.logos, logoShapes: feed.logoShapes, videos: videoIndex } };
}
