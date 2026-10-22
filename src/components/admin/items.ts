/**
 * What the admin can pick from: the headlines and videos on the board right now (the same public files the board
 * reads), each as a card made the way the picker makes them (scripts/post-facebook.ts): its Bartaboard short link,
 * its outlet or channel in Bangla, its picture.
 */
import { keptDates } from "@/lib/archive";
import { channelName, sourceName } from "@/lib/bn-names";
import { CHANNELS } from "@/lib/channels";
import { DATA_DIR, type PackedDay, type PackedFeed, unpackDay, unpackFeed } from "@/lib/packed";
import { postLink, shareDay } from "@/lib/page-posts";
import { channelBn, videoLink, videoThumbnail } from "@/lib/page-video-posts";
import { shareKey } from "@/lib/share";
import { datesToSearch, shardPath, type ShareShard } from "@/lib/share-lookup";
import type { Card, Platform } from "@/lib/social-store";
import { api } from "./api";
import type { NewsItem, VideoFeed } from "@/lib/types";
import { unmaskTitle } from "@/lib/video-stories";

/** Links are always the live site's: the admin's API takes only bartaboard.com links. */
const SITE = "https://bartaboard.com";

export interface PickItem {
  kind: "headline" | "video";
  /** The share key or the video's id. */
  key: string;
  title: string;
  /** The outlet or channel, in Bangla. */
  source: string;
  /** The outlet or channel, in English (what its id and the Sources page call it). */
  sourceEn: string;
  sourceId: string;
  /** When it was published (ms), 0 when unknown. */
  time: number;
  section?: string;
  link: string;
  /** A video's thumbnail; a headline's is looked up when picked (pictureFor). */
  picture?: string;
  item?: NewsItem;
}

let loading: Promise<PickItem[]> | null = null;

const CHANNEL_NAME = new Map(CHANNELS.map((c) => [c.id, c.name]));

function headlineItem(it: NewsItem, now: number): PickItem {
  return {
    kind: "headline",
    key: shareKey(it.link),
    title: it.title,
    source: sourceName(it.sourceId, it.sourceName, "bn"),
    sourceEn: it.sourceName,
    sourceId: it.sourceId,
    time: Date.parse(it.publishedAt ?? it.seenAt ?? "") || 0,
    section: it.category,
    link: postLink(SITE, it, now),
    item: it,
  };
}

async function json<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path, { cache: "no-store" });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Every headline and video on the board now, newest first (loaded once a page view; reload() to refresh). */
export function loadItems(fresh = false): Promise<PickItem[]> {
  if (loading && !fresh) return loading;
  loading = (async () => {
    const now = Date.now();
    const [packed, videos] = await Promise.all([json<PackedFeed>(`${DATA_DIR}/news.json`), json<VideoFeed>("/data/videos.json")]);
    const headlines: PickItem[] = (packed ? unpackFeed(packed).results.flatMap((r) => r.items) : []).map((it) => headlineItem(it, now));
    const clips: PickItem[] = (videos?.videos ?? []).map((v) => ({
      kind: "video",
      key: v.id,
      title: unmaskTitle(v.title),
      source: channelBn(v.channel),
      sourceEn: channelName(v.channel, CHANNEL_NAME.get(v.channel) ?? v.channel, "en"),
      sourceId: v.channel,
      time: Date.parse(v.publishedAt) || 0,
      link: videoLink(SITE, v),
      picture: videoThumbnail(v),
    }));
    return [...headlines, ...clips].sort((a, b) => b.time - a.time);
  })();
  return loading;
}

/** Posted in the last 12 hours, by an item's key: when, and where. */
export interface Posted {
  at: number;
  platform: Platform;
}

export const POSTED_WINDOW_MS = 12 * 3600_000;
let posted: Promise<Map<string, Posted>> | null = null;

/**
 * What went out in the last 12 hours, by the share key or video id of every headline or video in it (a story's other
 * headlines too: the picking rules count them as posted): from the admin's history, loaded once a page view, so the
 * picker can mark them. Empty when the history can't be read.
 */
export function recentlyPosted(fresh = false): Promise<Map<string, Posted>> {
  if (posted && !fresh) return posted;
  posted = api
    .history(1)
    .then(({ posts }) => {
      const since = Date.now() - POSTED_WINDOW_MS;
      const map = new Map<string, Posted>();
      for (const p of posts) {
        if (p.status !== "posted") continue;
        const at = Date.parse(p.postedAt ?? p.scheduledAt);
        if (!(at >= since)) continue;
        // A card's own key first; the story's other headlines only when nothing posted names them directly.
        for (const c of p.cards) if (c.key && (!map.has(c.key) || map.get(c.key)!.at < at)) map.set(c.key, { at, platform: p.platform });
        for (const k of p.record?.keys ?? []) if (!map.has(k)) map.set(k, { at, platform: p.platform });
      }
      return map;
    })
    .catch(() => new Map<string, Posted>());
  return posted;
}

const olderDays = new Map<string, Promise<PickItem[]>>();

/** The last 30 Dhaka days the site keeps a day file for (docs/search.md), today first. */
export const olderDates = (): string[] => keptDates();

/**
 * A day's headlines from the site's archive (`days/<date>.json`, the last 30 days): what has left the board, for a
 * search further back. Each file is a few MB, so a day is loaded once a page view and only when asked for.
 */
export function loadOlderDay(date: string): Promise<PickItem[]> {
  let day = olderDays.get(date);
  if (!day) {
    const now = Date.now();
    day = json<PackedDay>(`${DATA_DIR}/days/${date}.json`).then((packed) => (packed ? unpackDay(packed).items.map((it) => headlineItem(it, now)) : []));
    olderDays.set(date, day);
    day.catch(() => olderDays.delete(date));
  }
  return day;
}

const shards = new Map<string, Promise<ShareShard | null>>();

/** A headline's picture, from the share index (as its link preview has it); undefined when it has none. */
export async function pictureFor(p: PickItem): Promise<string | undefined> {
  if (p.picture) return p.picture;
  if (!p.item) return undefined;
  if (typeof p.item.image === "string" && p.item.image) return p.item.image;
  for (const dir of datesToSearch(shareDay(p.item, Date.now()))) {
    const file = shardPath(dir, p.key);
    if (!shards.has(file)) shards.set(file, json<ShareShard>(file));
    const entry = (await shards.get(file))?.[p.key];
    if (entry) return typeof entry[7] === "string" && entry[7] ? entry[7] : undefined;
  }
  return undefined;
}

export function cardOf(p: PickItem, picture: string | undefined): Card {
  return { link: p.link, title: p.title, source: p.source, sourceId: p.sourceId, picture, key: p.key, ...(p.section && { section: p.section }) };
}

export { carouselMessage, singleMessage } from "@/lib/post-text";
