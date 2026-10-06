import type { Metadata, ResolvingMetadata } from "next";
import { notFound } from "next/navigation";
import { NewsBoard } from "@/components/NewsBoard";
import type { Category } from "@/lib/categories";
import { cachedSeed } from "@/lib/feed";
import { parseFilters } from "@/lib/filters";
import {
  CATEGORY_PAGES,
  categoryDescription,
  categoryJsonLd,
  categoryPath,
  categoryTitle,
  INDEXABLE,
  SITE_NAME,
} from "@/lib/site";
import { SOURCES } from "@/lib/sources";

type Props = {
  params: Promise<{ category: Category }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const SOURCE_IDS = new Set(SOURCES.map((s) => s.id));

/** The section from the address, or a 404 for anything that isn't one with a page. */
async function sectionFrom(params: Props["params"]): Promise<Category> {
  const { category } = await params;
  if (!CATEGORY_PAGES.some((c) => c.id === category)) notFound();
  return category;
}

export async function generateMetadata({ params }: Props, parent: ResolvingMetadata): Promise<Metadata> {
  const category = await sectionFrom(params);
  // The site's share image (app/opengraph-image.tsx); setting openGraph here would otherwise drop it.
  const { openGraph, twitter } = await parent;
  const title = categoryTitle(category);
  const description = categoryDescription(category);
  const url = categoryPath(category);
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    robots: INDEXABLE,
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

/** The board opened on one section (/news/sports), with that section's cached headlines in the page. */
export default async function CategoryPage({ params, searchParams }: Props) {
  const category = await sectionFrom(params);
  const initial = { ...parseFilters(await searchParams, SOURCE_IDS), category };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: categoryJsonLd(category) }} />
      <NewsBoard sources={SOURCES} initial={initial} seed={cachedSeed(category)} />
    </>
  );
}
