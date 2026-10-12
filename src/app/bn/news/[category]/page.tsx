import type { Metadata, ResolvingMetadata } from "next";
import { NewsBoardFromUrl } from "@/components/NewsBoard";
import type { Category } from "@/lib/categories";
import { readSeed } from "@/lib/feed";
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

type Props = { params: Promise<{ category: Category }> };

// One page per section, prerendered (static export); any other address is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return CATEGORY_PAGES.map((c) => ({ category: c.id }));
}

export async function generateMetadata({ params }: Props, parent: ResolvingMetadata): Promise<Metadata> {
  const { category } = await params;
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

/** A section's page in Bangla (/bn/news/sports/), with that section's headlines prerendered. */
export default async function BanglaCategoryPage({ params }: Props) {
  const { category } = await params;
  const seed = readSeed(category);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: categoryJsonLd(category, seed?.generatedAt, "bn") }}
      />
      <NewsBoardFromUrl sources={SOURCES} seed={seed} category={category} locale="bn" />
    </>
  );
}
