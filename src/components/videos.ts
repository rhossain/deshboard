import type { VideoFeed } from "@/lib/types";

/**
 * The Videos view's code and data, fetched only once the reader heads for it: pressing or hovering
 * the Videos button starts both, so by the time the click lands they are usually on their way.
 * Fetched once per page; switching away and back shows them at once.
 */

let request: Promise<VideoFeed> | undefined;
/** The last feed that arrived, and when, so the view can draw it on its first render. */
let latest: { feed: VideoFeed; at: number } | undefined;

export const loadVideoBoard = () => import("./VideoBoard");

/**
 * `/api/videos`. `fresh` asks again instead of reusing the answer already here; `force` (Refresh) has
 * the server fetch the channels now rather than answer from its cache.
 */
export function loadVideos(fresh = false, force = false): Promise<VideoFeed> {
  if (request && !fresh) return request;
  const r = fetch(`/api/videos${force ? "?refresh=1" : ""}`, { cache: "no-store" }).then(async (res) => {
    if (!res.ok) throw new Error(`server returned ${res.status}`);
    const feed = (await res.json()) as VideoFeed;
    latest = { feed, at: Date.now() };
    return feed;
  });
  // A failed fetch isn't kept, so the next look tries again.
  r.catch(() => {
    if (request === r) request = latest ? Promise.resolve(latest.feed) : undefined;
  });
  request = r;
  return r;
}

export function cachedVideos(): VideoFeed | undefined {
  return latest?.feed;
}

/** When the cached videos arrived (0 if they haven't). */
export function cachedVideosAt(): number {
  return latest?.at ?? 0;
}

/** Start loading the view: the reader is about to open it. */
export function prefetchVideos(): void {
  loadVideoBoard().catch(() => {});
  loadVideos().catch(() => {});
}
