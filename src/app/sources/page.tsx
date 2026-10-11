import type { Metadata, ResolvingMetadata } from "next";
import Link from "next/link";
import { InfoPage } from "@/components/InfoPage";
import { CHANNELS } from "@/lib/channels";
import { buildDirectory, type DirectoryEntry } from "@/lib/directory";
import { cachedResults } from "@/lib/feed";
import { cachedLogoShapes } from "@/lib/logos";
import {
  INDEXABLE,
  shareMetadata,
  SOURCES_DESCRIPTION,
  SOURCES_PATH,
  SOURCES_TITLE,
  sourcesJsonLd,
  VIDEOS_PATH,
} from "@/lib/site";
import { ACTIVE_SOURCES } from "@/lib/sources";
import { cachedVideoFeed } from "@/lib/videos";

// The lines about each outlet come from the server's cache, as it is when the page is asked for.
export const dynamic = "force-dynamic";

export async function generateMetadata(_: unknown, parent: ResolvingMetadata): Promise<Metadata> {
  return {
    title: { absolute: SOURCES_TITLE },
    description: SOURCES_DESCRIPTION,
    alternates: { canonical: SOURCES_PATH },
    robots: INDEXABLE,
    ...(await shareMetadata(parent, { title: SOURCES_TITLE, description: SOURCES_DESCRIPTION, url: SOURCES_PATH })),
  };
}

/** Every outlet Bartaboard reads, grouped, each with its own site, its headlines here and its videos. */
export default function SourcesPage() {
  const groups = buildDirectory(cachedResults(), cachedLogoShapes(), cachedVideoFeed());
  return (
    <InfoPage
      wide
      title="All Bangladesh newspapers and news sites"
      intro={
        <>
          <p>
            Bartaboard collects the latest headlines from {ACTIVE_SOURCES.length} Bangladeshi newspapers and news sites,
            in Bangla and English, and the latest videos from {CHANNELS.length} TV news channels on YouTube. Each one
            below links to its own site and to its headlines or videos here.
          </p>
          <p lang="bn">সকল বাংলা পত্রিকা, অনলাইন সংবাদ ও টিভি চ্যানেলের সর্বশেষ খবর এক জায়গায়।</p>
        </>
      }
    >
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: sourcesJsonLd(groups) }} />
      <nav aria-label="Groups" className="flex flex-wrap gap-2">
        {groups.map((g) => (
          <a
            key={g.id}
            href={`#${g.id}`}
            className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm font-medium text-muted transition hover:text-foreground"
          >
            {g.title} <span className="tabular-nums text-muted/70">{g.entries.length}</span>
          </a>
        ))}
      </nav>
      {groups.map((g) => (
        <section key={g.id} id={g.id} className="scroll-mt-6">
          <h2 className="mt-10 font-display text-2xl font-semibold">
            {g.title} <span className="font-sans text-base font-normal tabular-nums text-muted">{g.entries.length}</span>
          </h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {g.entries.map((e) => (
              <Entry key={e.id} entry={e} />
            ))}
          </ul>
        </section>
      ))}
    </InfoPage>
  );
}

function Entry({ entry: e }: { entry: DirectoryEntry }) {
  const youtube = e.youtubeId && `https://www.youtube.com/channel/${e.youtubeId}`;
  const wide = e.logoShape && e.logoShape.width / e.logoShape.height >= 1.8;
  const external = "font-semibold text-accent hover:underline";
  return (
    <li className="flex flex-col rounded-2xl border border-line bg-surface p-4 shadow-card">
      {e.logo && (
        // eslint-disable-next-line @next/next/no-img-element -- outlets' logos, measured by the fetch script
        <img
          src={e.logo}
          alt=""
          width={e.logoShape?.width}
          height={e.logoShape?.height}
          loading="lazy"
          decoding="async"
          className={`mb-3 rounded-lg object-contain object-left ring-1 ring-line ${
            e.logoShape?.light ? "bg-neutral-800" : "bg-white"
          } ${wide ? "h-9 w-auto max-w-[180px] px-2 py-1.5" : "h-9 w-9"}`}
        />
      )}
      <h3 className="text-[15px] font-semibold">{e.name}</h3>
      <p className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted">{e.label}</p>
      <p className="mt-2 flex-1 text-sm text-muted">{e.summary}</p>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {e.boardHref && (
          // A full load: the board reads its filters from the address when it opens.
          <a href={e.boardHref} className={external}>
            Headlines
          </a>
        )}
        {e.youtubeId && (
          <Link href={VIDEOS_PATH} className={external}>
            Videos
          </Link>
        )}
        {e.homepage && (
          <a href={e.homepage} target="_blank" rel="noopener" className={external}>
            Website ↗
          </a>
        )}
        {youtube && (
          <>
            <a href={youtube} target="_blank" rel="noopener" className={external}>
              YouTube ↗
            </a>
            <a href={`${youtube}/live`} target="_blank" rel="noopener" className={external}>
              Live ↗
            </a>
          </>
        )}
      </p>
    </li>
  );
}
