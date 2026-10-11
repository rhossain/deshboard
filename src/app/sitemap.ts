import type { MetadataRoute } from "next";
import { OUTLETS, outletContent, outletPath } from "@/lib/directory";
import { newestByCategory, readFeed, readVideos } from "@/lib/feed";
import { ABOUT_PATH, CATEGORY_PAGES, categoryPath, SITE_URL, SOURCES_PATH, VIDEOS_PATH } from "@/lib/site";

// Rendered once at build time (static export).
export const dynamic = "force-static";

/** When the privacy and terms pages last changed; keep in step with their "Last updated" line. */
const LEGAL_UPDATED = new Date("2026-10-10");
/** When the about page last changed. */
const ABOUT_UPDATED = new Date("2026-10-11");

/**
 * The board, each section's page and Videos (they change all day), then the sources, about, privacy
 * and terms pages. Each page's date is its newest headline's, so a quiet section doesn't claim a change.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const feed = readFeed();
  const built = new Date();
  const fetched = feed ? new Date(feed.generatedAt) : built;
  const newest = feed ? newestByCategory(feed) : {};
  const videos = readVideos();
  return [
    { url: `${SITE_URL}/`, lastModified: fetched, changeFrequency: "always", priority: 1 },
    ...CATEGORY_PAGES.map((c) => ({
      url: `${SITE_URL}${categoryPath(c.id)}`,
      lastModified: newest[c.id] ? new Date(newest[c.id]!) : fetched,
      changeFrequency: "hourly" as const,
      priority: 0.8,
    })),
    {
      url: `${SITE_URL}${VIDEOS_PATH}`,
      lastModified: videos ? new Date(videos.videos[0]?.publishedAt ?? videos.generatedAt) : built,
      changeFrequency: "hourly",
      priority: 0.8,
    },
    // The lines from the feeds change with every build; the page itself only when an outlet is added.
    { url: `${SITE_URL}${SOURCES_PATH}`, lastModified: fetched, changeFrequency: "daily", priority: 0.7 },
    // Each outlet's page, dated by its newest headline or video; left out while it has neither (noindex).
    ...OUTLETS.flatMap((o) => {
      const { headlines, videos: own, updated } = outletContent(o, feed, videos);
      if (!headlines.length && !own.length) return [];
      return [
        {
          url: `${SITE_URL}${outletPath(o.id)}`,
          lastModified: updated ? new Date(updated) : fetched,
          changeFrequency: "hourly" as const,
          priority: 0.6,
        },
      ];
    }),
    { url: `${SITE_URL}${ABOUT_PATH}`, lastModified: ABOUT_UPDATED, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/privacy/`, lastModified: LEGAL_UPDATED, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/terms/`, lastModified: LEGAL_UPDATED, changeFrequency: "yearly", priority: 0.2 },
  ];
}
