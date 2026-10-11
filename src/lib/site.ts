import type { Metadata, ResolvingMetadata } from "next";
import { CATEGORIES, type Category } from "./categories";
import { ACTIVE_SOURCES } from "./sources";
import { itemTime, newestFirst } from "./stories";
import type { SourceResult } from "./types";

/** The public address, for absolute URLs (canonical, sitemap, share image). Set SITE_URL when deploying. */
export const SITE_URL = (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
export const SITE_NAME = "Bartaboard";
// Search results cut titles at about 60 characters and descriptions at about 155, so the search
// phrase comes first and the name last.
export const SITE_TITLE = `Bangladesh News Today, Bangla & English | ${SITE_NAME}`;
export const SITE_DESCRIPTION =
  `All Bangladesh news in one place: Bangla and English headlines from ${ACTIVE_SOURCES.length} newspapers, ` +
  "like Prothom Alo, The Daily Star and bdnews24, plus the top stories.";
export const KEYWORDS = [
  "Bangladesh news",
  "Bangla news",
  "latest news Bangladesh",
  "Bangladesh headlines",
  "Dhaka news",
  "বাংলা খবর",
  "আজকের খবর",
  "সর্বশেষ সংবাদ",
];

/** For indexable pages: allow large image previews and full snippets in search results. */
export const INDEXABLE = { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } as const;

/** Sections with a page of their own; "other" is a leftover bucket, not a topic. */
export const CATEGORY_PAGES = CATEGORIES.filter((c) => c.id !== "other");
const PAGE_BY_ID = new Map(CATEGORY_PAGES.map((c) => [c.id, c]));

/** The section's own page (/news/sports), or undefined for categories without one. */
export function categoryPath(category: Category | ""): string | undefined {
  return category && PAGE_BY_ID.has(category) ? `/news/${category}` : undefined;
}

export function categoryTitle(category: Category): string {
  const c = PAGE_BY_ID.get(category)!;
  return `Bangladesh ${c.label} News Today (${c.bn}) | ${SITE_NAME}`;
}

/** The page's visible heading: what it holds, in the words people search for. */
export function boardHeading(category?: Category | ""): string {
  const c = category ? PAGE_BY_ID.get(category) : undefined;
  return c
    ? `Bangladesh ${c.label.toLowerCase()} news today (${c.bn})`
    : `Latest Bangladesh news headlines from ${ACTIVE_SOURCES.length} newspapers`;
}

export function categoryDescription(category: Category): string {
  const c = PAGE_BY_ID.get(category)!;
  return (
    `Latest ${c.label.toLowerCase()} news from Bangladesh: ${c.bn} headlines in Bangla and English from ` +
    `${ACTIVE_SOURCES.length} news portals, on one board.`
  );
}

/** Headlines prerendered per card: a full card (as many as it shows) for the first few, a few after that. */
const SEED_PER_SOURCE = 8;
const SEED_FULL_CARDS = 6;
const SEED_PER_LATER_SOURCE = 3;

/**
 * A small slice of the results for the server-rendered page, so it carries real headlines for search
 * engines and first paint without shipping the whole feed twice. Each source keeps its newest
 * headlines (in `category` only, when given): enough to fill the cards in view on any screen, and a
 * few for the cards further down, which hold placeholders for the rest until the feed loads.
 */
export function seedResults(results: SourceResult[], category?: Category): SourceResult[] {
  const newest = new Map(
    results.map((r) => [
      r.sourceId,
      r.items
        .filter((it) => !category || it.category === category)
        .sort((a, b) => newestFirst(itemTime(a), itemTime(b))),
    ]),
  );
  // The first cards on the board: sources in display order, skipping failed ones (shown last).
  const ok = new Set(results.filter((r) => r.ok).map((r) => r.sourceId));
  const full = new Set(
    ACTIVE_SOURCES.map((s) => s.id)
      .filter((id) => ok.has(id) && newest.get(id)?.length)
      .slice(0, SEED_FULL_CARDS),
  );
  return results.map((r) => ({
    ...r,
    items: newest.get(r.sourceId)!.slice(0, full.has(r.sourceId) ? SEED_PER_SOURCE : SEED_PER_LATER_SOURCE),
  }));
}

/** JSON for a <script type="application/ld+json">, escaped so it can't close the script it sits in. */
function jsonLd(data: object): string {
  return JSON.stringify({ "@context": "https://schema.org", ...data }).replace(/</g, "\\u003c");
}

/**
 * A page's Open Graph and Twitter card. Next replaces the layout's openGraph rather than merging it, so
 * the site's share image (app/opengraph-image.tsx) is carried over from `parent`.
 */
export async function shareMetadata(
  parent: ResolvingMetadata,
  { title, description, url }: { title: string; description: string; url: string },
): Promise<Pick<Metadata, "openGraph" | "twitter">> {
  const { openGraph, twitter } = await parent;
  return {
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      type: "website",
      locale: "en_US",
      alternateLocale: ["bn_BD"],
      images: openGraph?.images,
    },
    twitter: { card: "summary_large_image", title, description, images: twitter?.images },
  };
}

/**
 * Structured data for a section's page: what it is, and where it sits under the board. `updated` is
 * when the headlines were last collected.
 */
export function categoryJsonLd(category: Category, updated?: string): string {
  const c = PAGE_BY_ID.get(category)!;
  const url = `${SITE_URL}${categoryPath(category)}`;
  return jsonLd({
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": url,
        url,
        name: categoryTitle(category),
        description: categoryDescription(category),
        inLanguage: ["en", "bn"],
        dateModified: updated,
        isPartOf: { "@id": `${SITE_URL}/#website` },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: SITE_NAME, item: `${SITE_URL}/` },
          { "@type": "ListItem", position: 2, name: `${c.label} news`, item: url },
        ],
      },
    ],
  });
}

/** Structured data for search engines (schema.org): the site and its publisher, and when the headlines were collected. */
export function siteJsonLd(updated?: string): string {
  return jsonLd({
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: `${SITE_URL}/`,
        name: SITE_NAME,
        description: SITE_DESCRIPTION,
        inLanguage: ["en", "bn"],
        dateModified: updated,
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: SITE_NAME,
        url: `${SITE_URL}/`,
        logo: `${SITE_URL}/brand/bartaboard-icon-512.png`,
      },
    ],
  });
}
