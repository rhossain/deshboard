import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    // Everything may be crawled: pages that shouldn't be in search (/health, shared headlines) say so
    // with a noindex tag, which crawlers only see if they're allowed to fetch the page.
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
