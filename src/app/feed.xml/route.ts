import { readFeed } from "@/lib/feed";
import { headlinesRss } from "@/lib/rss";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

// Rendered once at build time (static export).
export const dynamic = "force-static";

/** The board's newest headlines from every outlet. */
export function GET() {
  return headlinesRss(readFeed(), {
    title: `${SITE_NAME}: latest Bangladesh news`,
    description: SITE_DESCRIPTION,
    path: "/",
  });
}
