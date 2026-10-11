import { videosRss } from "@/lib/rss";
import { SITE_NAME, VIDEOS_DESCRIPTION, VIDEOS_PATH } from "@/lib/site";
import { cachedVideoFeed } from "@/lib/videos";

// Rebuilt every 15 minutes from the cached videos.
export const revalidate = 900;

/** The newest TV news videos from every channel. */
export function GET() {
  return videosRss(cachedVideoFeed(), {
    title: `${SITE_NAME}: Bangladesh TV news videos`,
    description: VIDEOS_DESCRIPTION,
    path: VIDEOS_PATH,
  });
}
