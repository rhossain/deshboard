import type { Metadata, ResolvingMetadata } from "next";
import { CATEGORIES, type Category } from "./categories";
import { type DirectoryEntry, type DirectoryGroup, type Outlet, outletName } from "./directory";
import { type Locale, languageAlternates, LANG_TAG, localDigits, localePath, OG_LOCALE } from "./i18n";
import { possessive } from "./bn-names";
import { faq } from "./intros";
import { CHANNELS } from "./channels";
import { ACTIVE_SOURCES } from "./sources";
import { itemTime, newestFirst } from "./stories";
import type { SourceResult } from "./types";

/** The public address, for absolute URLs (canonical, sitemap, share image). Set SITE_URL when deploying. */
export const SITE_URL = (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
/**
 * Cloudflare Web Analytics, which sets no cookies (see the privacy policy): the bartaboard.com site's beacon
 * token, public by design. Only builds for the live address load it, so local and preview visits aren't counted.
 */
export const ANALYTICS_TOKEN = SITE_URL === "https://bartaboard.com" ? "3863450a3aa6492697268bf75bc17f86" : null;
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

/** A section's news as Bangla says it: "খেলার খবর", not "খেলা খবর". */
const BN_NEWS: Record<Exclude<Category, "other">, string> = {
  national: "জাতীয় খবর",
  politics: "রাজনীতির খবর",
  international: "আন্তর্জাতিক খবর",
  business: "অর্থনীতির খবর",
  sports: "খেলার খবর",
  entertainment: "বিনোদনের খবর",
  tech: "বিজ্ঞান-প্রযুক্তির খবর",
  education: "শিক্ষার খবর",
  health: "স্বাস্থ্যের খবর",
  lifestyle: "জীবনযাপনের খবর",
  crime: "আইন-অপরাধের খবর",
  opinion: "মতামত ও কলাম",
};
const bnNews = (category: Category) => BN_NEWS[category as Exclude<Category, "other">];
/** A count in the page's digits: "59", "৫৯". */
const n = (count: number, locale: Locale) => localDigits(String(count), locale);

/** The board's title and description, in each language (the English ones are SITE_TITLE and SITE_DESCRIPTION). */
export function siteTitle(locale: Locale = "en"): string {
  return locale === "bn" ? `আজকের খবর: সব বাংলা পত্রিকা এক জায়গায় | ${SITE_NAME}` : SITE_TITLE;
}

export function siteDescription(locale: Locale = "en"): string {
  return locale === "bn"
    ? `বাংলাদেশের ${n(ACTIVE_SOURCES.length, locale)}টি সংবাদপত্র ও নিউজ সাইটের সর্বশেষ বাংলা ও ইংরেজি শিরোনাম এক পাতায়: ` +
        "প্রথম আলো, যুগান্তর, দ্য ডেইলি স্টার, বিডিনিউজ২৪ সহ, সঙ্গে শীর্ষ খবর।"
    : SITE_DESCRIPTION;
}

export function categoryTitle(category: Category, locale: Locale = "en"): string {
  const c = PAGE_BY_ID.get(category)!;
  if (locale === "bn") return `আজকের ${bnNews(category)}: সব পত্রিকা এক জায়গায় | ${SITE_NAME}`;
  const title = `Bangladesh ${c.label} News Today (${c.bn})`;
  // Past about 60 characters Google cuts the title short; the section's own words matter more than the name.
  return title.length + SITE_NAME.length + 3 > 60 ? title : `${title} | ${SITE_NAME}`;
}

/** The Videos view's own page: TV news channels' latest videos. */
export const VIDEOS_PATH = "/videos";
export const VIDEOS_TITLE = `Bangla TV News Videos Today, ${CHANNELS.length} Channels | ${SITE_NAME}`;
export const VIDEOS_DESCRIPTION =
  `Latest Bangladesh TV news videos from ${CHANNELS.length} channels on YouTube, including Jamuna TV, Somoy TV, ` +
  "Channel 24 and BBC News Bangla, newest first, free to watch.";

export function videosTitle(locale: Locale = "en"): string {
  return locale === "bn" ? `আজকের টিভি সংবাদ ভিডিও, ${n(CHANNELS.length, locale)}টি চ্যানেল | ${SITE_NAME}` : VIDEOS_TITLE;
}

export function videosDescription(locale: Locale = "en"): string {
  return locale === "bn"
    ? `ইউটিউবে ${n(CHANNELS.length, locale)}টি টিভি চ্যানেলের সর্বশেষ সংবাদ ভিডিও: যমুনা টিভি, সময় টিভি, চ্যানেল ২৪, ` +
        "বিবিসি নিউজ বাংলা সহ, নতুনগুলো আগে, বিনা খরচে।"
    : VIDEOS_DESCRIPTION;
}

/** The sources page: every outlet Bartaboard reads. */
export const SOURCES_PATH = "/sources";
const KIND_COUNT = (kind: string) => ACTIVE_SOURCES.filter((s) => s.kind === kind).length;
export const SOURCES_TITLE = `All Bangladesh Newspapers & News Sites (${ACTIVE_SOURCES.length}) | ${SITE_NAME}`;
export const SOURCES_DESCRIPTION =
  `All Bangla and English news sources on ${SITE_NAME}: ${KIND_COUNT("Newspaper")} newspapers, ${KIND_COUNT("Online")} ` +
  `news sites, ${KIND_COUNT("TV")} TV stations and ${KIND_COUNT("Agency")} agencies, plus ${CHANNELS.length} TV ` +
  "channels on YouTube.";

/** The sources page's title and description in each language (the English ones are the constants above). */
export function sourcesTitle(locale: Locale = "en"): string {
  return locale === "bn"
    ? `সব বাংলা পত্রিকা ও সংবাদ সাইট (${n(ACTIVE_SOURCES.length, locale)}টি) | ${SITE_NAME}`
    : SOURCES_TITLE;
}

export function sourcesDescription(locale: Locale = "en"): string {
  if (locale !== "bn") return SOURCES_DESCRIPTION;
  return (
    `${SITE_NAME}-এর সব বাংলা ও ইংরেজি সংবাদ উৎস: ${n(KIND_COUNT("Newspaper"), locale)}টি সংবাদপত্র, ` +
    `${n(KIND_COUNT("Online"), locale)}টি অনলাইন সংবাদ সাইট, ${n(KIND_COUNT("TV"), locale)}টি টিভি স্টেশন ও ` +
    `${n(KIND_COUNT("Agency"), locale)}টি সংবাদ সংস্থা, সঙ্গে ইউটিউবে ${n(CHANNELS.length, locale)}টি টিভি চ্যানেল।`
  );
}

/** An outlet's own page: a news site's latest headlines, or a channel's latest videos. */
export function outletTitle(o: Outlet, locale: Locale = "en"): string {
  if (locale === "bn") {
    const name = outletName(o, locale);
    const whose = possessive(name);
    return o.source ? `${whose} আজকের সর্বশেষ খবর | ${SITE_NAME}` : `${whose} আজকের সংবাদ ভিডিও | ${SITE_NAME}`;
  }
  return o.source
    ? `${o.name} Latest News Headlines Today | ${SITE_NAME}`
    : `${o.name} News Today: Latest Videos | ${SITE_NAME}`;
}

export function outletHeading(o: Outlet, locale: Locale = "en"): string {
  if (locale === "bn") {
    const name = outletName(o, locale);
    return o.source ? `${possessive(name)} সর্বশেষ খবর` : `${possessive(name)} আজকের সংবাদ ভিডিও`;
  }
  return o.source ? `${o.name} latest news headlines` : `${o.name} news today: latest videos`;
}

export function outletDescription(o: Outlet, locale: Locale = "en"): string {
  if (locale === "bn") {
    const name = outletName(o, locale);
    if (!o.source) {
      return `ইউটিউবে ${possessive(name)} সর্বশেষ সংবাদ ভিডিও, নতুনগুলো আগে, সঙ্গে লাইভ দেখার লিংক। ${SITE_NAME}-এ কয়েক মিনিট পরপর হালনাগাদ।`;
    }
    const host = new URL(o.source.homepage).hostname.replace(/^www\./, "");
    const videos = o.channel ? " ও ভিডিও" : "";
    return `${possessive(name)} আজকের সর্বশেষ শিরোনাম${videos}, ${SITE_NAME}-এ কয়েক মিনিট পরপর হালনাগাদ। প্রতিটি খবর ${host}-এ নিয়ে যায়।`;
  }
  if (!o.source) {
    return `The latest news videos from ${o.name}'s YouTube channel, newest first, with a link to its live stream. Updated every few minutes on ${SITE_NAME}.`;
  }
  const host = new URL(o.source.homepage).hostname.replace(/^www\./, "");
  const videos = o.channel ? " and videos" : "";
  return `Today's latest ${o.name} headlines${videos}, updated every few minutes on ${SITE_NAME}. Each story links to ${host}.`;
}

/** The about page: what Bartaboard is and how it works. */
export const ABOUT_PATH = "/about";
export const ABOUT_TITLE = `About ${SITE_NAME}, the Bangladesh News Aggregator`;
export const ABOUT_DESCRIPTION =
  `${SITE_NAME} puts the latest headlines from ${ACTIVE_SOURCES.length} Bangladeshi news sites and videos from ` +
  `${CHANNELS.length} TV channels on one free board, kept up to date all day.`;

export function aboutTitle(locale: Locale = "en"): string {
  return locale === "bn" ? `${SITE_NAME} সম্পর্কে: বাংলাদেশের সব খবর এক জায়গায়` : ABOUT_TITLE;
}

export function aboutDescription(locale: Locale = "en"): string {
  return locale === "bn"
    ? `${SITE_NAME} বাংলাদেশের ${n(ACTIVE_SOURCES.length, locale)}টি সংবাদ সাইটের সর্বশেষ শিরোনাম আর ` +
        `${n(CHANNELS.length, locale)}টি টিভি চ্যানেলের ভিডিও একটি বিনা মূল্যের বোর্ডে রাখে, সারা দিন হালনাগাদ থাকে।`
    : ABOUT_DESCRIPTION;
}

/**
 * The page's visible heading: what it holds, in the words people search for. No source count: it
 * changes as outlets come and go, and not all of them are newspapers (descriptions carry the count).
 */
export function boardHeading(category?: Category | "", videos = false, locale: Locale = "en"): string {
  if (locale === "bn") {
    if (videos) return "আজকের টিভি সংবাদ ভিডিও";
    return category && PAGE_BY_ID.has(category)
      ? `আজকের ${bnNews(category)}`
      : "বাংলাদেশের সর্বশেষ খবর, বাংলা ও ইংরেজিতে";
  }
  if (videos) return "Bangladesh TV news videos today";
  const c = category ? PAGE_BY_ID.get(category) : undefined;
  return c
    ? `Bangladesh ${c.label.toLowerCase()} news today (${c.bn})`
    : "Latest Bangladesh news headlines, Bangla and English";
}

export function categoryDescription(category: Category, locale: Locale = "en"): string {
  const c = PAGE_BY_ID.get(category)!;
  if (locale === "bn") {
    return (
      `বাংলাদেশের ${n(ACTIVE_SOURCES.length, locale)}টি সংবাদপত্র ও নিউজ সাইট থেকে আজকের সর্বশেষ ${bnNews(category)}, ` +
      "বাংলা ও ইংরেজিতে, এক পাতায়।"
    );
  }
  return (
    `Latest ${c.label.toLowerCase()} news from Bangladesh: ${c.bn} headlines in Bangla and English from ` +
    `${ACTIVE_SOURCES.length} news portals, on one board.`
  );
}

/** Headlines prerendered per card: a full card (as many as it shows) for the first few, a few after that. */
export const SEED_PER_SOURCE = 8;
const SEED_FULL_CARDS = 6;
const SEED_PER_LATER_SOURCE = 3;

/**
 * A small slice of the results for the server-rendered page, so it carries real headlines for search
 * engines and first paint without shipping the whole feed twice. Each source keeps its newest
 * headlines (in `category` only, when given): enough to fill the cards in view on any screen, and a
 * few for the cards further down, which hold placeholders for the rest until the feed loads.
 * `fullCards`: how many sources get a full card (a page's head file gives every source one).
 */
export function seedResults(
  results: SourceResult[],
  category?: Category,
  fullCards = SEED_FULL_CARDS,
): SourceResult[] {
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
      .slice(0, fullCards),
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
  { title, description, url, locale = "en" }: { title: string; description: string; url: string; locale?: Locale },
): Promise<Pick<Metadata, "openGraph" | "twitter">> {
  const { openGraph, twitter } = await parent;
  return {
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      type: "website",
      locale: OG_LOCALE[locale],
      alternateLocale: [OG_LOCALE[locale === "bn" ? "en" : "bn"]],
      images: openGraph?.images,
    },
    twitter: { card: "summary_large_image", title, description, images: twitter?.images },
  };
}

