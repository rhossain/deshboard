import type { MetadataRoute } from "next";
import { CATEGORY_PAGES, categoryPath, SITE_URL } from "@/lib/site";

// Rendered once at build time (static export).
export const dynamic = "force-static";

/** The board and each section's page (their headlines change all day), then the privacy and terms pages. */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified, changeFrequency: "always", priority: 1 },
    ...CATEGORY_PAGES.map((c) => ({
      url: `${SITE_URL}${categoryPath(c.id)}`,
      lastModified,
      changeFrequency: "hourly" as const,
      priority: 0.8,
    })),
    { url: `${SITE_URL}/privacy/`, lastModified, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/terms/`, lastModified, changeFrequency: "yearly", priority: 0.2 },
  ];
}
