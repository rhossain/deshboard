import type { MetadataRoute } from "next";
import { CATEGORY_PAGES, categoryPath, SITE_URL } from "@/lib/site";

/** The board and each section's page; their headlines change all day. */
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
  ];
}
