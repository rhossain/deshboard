import type { MetadataRoute } from "next";
import { cachedNewestByCategory } from "@/lib/feed";
import { CATEGORY_PAGES, categoryPath, SITE_URL } from "@/lib/site";

// Built when the server's cache is still empty, so rebuilt every 15 minutes from the cached headlines.
export const revalidate = 900;

/** When the privacy and terms pages last changed; keep in step with their "Last updated" line. */
const LEGAL_UPDATED = new Date("2026-10-10");

/**
 * The board and each section's page (their headlines change all day), then the privacy and terms
 * pages. Each section's date is its newest cached headline's, so a quiet section doesn't claim a change.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const newest = cachedNewestByCategory();
  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "always", priority: 1 },
    ...CATEGORY_PAGES.map((c) => ({
      url: `${SITE_URL}${categoryPath(c.id)}`,
      lastModified: newest[c.id] ? new Date(newest[c.id]!) : now,
      changeFrequency: "hourly" as const,
      priority: 0.8,
    })),
    { url: `${SITE_URL}/privacy/`, lastModified: LEGAL_UPDATED, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/terms/`, lastModified: LEGAL_UPDATED, changeFrequency: "yearly", priority: 0.2 },
  ];
}
