import type { Category } from "./categories";
import { DATA_DIR } from "./packed";
import { shareShard } from "./share";
import { SOURCES } from "./sources";
import type { LogoShape, NewsFeed, NewsItem, NewsSource, Video } from "./types";

/**
 * The share index: every headline of the last 30 days and every video of the last day, looked up by
 * a shared link's day and key (see shortSharePath). The build writes it (share-index.ts); the
 * Cloudflare function that answers shared links (functions/s/[[path]].ts) and, on hosts without it,
 * the share page in the browser read it, one small file per lookup instead of the whole feed.
 *
 *   share/<date>/<shard>.json  a day's headlines (as the day files have them) by key, sharded by its
 *                              first character (see shareShard): a past day's files stop changing
 *   share/board/<shard>.json   the board's headlines without a time, which no day has
 *   share/meta.json            outlets' logos and the Videos view's videos (see ShareMeta)
 */
export const SHARE_DIR = `${DATA_DIR}/share`;
/** The folder of the board's undated headlines, besides the days'. */
export const BOARD_SHARD_DIR = "board";

export const shardPath = (dir: string, key: string) => `${SHARE_DIR}/${dir}/${shareShard(key)}.json`;

/**
 * A related headline from another outlet: its key when it is filed under the same day (or with the
 * board's undated ones), else `<date>/<key>`. Its entry has the rest.
 */
export type PackedRelated = string;

/**
 * A headline in the index: title, link, source id, section, publish and first-seen times in seconds
 * since 1970 (0 for none), the same story from other outlets, and the article's picture when the
 * fetch found one (NewsItem.image).
 */
export type PackedShare = [
  title: string,
  link: string,
  sourceId: string,
  category: Category,
  publishedAt: number,
  seenAt: number,
  related?: PackedRelated[],
  image?: string,
];

/** `share/<date | board>/<shard>.json`: the headlines whose key starts with the shard, by key. */
export type ShareShard = Record<string, PackedShare>;

/** A video in the index: title, channel id and name, publish time (ISO), views. */
export type PackedVideo = [title: string, channel: string, channelName: string, publishedAt: string, views?: number];

/** `share/meta.json`: what a share page needs besides the headline. */
export interface ShareMeta {
  logos: NewsFeed["logos"];
  logoShapes: NewsFeed["logoShapes"];
  /** The Videos view's videos, by YouTube ID. */
  videos: Record<string, PackedVideo>;
}

/**
 * What a shared link shows. The Cloudflare function writes it into the page (`#share-data`), so the
 * page shows it at once, and the browser builds the same from the index where there is no function.
 */
export type ShareData =
  | {
      kind: "headline";
      item: NewsItem;
      /** The same story from other outlets. */
      related: NewsItem[];
      /** The outlet's logo, for SourceLogo. */
      logos: Pick<NewsFeed, "logos" | "logoShapes">;
      /**
       * The article's own picture (its og:image). null: the outlet has none, or wouldn't say. Left out
       * when it hasn't been looked for yet: the page asks the share function for it (`?image`).
       */
      image?: string | null;
    }
  | { kind: "video"; video: Video; channelName: string }
  /** A short link to a headline that has left the index (older than 30 days) and was never opened before. */
  | { kind: "gone" };

const SOURCE_BY_ID = new Map<string, NewsSource>(SOURCES.map((s) => [s.id, s]));

export const sourceById = (id: string) => SOURCE_BY_ID.get(id);

const iso = (seconds: number) => (seconds ? new Date(seconds * 1000).toISOString() : undefined);
const seconds = (time?: string) => (time ? Math.round(Date.parse(time) / 1000) : 0);

function toItem(title: string, link: string, sourceId: string, category: Category, publishedAt = 0, seenAt = 0): NewsItem {
  const source = SOURCE_BY_ID.get(sourceId);
  const item: NewsItem = {
    title,
    link,
    sourceId,
    sourceName: source?.name ?? sourceId,
    lang: source?.lang ?? "bn",
    category,
  };
  if (publishedAt) item.publishedAt = iso(publishedAt);
  if (seenAt) item.seenAt = iso(seenAt);
  return item;
}

