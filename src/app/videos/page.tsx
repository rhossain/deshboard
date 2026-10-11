import type { Metadata, ResolvingMetadata } from "next";
import { NewsBoard } from "@/components/NewsBoard";
import { parseFilters } from "@/lib/filters";
import { feedLink } from "@/lib/rss";
import {
  INDEXABLE,
  shareMetadata,
  VIDEOS_DESCRIPTION,
  VIDEOS_PATH,
  VIDEOS_TITLE,
  videosJsonLd,
} from "@/lib/site";
import { SOURCES } from "@/lib/sources";
import { cachedVideoSeed } from "@/lib/videos";

const SOURCE_IDS = new Set(SOURCES.map((s) => s.id));

export async function generateMetadata(_: unknown, parent: ResolvingMetadata): Promise<Metadata> {
  return {
    title: { absolute: VIDEOS_TITLE },
    description: VIDEOS_DESCRIPTION,
    alternates: { canonical: VIDEOS_PATH, types: feedLink(VIDEOS_PATH, "Bangladesh TV news videos") },
    robots: INDEXABLE,
    ...(await shareMetadata(parent, { title: VIDEOS_TITLE, description: VIDEOS_DESCRIPTION, url: VIDEOS_PATH })),
  };
}

/**
 * The board opened on Videos, with the newest cached videos in the page; the headlines load only if
 * the reader leaves it. Rendered per request, so a search in the URL (?q=) applies on first paint.
 */
export default async function VideosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const initial = { ...parseFilters(await searchParams, SOURCE_IDS), view: "videos" as const };
  const videoSeed = cachedVideoSeed();
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: videosJsonLd(videoSeed?.generatedAt) }} />
      <NewsBoard sources={SOURCES} initial={initial} videoSeed={videoSeed} />
    </>
  );
}
