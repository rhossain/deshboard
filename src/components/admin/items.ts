/**
 * What the admin can pick from: the headlines and videos on the board right now (the same public files the board
 * reads), each as a card made the way the picker makes them (scripts/post-facebook.ts): its Bartaboard short link,
 * its outlet or channel in Bangla, its picture.
 */
import { sourceName } from "@/lib/bn-names";
import { DATA_DIR, type PackedFeed, unpackFeed } from "@/lib/packed";
import { headlinesHeading, postLink, shareDay } from "@/lib/page-posts";
import { channelBn, roundupHeading, videoLink, videoThumbnail } from "@/lib/page-video-posts";
import { shareKey } from "@/lib/share";
import { datesToSearch, shardPath, type ShareShard } from "@/lib/share-lookup";
import type { Card } from "@/lib/social-store";
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
    const headlines: PickItem[] = (packed ? unpackFeed(packed).results.flatMap((r) => r.items) : []).map((it) => ({
      kind: "headline",
      key: shareKey(it.link),
      title: it.title,
      source: sourceName(it.sourceId, it.sourceName, "bn"),
      sourceId: it.sourceId,
      time: Date.parse(it.publishedAt ?? it.seenAt ?? "") || 0,
      section: it.category,
      link: postLink(SITE, it, now),
      item: it,
    }));
    const clips: PickItem[] = (videos?.videos ?? []).map((v) => ({
      kind: "video",
      key: v.id,
      title: unmaskTitle(v.title),
      source: channelBn(v.channel),
      sourceId: v.channel,
      time: Date.parse(v.publishedAt) || 0,
      link: videoLink(SITE, v),
      picture: videoThumbnail(v),
    }));
    return [...headlines, ...clips].sort((a, b) => b.time - a.time);
  })();
  return loading;
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

const BN = "০১২৩৪৫৬৭৮৯";
const bn = (n: number) => String(n).replace(/\d/g, (d) => BN[+d]);

/** A carousel's text for these cards: its heading for the time it goes out, and the cards numbered. */
export function carouselMessage(content: string, cards: Card[], at: number): string {
  const heading = content === "roundup" ? roundupHeading(at, cards.length) : headlinesHeading(at, cards.length);
  return `${heading}\n\n${cards.map((c, i) => `${bn(i + 1)}. ${c.title} — ${c.source}`).join("\n")}`;
}

/** A single post's text for this item: its title, then its outlet or channel. */
export const singleMessage = (c: Card) => `${c.title}\n\n${c.source}`;
