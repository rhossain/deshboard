import { readVideos } from "@/lib/feed";
import { videosRss } from "@/lib/rss";
import { SITE_NAME, VIDEOS_DESCRIPTION, VIDEOS_PATH } from "@/lib/site";

// Rendered once at build time (static export).
export const dynamic = "force-static";

/** The newest TV news videos from every channel. */
export function GET() {
  return videosRss(readVideos(), {
    title: `${SITE_NAME}: Bangladesh TV news videos`,
    description: VIDEOS_DESCRIPTION,
    path: VIDEOS_PATH,
  });
}
