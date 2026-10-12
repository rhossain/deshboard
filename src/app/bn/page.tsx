import type { Metadata, ResolvingMetadata } from "next";
import { NewsBoard } from "@/components/NewsBoard";
import { cachedSeed } from "@/lib/feed";
import { parseFilters } from "@/lib/filters";
import { localePath } from "@/lib/i18n";
import { bnBoardJsonLd, faqJsonLd, INDEXABLE, localeAlternates, shareMetadata, siteDescription, siteTitle } from "@/lib/site";
import { SOURCES } from "@/lib/sources";

const SOURCE_IDS = new Set(SOURCES.map((s) => s.id));
const title = siteTitle("bn");
const description = siteDescription("bn");

export async function generateMetadata(_: unknown, parent: ResolvingMetadata): Promise<Metadata> {
  return {
    title: { absolute: title },
    description,
    alternates: localeAlternates("/", "bn"),
    robots: INDEXABLE,
    ...(await shareMetadata(parent, { title, description, url: localePath("/", "bn"), locale: "bn" })),
  };
}

/** The board in Bangla: the same headlines as /, with a Bangla interface. Rendered per request, as / is. */
export default async function BanglaHome({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const seed = cachedSeed();
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: bnBoardJsonLd(seed?.generatedAt) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqJsonLd("bn") }} />
      <NewsBoard sources={SOURCES} initial={parseFilters(await searchParams, SOURCE_IDS)} seed={seed} locale="bn" />
    </>
  );
}
