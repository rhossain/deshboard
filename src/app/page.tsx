import type { Metadata } from "next";
import { NewsBoard } from "@/components/NewsBoard";
import { cachedSeed } from "@/lib/feed";
import { parseFilters } from "@/lib/filters";
import { INDEXABLE, siteJsonLd } from "@/lib/site";
import { SOURCES } from "@/lib/sources";

const SOURCE_IDS = new Set(SOURCES.map((s) => s.id));

export const metadata: Metadata = {
  // Filtered views (/?view=latest…) are the same page.
  alternates: { canonical: "/" },
  robots: INDEXABLE,
};

// Rendered per request so the view and filters in the URL (shared links) apply on first paint, with
// the cached headlines already in the page.
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: siteJsonLd() }} />
      <NewsBoard sources={SOURCES} initial={parseFilters(await searchParams, SOURCE_IDS)} seed={cachedSeed()} />
    </>
  );
}
