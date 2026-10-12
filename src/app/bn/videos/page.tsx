import type { Metadata, ResolvingMetadata } from "next";
import { NewsBoardFromUrl } from "@/components/NewsBoard";
import { readVideoSeed } from "@/lib/feed";
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

/** Videos in Bangla (/bn/videos/): the newest videos prerendered, the headlines loaded only if the reader leaves. */
export default function BanglaVideosPage() {
  const videoSeed = readVideoSeed();
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: videosJsonLd(videoSeed?.generatedAt, "bn") }}
      />
      <NewsBoardFromUrl sources={SOURCES} view="videos" videoSeed={videoSeed} locale="bn" />
    </>
  );
}
