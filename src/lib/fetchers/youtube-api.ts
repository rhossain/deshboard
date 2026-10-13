import { fetchText } from "./http";

/**
 * The YouTube Data API (videos.list): current view counts. The channel feeds carry counts too, but
 * only for a channel's latest 15 videos, so a kept video's count stops at whatever it was when it
 * left its feed. Used when YOUTUBE_API_KEY is set (server side only; never shipped to the browser).
 * Each request takes 50 videos and costs 1 unit of the key's 10,000 a day.
 */
const ENDPOINT = "https://www.googleapis.com/youtube/v3/videos";
const BATCH = 50;
const CONCURRENCY = 4;

type Node = Record<string, unknown>;

/** A videos.list response (part=statistics): video id → views. Hidden or missing counts are left out. */
export function parseVideoStats(json: string): Map<string, number> {
  const views = new Map<string, number>();
  for (const item of ((JSON.parse(json) as Node).items as Node[] | undefined) ?? []) {
    const n = Number((item.statistics as Node | undefined)?.viewCount);
    if (typeof item.id === "string" && Number.isFinite(n) && n > 0) views.set(item.id, n);
  }
  return views;
}

/** The current views of these videos, 50 per request. Throws if any request fails. */
export async function fetchViewCounts(ids: string[], key: string): Promise<Map<string, number>> {
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += BATCH) batches.push(ids.slice(i, i + BATCH));
  const views = new Map<string, number>();
  const worker = async () => {
    for (let batch = batches.shift(); batch; batch = batches.shift()) {
      const url = `${ENDPOINT}?part=statistics&id=${batch.join(",")}&key=${encodeURIComponent(key)}`;
      const res = await fetchText(url, { accept: "application/json" });
      for (const [id, n] of parseVideoStats(res.text)) views.set(id, n);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return views;
}

/**
 * The videos with their current views from the API, when YOUTUBE_API_KEY is set. Without a key, or
 * if the API fails (quota, bad key), they keep the feed's counts.
 */
export async function withCurrentViews<T extends { id: string; views?: number }>(videos: T[]): Promise<T[]> {
  const key = process.env.YOUTUBE_API_KEY?.trim();
  if (!key || !videos.length) return videos;
  try {
    const views = await fetchViewCounts([...new Set(videos.map((v) => v.id))], key);
    return videos.map((v) => (views.has(v.id) ? { ...v, views: views.get(v.id) } : v));
  } catch (err) {
    // The error is only the status ("HTTP 403"), never the URL, so the key doesn't reach the log.
    console.warn(`[videos] YouTube Data API views unavailable, keeping the feed's: ${err instanceof Error ? err.message : err}`);
    return videos;
  }
}
