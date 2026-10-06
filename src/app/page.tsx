import type { Metadata } from "next";
import { NewsBoardFromUrl } from "@/components/NewsBoard";
import { readSeed } from "@/lib/feed";
import { INDEXABLE, siteJsonLd } from "@/lib/site";
import { SOURCES } from "@/lib/sources";

export const metadata: Metadata = {
  // Filtered views (/?view=latest…) are the same page.
  alternates: { canonical: "/" },
  robots: INDEXABLE,
};

export default function Home() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: siteJsonLd() }} />
      <NewsBoardFromUrl sources={SOURCES} seed={readSeed()} />
    </>
  );
}