/**
 * Structured data for a section's page: what it is, and where it sits under the board. `updated` is
 * when the headlines were last collected.
 */
export function categoryJsonLd(category: Category, updated?: string, locale: Locale = "en"): string {
  const c = PAGE_BY_ID.get(category)!;
  const url = `${SITE_URL}${localePath(categoryPath(category)!, locale)}`;
  return jsonLd({
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": url,
        url,
        name: categoryTitle(category, locale),
        description: categoryDescription(category, locale),
        inLanguage: LANG_TAG[locale],
        dateModified: updated,
        isPartOf: { "@id": `${SITE_URL}/#website` },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: SITE_NAME, item: `${SITE_URL}${localePath("/", locale)}` },
          { "@type": "ListItem", position: 2, name: locale === "bn" ? bnNews(category) : `${c.label} news`, item: url },
        ],
      },
    ],
  });
}

/** Structured data for the Bangla board (/bn/): a page of the site, in Bangla. */
export function bnBoardJsonLd(updated?: string): string {
  const url = `${SITE_URL}${localePath("/", "bn")}`;
  return jsonLd({
    "@type": "CollectionPage",
    "@id": url,
    url,
    name: siteTitle("bn"),
    description: siteDescription("bn"),
    inLanguage: "bn",
    dateModified: updated,
    isPartOf: { "@id": `${SITE_URL}/#website` },
  });
}