export function packShare(item: NewsItem, related: PackedRelated[]): PackedShare {
  const packed: PackedShare = [
    item.title,
    item.link,
    item.sourceId,
    item.category,
    seconds(item.publishedAt),
    seconds(item.seenAt),
  ];
  if (related.length || item.image) packed.push(related);
  if (item.image) packed.push(item.image);
  return packed;
}

export function unpackShare([title, link, sourceId, category, publishedAt, seenAt]: PackedShare): NewsItem {
  return toItem(title, link, sourceId, category, publishedAt, seenAt);
}

/** The logo of one outlet, as the Logos context wants it. */
export function logosFor(
  sourceId: string,
  meta: Pick<ShareMeta, "logos" | "logoShapes"> | null,
): Pick<NewsFeed, "logos" | "logoShapes"> {
  const logos: Record<string, string> = {};
  const logoShapes: Record<string, LogoShape> = {};
  if (meta?.logos[sourceId]) logos[sourceId] = meta.logos[sourceId];
  if (meta?.logoShapes[sourceId]) logoShapes[sourceId] = meta.logoShapes[sourceId];
  return { logos, logoShapes };
}

/** Reads a file of the share index; null when it is missing or unreadable. */
export type ShareLoader = <T>(path: string) => Promise<T | null>;

const DAY_MS = 86_400_000;
const shiftDay = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/**
 * Where to look for a headline filed under `date`: that day, then the board's undated ones, then the
 * days either side (a headline moves day when its outlet corrects its time).
 */
export const datesToSearch = (date: string) => [date, BOARD_SHARD_DIR, shiftDay(date, -1), shiftDay(date, 1)];

/**
 * The headline with this key in the share index, looked for in `dirs` (days, or BOARD_SHARD_DIR) in
 * order, with its outlet's logo; null if none has it.
 */
export async function findShared(
  key: string,
  dirs: string[],
  load: ShareLoader,
): Promise<(ShareData & { kind: "headline" }) | null> {
  const meta = load<ShareMeta>(`${SHARE_DIR}/meta.json`);
  // The first place nearly always has it; the rest are only read when it doesn't.
  const [first, ...rest] = dirs;
  let found: { dir: string; packed: PackedShare } | undefined;
  for (const batch of [first ? [first] : [], rest]) {
    const shards = await Promise.all(batch.map((dir) => load<ShareShard>(shardPath(dir, key))));
    const i = shards.findIndex((shard) => shard?.[key]);
    if (i >= 0) {
      found = { dir: batch[i], packed: shards[i]![key] };
      break;
    }
  }
  if (!found) return null;
  const item = unpackShare(found.packed);

  // The related headlines' entries, each shard read once.
  const refs = (found.packed[6] ?? []).map((ref) => {
    const slash = ref.lastIndexOf("/");
    return slash < 0 ? { dir: found.dir, key: ref } : { dir: ref.slice(0, slash), key: ref.slice(slash + 1) };
  });
  const paths = [...new Set(refs.map((r) => shardPath(r.dir, r.key)))];
  const loaded = new Map(await Promise.all(paths.map(async (p) => [p, await load<ShareShard>(p)] as const)));
  const related = refs.flatMap((r) => {
    const packed = loaded.get(shardPath(r.dir, r.key))?.[r.key];
    return packed ? [unpackShare(packed)] : [];
  });
  const shared: ShareData & { kind: "headline" } = { kind: "headline", item, related, logos: logosFor(item.sourceId, await meta) };
  // Only a picture the fetch found: without one, the share function looks on the outlet's page.
  if (found.packed[7]) shared.image = found.packed[7];
  return shared;
}

/** A video in the share index (the Videos view's last day); null if it has left it. */
export async function findSharedVideo(id: string, load: ShareLoader): Promise<(ShareData & { kind: "video" }) | null> {
  const meta = await load<ShareMeta>(`${SHARE_DIR}/meta.json`);
  const packed = meta?.videos[id];
  if (!packed) return null;
  const [title, channel, channelName, publishedAt, views] = packed;
  return { kind: "video", video: { id, channel, title, publishedAt, views }, channelName };
}
