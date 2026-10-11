import type { Metadata, ResolvingMetadata } from "next";
import { NewsBoard } from "@/components/NewsBoard";
import { cachedSeed } from "@/lib/feed";
import { parseFilters } from "@/lib/filters";
import { faqJsonLd, INDEXABLE, shareMetadata, SITE_DESCRIPTION, SITE_TITLE, siteJsonLd } from "@/lib/site";
import { SOURCES } from "@/lib/sources";

const SOURCE_IDS = new Set(SOURCES.map((s) => s.id));

export async function generateMetadata(_: unknown, parent: ResolvingMetadata): Promise<Metadata> {
  return {
    // Filtered views (/?view=latest…) are the same page.
    alternates: { canonical: "/" },
    robots: INDEXABLE,
    ...(await shareMetadata(parent, { title: SITE_TITLE, description: SITE_DESCRIPTION, url: "/" })),
  };
}

// Rendered per request so the view and filters in the URL (shared links) apply on first paint, with
// the cached headlines already in the page.
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const seed = cachedSeed();
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: siteJsonLd(seed?.generatedAt) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqJsonLd() }} />
      <NewsBoard sources={SOURCES} initial={parseFilters(await searchParams, SOURCE_IDS)} seed={seed} />
    </>
  );
}
