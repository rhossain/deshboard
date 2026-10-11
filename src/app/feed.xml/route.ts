import { cachedResults } from "@/lib/feed";
import { headlinesRss } from "@/lib/rss";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

// Built when the server's cache is still empty, so rebuilt every 15 minutes from the cached headlines.
export const revalidate = 900;

/** The board's newest headlines from every outlet. */
export function GET() {
  return headlinesRss(cachedResults(), {
    title: `${SITE_NAME}: latest Bangladesh news`,
    description: SITE_DESCRIPTION,
    path: "/",
  });
}
