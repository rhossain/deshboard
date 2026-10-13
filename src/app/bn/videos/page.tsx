import type { Metadata, ResolvingMetadata } from "next";
import { VideosPageBoard } from "@/components/VideosPageBoard";
import { parseFilters } from "@/lib/filters";
import { localePath } from "@/lib/i18n";
import {
  INDEXABLE,
  localeAlternates,
  shareMetadata,
  VIDEOS_PATH,
  videosDescription,
  videosJsonLd,
  videosTitle,
} from "@/lib/site";
import { SOURCES } from "@/lib/sources";
import { cachedVideoSeed } from "@/lib/videos";

const SOURCE_IDS = new Set(SOURCES.map((s) => s.id));
const title = videosTitle("bn");
const description = videosDescription("bn");

export async function generateMetadata(_: unknown, parent: ResolvingMetadata): Promise<Metadata> {
  return {
    title: { absolute: title },
    description,
    alternates: localeAlternates(VIDEOS_PATH, "bn"),
    robots: INDEXABLE,
    ...(await shareMetadata(parent, { title, description, url: localePath(VIDEOS_PATH, "bn"), locale: "bn" })),
  };
}

/** Videos in Bangla (/bn/videos): the newest cached videos in the page, the headlines loaded only if the reader leaves. */
export default async function BanglaVideosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const initial = { ...parseFilters(await searchParams, SOURCE_IDS), view: "videos" as const };
  const videoSeed = cachedVideoSeed();
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: videosJsonLd(videoSeed?.generatedAt, "bn") }}
      />
      <VideosPageBoard sources={SOURCES} initial={initial} videoSeed={videoSeed} locale="bn" />
    </>
  );
}
