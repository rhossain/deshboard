import type { MetadataRoute } from "next";
import { cachedNewestByCategory } from "@/lib/feed";
import { ABOUT_PATH, CATEGORY_PAGES, categoryPath, SITE_URL, SOURCES_PATH, VIDEOS_PATH } from "@/lib/site";
import { cachedVideoFeed } from "@/lib/videos";

// Built when the server's cache is still empty, so rebuilt every 15 minutes from the cached headlines.
export const revalidate = 900;

/** When the privacy and terms pages last changed; keep in step with their "Last updated" line. */
const LEGAL_UPDATED = new Date("2026-10-10");
/** When the about page last changed. */
const ABOUT_UPDATED = new Date("2026-10-11");

/**
 * The board, each section's page and Videos (they change all day), then the sources, about, privacy
 * and terms pages. Each section's date is its newest cached headline's, so a quiet section doesn't claim a change.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const newest = cachedNewestByCategory();
  const newestVideo = cachedVideoFeed()?.videos[0]?.publishedAt;
  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "always", priority: 1 },
    ...CATEGORY_PAGES.map((c) => ({
      url: `${SITE_URL}${categoryPath(c.id)}`,
      lastModified: newest[c.id] ? new Date(newest[c.id]!) : now,
      changeFrequency: "hourly" as const,
      priority: 0.8,
    })),
    {
      url: `${SITE_URL}${VIDEOS_PATH}`,
      lastModified: newestVideo ? new Date(Math.min(Date.parse(newestVideo), now.getTime())) : now,
      changeFrequency: "hourly",
      priority: 0.8,
    },
    // The lines from the cache change all day; the page itself only when an outlet is added.
    { url: `${SITE_URL}${SOURCES_PATH}`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE_URL}${ABOUT_PATH}`, lastModified: ABOUT_UPDATED, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/privacy/`, lastModified: LEGAL_UPDATED, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/terms/`, lastModified: LEGAL_UPDATED, changeFrequency: "yearly", priority: 0.2 },
  ];
}
