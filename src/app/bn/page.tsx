import type { Metadata, ResolvingMetadata } from "next";
import { NewsBoardFromUrl } from "@/components/NewsBoard";
import { readSeed } from "@/lib/feed";
import { feedLink } from "@/lib/rss";
import { bnBoardJsonLd, faqJsonLd, INDEXABLE, localeAlternates, shareMetadata, siteDescription, siteTitle } from "@/lib/site";
import { SOURCES } from "@/lib/sources";

const title = siteTitle("bn");
const description = siteDescription("bn");

export async function generateMetadata(_: unknown, parent: ResolvingMetadata): Promise<Metadata> {
  return {
    title: { absolute: title },
    description,
    // The feeds are shared with the English pages (headlines are never translated).
    alternates: { ...localeAlternates("/", "bn"), types: feedLink("/", "বাংলাদেশের সর্বশেষ খবর") },
    robots: INDEXABLE,
    ...(await shareMetadata(parent, { title, description, url: "/bn/", locale: "bn" })),
  };
}

/** The board in Bangla: the same headlines as /, with a Bangla interface. */
export default function BanglaHome() {
  const seed = readSeed();
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: bnBoardJsonLd(seed?.generatedAt) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqJsonLd("bn") }} />
      <NewsBoardFromUrl sources={SOURCES} seed={seed} locale="bn" />
    </>
  );
}
