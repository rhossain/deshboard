import type { Metadata, ResolvingMetadata } from "next";
import { NewsBoardFromUrl } from "@/components/NewsBoard";
import { readSeed } from "@/lib/feed";
import { faqJsonLd, INDEXABLE, shareMetadata, SITE_DESCRIPTION, SITE_TITLE, siteJsonLd } from "@/lib/site";
import { SOURCES } from "@/lib/sources";

export async function generateMetadata(_: unknown, parent: ResolvingMetadata): Promise<Metadata> {
  return {
    // Filtered views (/?view=latest…) are the same page.
    alternates: { canonical: "/" },
    robots: INDEXABLE,
    ...(await shareMetadata(parent, { title: SITE_TITLE, description: SITE_DESCRIPTION, url: "/" })),
  };
}

export default function Home() {
  const seed = readSeed();
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: siteJsonLd(seed?.generatedAt) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqJsonLd() }} />
      <NewsBoardFromUrl sources={SOURCES} seed={seed} />
    </>
  );
}
