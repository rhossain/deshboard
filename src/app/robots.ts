import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Rendered once at build time (static export).
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    // Everything may be crawled: pages that shouldn't be in search (/health, shared headlines) say so
    // with a noindex tag, which crawlers only see if they're allowed to fetch the page. The admin is
    // the exception: Cloudflare Access answers for it with a sign-in page, so crawlers are kept out.
    rules: { userAgent: "*", allow: "/", disallow: ["/admin/", "/api/admin/"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
