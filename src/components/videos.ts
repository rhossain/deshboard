import type { VideoFeed } from "@/lib/types";

/**
 * The Videos view's code and data, fetched only once the reader heads for it: pressing or hovering
 * the Videos button starts both, so by the time the click lands they are usually on their way.
 * Fetched once per page; switching away and back shows them at once.
 */

let request: Promise<VideoFeed> | undefined;
/** The last feed that arrived, so the view can draw it on its first render. */
let latest: VideoFeed | undefined;

export const loadVideoBoard = () => import("./VideoBoard");

/** `/data/videos.json`; `fresh` looks for a newer build instead of reusing the one already fetched. */
export function loadVideos(fresh = false): Promise<VideoFeed> {
  if (request && !fresh) return request;
  const r = fetch("/data/videos.json", { cache: "no-cache" }).then(async (res) => {
    if (!res.ok) throw new Error(res.status === 404 ? "no videos have been collected yet" : `server returned ${res.status}`);
    const feed = (await res.json()) as VideoFeed;
    latest = feed;
    return feed;
  });
  // A failed fetch isn't kept, so the next look tries again.
  r.catch(() => {
    if (request === r) request = latest ? Promise.resolve(latest) : undefined;
  });
  request = r;
  return r;
}

export function cachedVideos(): VideoFeed | undefined {
  return latest;
}

/** Start loading the view: the reader is about to open it. */
export function prefetchVideos(): void {
  loadVideoBoard().catch(() => {});
  loadVideos().catch(() => {});
}