/**
 * A page's canonical address and its other-language twin, for metadata `alternates`. `path` is the
 * English address; the Bangla page canonicalises to its own /bn/ address.
 */
export function localeAlternates(path: string, locale: Locale): { canonical: string; languages: Record<string, string> } {
  return { canonical: localePath(path, locale), languages: languageAlternates(path) };
}

/** Structured data for the sources page: the outlets, as news organisations. */
export function sourcesJsonLd(groups: DirectoryGroup[], locale: Locale = "en"): string {
  const url = `${SITE_URL}${localePath(SOURCES_PATH, locale)}`;
  const entries = groups.flatMap((g) => g.entries);
  const youtube = (id: string) => `https://www.youtube.com/channel/${id}`;
  return jsonLd({
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": url,
        url,
        name: sourcesTitle(locale),
        description: sourcesDescription(locale),
        inLanguage: locale === "bn" ? "bn" : ["en", "bn"],
        isPartOf: { "@id": `${SITE_URL}/#website` },
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: entries.length,
          itemListElement: entries.map((e, i) => ({
            "@type": "ListItem",
            position: i + 1,
            item: {
              "@type": "NewsMediaOrganization",
              name: e.name,
              url: e.homepage ?? youtube(e.youtubeId!),
              ...(e.homepage && e.youtubeId && { sameAs: [youtube(e.youtubeId)] }),
            },
          })),
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: SITE_NAME, item: `${SITE_URL}${localePath("/", locale)}` },
          { "@type": "ListItem", position: 2, name: locale === "bn" ? "সব পত্রিকা" : "All newspapers", item: url },
        ],
      },
    ],
  });
}

