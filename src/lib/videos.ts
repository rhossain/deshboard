import { CHANNELS } from "./channels";
import { fetchText } from "./fetchers/http";
import { parseYouTubeFeed } from "./fetchers/youtube";
import { readStore, writeStoreSoon } from "./store";
import type { Video, VideoChannel, VideoFeed } from "./types";

/**
 * A feed only has a channel's latest 15 videos, an hour's worth for the busiest, so each run adds to
 * what earlier runs collected (kept in .data/videos.json) instead of replacing it.
 */
const STORE = "videos";
/** Videos older than this drop off. */
const MAX_AGE_MS = 24 * 3600_000;
/** And each channel keeps at most this many. */
const PER_CHANNEL = 30;
const CONCURRENCY = 8;

type Stored = Record<string, Video[]>;

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

/** Fetches every channel's feed and adds it to the videos kept from earlier runs. */
export async function getVideos(): Promise<VideoFeed> {
  const stored = readStore<Stored>(STORE, {});
  const next: Stored = {};
  const channels: VideoFeed["channels"] = [];
  const queue = CHANNELS.map((channel, i) => ({ channel, i }));

  const worker = async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      const { channel, i } = job;
      try {
        next[channel.id] = mergeVideos(await fetchChannel(channel), stored[channel.id] ?? []);
        channels[i] = { id: channel.id, name: channel.name, ok: true };
      } catch (err) {
        // Keep what we have; it ages out on its own if the channel stays unreachable.
        next[channel.id] = mergeVideos([], stored[channel.id] ?? []);
        const error = err instanceof Error ? err.message : String(err);
        channels[i] = { id: channel.id, name: channel.name, ok: false, error };
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  writeStoreSoon(STORE, () => next);

  const videos = Object.values(next)
    .flat()
    .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
  return { generatedAt: new Date().toISOString(), channels, videos };
}
