import type { Metadata, ResolvingMetadata } from "next";
import { NewsBoardFromUrl } from "@/components/NewsBoard";
import { readVideoSeed } from "@/lib/feed";
import {
  INDEXABLE,
  shareMetadata,
  VIDEOS_DESCRIPTION,
  VIDEOS_PATH,
  VIDEOS_TITLE,
  videosJsonLd,
} from "@/lib/site";
import { SOURCES } from "@/lib/sources";

export async function generateMetadata(_: unknown, parent: ResolvingMetadata): Promise<Metadata> {
  return {
    title: { absolute: VIDEOS_TITLE },
    description: VIDEOS_DESCRIPTION,
    alternates: { canonical: VIDEOS_PATH },
    robots: INDEXABLE,
    ...(await shareMetadata(parent, { title: VIDEOS_TITLE, description: VIDEOS_DESCRIPTION, url: VIDEOS_PATH })),
  };
}

/** The board opened on Videos, with the newest videos prerendered; the headlines load only if the reader leaves. */
export default function VideosPage() {
  const videoSeed = readVideoSeed();
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: videosJsonLd(videoSeed?.generatedAt) }} />
      <NewsBoardFromUrl sources={SOURCES} view="videos" videoSeed={videoSeed} />
    </>
  );
}