/** Structured data for an outlet's page: about the outlet, under the sources page. */
export function outletJsonLd(o: Outlet, entry: DirectoryEntry, updated?: string, locale: Locale = "en"): string {
  const url = `${SITE_URL}${entry.href}`;
  const youtube = entry.youtubeId && `https://www.youtube.com/channel/${entry.youtubeId}`;
  return jsonLd({
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": url,
        url,
        name: outletTitle(o, locale),
        description: outletDescription(o, locale),
        inLanguage: locale === "bn" ? "bn" : (o.source?.lang ?? "bn"),
        dateModified: updated,
        isPartOf: { "@id": `${SITE_URL}/#website` },
        about: {
          "@type": "NewsMediaOrganization",
          name: o.name,
          ...(locale === "bn" && outletName(o, locale) !== o.name && { alternateName: outletName(o, locale) }),
          url: entry.homepage ?? youtube,
          ...(entry.homepage && youtube && { sameAs: [youtube] }),
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: SITE_NAME, item: `${SITE_URL}${localePath("/", locale)}` },
          {
            "@type": "ListItem",
            position: 2,
            name: locale === "bn" ? "সব পত্রিকা" : "All newspapers",
            item: `${SITE_URL}${localePath(SOURCES_PATH, locale)}`,
          },
          { "@type": "ListItem", position: 3, name: outletName(o, locale), item: url },
        ],
      },
    ],
  });
}

/** Structured data for the about page: an AboutPage about the organisation behind the site. */
export function aboutJsonLd(locale: Locale = "en"): string {
  const url = `${SITE_URL}${localePath(ABOUT_PATH, locale)}`;
  return jsonLd({
    "@type": "AboutPage",
    "@id": url,
    url,
    name: aboutTitle(locale),
    description: aboutDescription(locale),
    inLanguage: LANG_TAG[locale],
    isPartOf: { "@id": `${SITE_URL}/#website` },
    about: { "@id": `${SITE_URL}/#organization` },
  });
}

/** The board's questions and answers, as FAQPage data. */
export function faqJsonLd(locale: Locale = "en"): string {
  return jsonLd({
    "@type": "FAQPage",
    inLanguage: LANG_TAG[locale],
    mainEntity: faq(locale).map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  });
}

/** Structured data for the Videos page; `updated` is when the videos were last collected. */
export function videosJsonLd(updated?: string, locale: Locale = "en"): string {
  const url = `${SITE_URL}${localePath(VIDEOS_PATH, locale)}`;
  return jsonLd({
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": url,
        url,
        name: videosTitle(locale),
        description: videosDescription(locale),
        inLanguage: locale === "bn" ? "bn" : ["bn", "en"],
        dateModified: updated,
        isPartOf: { "@id": `${SITE_URL}/#website` },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: SITE_NAME, item: `${SITE_URL}${localePath("/", locale)}` },
          { "@type": "ListItem", position: 2, name: locale === "bn" ? "টিভি সংবাদ ভিডিও" : "TV news videos", item: url },
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
