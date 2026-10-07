import { CHANNELS } from "./channels";
import { fetchText } from "./fetchers/http";
import { parseYouTubeFeed } from "./fetchers/youtube";
import { readStore, writeStoreSoon } from "./store";
import type { Video, VideoChannel, VideoFeed } from "./types";

/** How long the videos are served before the channels are fetched again (same as the headlines). */
const TTL_MS = Number(process.env.NEWS_CACHE_SECONDS ?? 600) * 1000;
/**
 * A feed only has a channel's latest 15 videos, an hour's worth for the busiest, so each fetch adds
 * to what earlier ones collected (kept in .data/videos.json) instead of replacing it.
 */
const STORE = "videos";
/** Videos older than this drop off. */
const MAX_AGE_MS = 24 * 3600_000;
/** And each channel keeps at most this many. */
const PER_CHANNEL = 30;
const CONCURRENCY = 8;

type CacheEntry = { at: number; feed: VideoFeed };

// Survives hot reloads in dev and is shared by all requests in one server process. Starts from the
// copy on disk, so a restart serves the last videos at once (and fetches newer ones behind them).
const g = globalThis as unknown as {
  __videoCache?: CacheEntry | null;
  __videoInflight?: Promise<VideoFeed> | null;
  __videoRefresher?: ReturnType<typeof setInterval>;
};
if (g.__videoCache === undefined) {
  const stored = readStore<VideoFeed | null>(STORE, null);
  g.__videoCache = stored?.videos ? { at: 0, feed: stored } : null;
}

/** A channel's videos: this fetch's (with their current titles and views), then the ones kept from before. */
export function mergeVideos(fresh: Video[], kept: Video[], now = Date.now()): Video[] {
  const ids = new Set(fresh.map((v) => v.id));
  const cutoff = new Date(now - MAX_AGE_MS).toISOString();
  return [...fresh, ...kept.filter((v) => !ids.has(v.id))]
    .filter((v) => v.publishedAt >= cutoff)
    .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1))
    .slice(0, PER_CHANNEL);
}

async function fetchChannel(channel: VideoChannel): Promise<Video[]> {
  const res = await fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${channel.youtubeId}`, {
    accept: "application/atom+xml, application/xml, text/xml, */*",
  });
  return parseYouTubeFeed(res.text).map((v) => ({ ...v, channel: channel.id }));
}

/** Fetches every channel's feed and adds it to the videos already collected. */
async function collect(previous: VideoFeed | undefined): Promise<VideoFeed> {
  const kept = new Map<string, Video[]>();
  for (const v of previous?.videos ?? []) {
    const list = kept.get(v.channel);
    if (list) list.push(v);
    else kept.set(v.channel, [v]);
  }
  const byChannel: Video[][] = [];
  const channels: VideoFeed["channels"] = [];
  const queue = CHANNELS.map((channel, i) => ({ channel, i }));

  const worker = async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      const { channel, i } = job;
      try {
        byChannel[i] = mergeVideos(await fetchChannel(channel), kept.get(channel.id) ?? []);
        channels[i] = { id: channel.id, name: channel.name, ok: true };
      } catch (err) {
        // Keep what we have; it ages out on its own if the channel stays unreachable.
        byChannel[i] = mergeVideos([], kept.get(channel.id) ?? []);
        const error = err instanceof Error ? err.message : String(err);
        channels[i] = { id: channel.id, name: channel.name, ok: false, error };
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const videos = byChannel.flat().sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
  return { generatedAt: new Date().toISOString(), channels, videos };
}

/** Fetch the channels now (one fetch at a time, however many readers ask). */
function refresh(): Promise<VideoFeed> {
  if (g.__videoInflight) return g.__videoInflight;
  const p = collect(g.__videoCache?.feed)
    .then((feed) => {
      g.__videoCache = { at: Date.now(), feed };
      writeStoreSoon(STORE, () => g.__videoCache?.feed);
      return feed;
    })
    .finally(() => {
      g.__videoInflight = null;
    });
  g.__videoInflight = p;
  return p;
}

/**
 * The videos, without waiting on YouTube whenever there are any: stale ones are served at once
 * while newer ones are fetched behind them. `force` (Refresh) waits for a fresh fetch.
 */
export async function getVideos({ force = false } = {}): Promise<VideoFeed> {
  const hit = g.__videoCache;
  if (force || !hit) return refresh();
  if (Date.now() - hit.at >= TTL_MS) refresh().catch((err) => console.warn("[videos] refresh failed:", err));
  return hit.feed;
}

/**
 * Keeps the videos current (and collecting) whether or not anyone opens them: fetches now, then
 * every half TTL. Started once per server from instrumentation.ts.
 */
export function startVideoRefresh(): void {
  if (g.__videoRefresher) return;
  const run = () => refresh().catch((err) => console.warn("[videos] background refresh failed:", err));
  g.__videoRefresher = setInterval(run, Math.max(60_000, TTL_MS / 2));
  g.__videoRefresher.unref?.();
  void run();
}
