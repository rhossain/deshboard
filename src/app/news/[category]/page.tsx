import type { Metadata, ResolvingMetadata } from "next";
import { notFound } from "next/navigation";
import { NewsBoard } from "@/components/NewsBoard";
import type { Category } from "@/lib/categories";
import { cachedSeed } from "@/lib/feed";
import { parseFilters } from "@/lib/filters";
import { feedLink } from "@/lib/rss";
import {
  CATEGORY_PAGES,
  categoryDescription,
  categoryJsonLd,
  categoryPath,
  categoryTitle,
  INDEXABLE,
  localeAlternates,
  shareMetadata,
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
  const title = categoryTitle(category);
  const description = categoryDescription(category);
  const url = categoryPath(category)!;
  return {
    title: { absolute: title },
    description,
    alternates: {
      ...localeAlternates(url, "en"),
      types: feedLink(url, `Bangladesh ${CATEGORY_PAGES.find((c) => c.id === category)!.label.toLowerCase()} news`),
    },
    robots: INDEXABLE,
    ...(await shareMetadata(parent, { title, description, url })),
  };
}

/** The board opened on one section (/news/sports), with that section's cached headlines in the page. */
export default async function CategoryPage({ params, searchParams }: Props) {
  const category = await sectionFrom(params);
  const initial = { ...parseFilters(await searchParams, SOURCE_IDS), category };
  const seed = cachedSeed(category);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: categoryJsonLd(category, seed?.generatedAt) }}
      />
      <NewsBoard sources={SOURCES} initial={initial} seed={seed} />
    </>
  );
}
