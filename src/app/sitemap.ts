import type { MetadataRoute } from "next";
import { OUTLETS, outletContent, outletPath } from "@/lib/directory";
import { newestByCategory, readFeed, readVideos } from "@/lib/feed";
import { languageAlternates, LOCALES, localePath } from "@/lib/i18n";
import { ABOUT_PATH, CATEGORY_PAGES, categoryPath, SITE_URL, SOURCES_PATH, VIDEOS_PATH } from "@/lib/site";

// Rendered once at build time (static export).
export const dynamic = "force-static";

/** When the privacy and terms pages last changed; keep in step with their "Last updated" line. */
const LEGAL_UPDATED = new Date("2026-10-10");
/** When the about page last changed. */
const ABOUT_UPDATED = new Date("2026-10-11");

/** A page in both languages: an entry for each, each listing the other (hreflang). */
function bothLanguages(path: string, entry: Omit<MetadataRoute.Sitemap[number], "url">): MetadataRoute.Sitemap {
  const languages = Object.fromEntries(
    Object.entries(languageAlternates(path)).map(([lang, href]) => [lang, `${SITE_URL}${href}`]),
  );
  return LOCALES.map((locale) => ({
    ...entry,
    url: `${SITE_URL}${localePath(path, locale)}`,
    alternates: { languages },
  }));
}

/**
 * The board, each section's page and Videos (they change all day), then the sources, outlet, about,
 * privacy and terms pages; every one in English and in Bangla. Each page's date is its newest
 * headline's, so a quiet section doesn't claim a change.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const feed = readFeed();
  const built = new Date();
  const fetched = feed ? new Date(feed.generatedAt) : built;
  const newest = feed ? newestByCategory(feed) : {};
  const videos = readVideos();
  return [
    ...bothLanguages("/", { lastModified: fetched, changeFrequency: "always", priority: 1 }),
    ...CATEGORY_PAGES.flatMap((c) =>
      bothLanguages(categoryPath(c.id)!, {
        lastModified: newest[c.id] ? new Date(newest[c.id]!) : fetched,
        changeFrequency: "hourly",
        priority: 0.8,
      }),
    ),
    ...bothLanguages(VIDEOS_PATH, {
      lastModified: videos ? new Date(videos.videos[0]?.publishedAt ?? videos.generatedAt) : built,
      changeFrequency: "hourly",
      priority: 0.8,
    }),
    // The lines from the feeds change with every build; the page itself only when an outlet is added.
    ...bothLanguages(SOURCES_PATH, { lastModified: fetched, changeFrequency: "daily", priority: 0.7 }),
    // Each outlet's page, dated by its newest headline or video; left out while it has neither (noindex).
    ...OUTLETS.flatMap((o) => {
      const { headlines, videos: own, updated } = outletContent(o, feed, videos);
      if (!headlines.length && !own.length) return [];
      return bothLanguages(outletPath(o.id), {
        lastModified: updated ? new Date(updated) : fetched,
        changeFrequency: "hourly",
        priority: 0.6,
      });
    }),
    ...bothLanguages(ABOUT_PATH, { lastModified: ABOUT_UPDATED, changeFrequency: "monthly", priority: 0.5 }),
    ...bothLanguages("/privacy/", { lastModified: LEGAL_UPDATED, changeFrequency: "yearly", priority: 0.2 }),
    ...bothLanguages("/terms/", { lastModified: LEGAL_UPDATED, changeFrequency: "yearly", priority: 0.2 }),
  ];
}
