import type { Metadata, ResolvingMetadata } from "next";
import { notFound } from "next/navigation";
import { NewsBoard } from "@/components/NewsBoard";
import type { Category } from "@/lib/categories";
import { cachedSeed } from "@/lib/feed";
import { parseFilters } from "@/lib/filters";
import { localePath } from "@/lib/i18n";
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
  const title = categoryTitle(category, "bn");
  const description = categoryDescription(category, "bn");
  const path = categoryPath(category)!;
  return {
    title: { absolute: title },
    description,
    alternates: localeAlternates(path, "bn"),
    robots: INDEXABLE,
    ...(await shareMetadata(parent, { title, description, url: localePath(path, "bn"), locale: "bn" })),
  };
}

/** A section's page in Bangla (/bn/news/sports), with that section's cached headlines in the page. */
export default async function BanglaCategoryPage({ params, searchParams }: Props) {
  const category = await sectionFrom(params);
  const initial = { ...parseFilters(await searchParams, SOURCE_IDS), category };
  const seed = cachedSeed(category);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: categoryJsonLd(category, seed?.generatedAt, "bn") }}
      />
      <NewsBoard sources={SOURCES} initial={initial} seed={seed} locale="bn" />
    </>
  );
}
