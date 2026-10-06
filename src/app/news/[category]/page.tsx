import type { Metadata, ResolvingMetadata } from "next";
import { NewsBoardFromUrl } from "@/components/NewsBoard";
import type { Category } from "@/lib/categories";
import { readSeed } from "@/lib/feed";
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

type Props = { params: Promise<{ category: Category }> };

// One page per section, prerendered (static export); any other address is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return CATEGORY_PAGES.map((c) => ({ category: c.id }));
}

export async function generateMetadata({ params }: Props, parent: ResolvingMetadata): Promise<Metadata> {
  const { category } = await params;
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

/** The board opened on one section (/news/sports/), with that section's headlines prerendered. */
export default async function CategoryPage({ params }: Props) {
  const { category } = await params;
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: categoryJsonLd(category) }} />
      <NewsBoardFromUrl sources={SOURCES} seed={readSeed(category)} category={category} />
    </>
  );
}
