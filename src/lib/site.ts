import { CATEGORIES, type Category } from "./categories";
import { ACTIVE_SOURCES } from "./sources";
import { itemTime } from "./stories";
import type { SourceResult } from "./types";

/** The public address, for absolute URLs (canonical, sitemap, share image). Set SITE_URL when deploying. */
export const SITE_URL = (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
export const SITE_NAME = "Deshboard";
export const SITE_TITLE = "Deshboard: Latest Bangladesh News Headlines in Bangla & English";
export const SITE_DESCRIPTION =
  `Latest Bangladesh news from ${ACTIVE_SOURCES.length} portals on one board: Bangla and English headlines from ` +
  "Prothom Alo, The Daily Star, bdnews24, Dhaka Tribune and more, with the top stories across outlets.";
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
  return `Bangladesh ${c.label} News Today (${c.bn}) · ${SITE_NAME}`;
}

export function categoryDescription(category: Category): string {
  const c = PAGE_BY_ID.get(category)!;
  return (
    `Latest ${c.label.toLowerCase()} news from Bangladesh: ${c.bn} headlines in Bangla and English from ` +
    `${ACTIVE_SOURCES.length} news portals, on one board.`
  );
}

/** Headlines prerendered into the page per source: enough to fill each card before the full feed loads. */
const SEED_PER_SOURCE = 8;

/**
 * A small slice of the results for the prerendered page, so it carries real headlines for search
 * engines and first paint without shipping the whole feed twice. Each source keeps its newest
 * headlines (in `category` only, when given).
 */
export function seedResults(results: SourceResult[], category?: Category): SourceResult[] {
  return results.map((r) => ({
    ...r,
    items: r.items
      .filter((it) => !category || it.category === category)
      .sort((a, b) => (itemTime(b) ?? "").localeCompare(itemTime(a) ?? ""))
      .slice(0, SEED_PER_SOURCE),
  }));
}

/** JSON for a <script type="application/ld+json">, escaped so it can't close the script it sits in. */
function jsonLd(data: object): string {
  return JSON.stringify({ "@context": "https://schema.org", ...data }).replace(/</g, "\\u003c");
}

/** Structured data for a section's page: what it is, and where it sits under the board. */
export function categoryJsonLd(category: Category): string {
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

/** Structured data for search engines (schema.org): the site and its publisher. */
export function siteJsonLd(): string {
  return jsonLd({
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: `${SITE_URL}/`,
        name: SITE_NAME,
        description: SITE_DESCRIPTION,
        inLanguage: ["en", "bn"],
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: SITE_NAME,
        url: `${SITE_URL}/`,
        logo: `${SITE_URL}/icon.svg`,
      },
    ],
  });
}
