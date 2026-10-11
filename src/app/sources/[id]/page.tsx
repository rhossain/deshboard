import type { Metadata, ResolvingMetadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InfoPage } from "@/components/InfoPage";
import { fullTime } from "@/components/time";
import { thumb, watchUrl } from "@/components/youtube";
import { CATEGORIES } from "@/lib/categories";
import { buildDirectory, OUTLETS, type Outlet, outletContent } from "@/lib/directory";
import { readFeed, readVideos } from "@/lib/feed";
import {
  categoryPath,
  INDEXABLE,
  outletDescription,
  outletHeading,
  outletJsonLd,
  outletTitle,
  shareMetadata,
  SOURCES_PATH,
  VIDEOS_PATH,
} from "@/lib/site";
import { itemTime } from "@/lib/stories";

type Props = { params: Promise<{ id: string }> };

/** Headlines and videos listed on an outlet's page, newest first. */
const HEADLINES = 40;
const VIDEOS = 12;

// One page per outlet, prerendered (static export); any other address is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return OUTLETS.map((o) => ({ id: o.id }));
}

function outletFrom(id: string): Outlet {
  return OUTLETS.find((o) => o.id === id) ?? notFound();
}

/** What the current feeds hold from the outlet. */
function load(o: Outlet) {
  const feed = readFeed();
  const videoFeed = readVideos();
  const entry = buildDirectory(feed, videoFeed)
    .flatMap((g) => g.entries)
    .find((e) => e.id === o.id)!;
  return { entry, ...outletContent(o, feed, videoFeed) };
}

export async function generateMetadata({ params }: Props, parent: ResolvingMetadata): Promise<Metadata> {
  const o = outletFrom((await params).id);
  const { entry, headlines, videos } = load(o);
  const title = outletTitle(o);
  const description = outletDescription(o);
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: entry.href },
    // A page with nothing on it right now isn't worth a place in search results.
    robots: headlines.length || videos.length ? INDEXABLE : { index: false, follow: true },
    ...(await shareMetadata(parent, { title, description, url: entry.href })),
  };
}

/** One outlet: what it is, its latest headlines (with their sections) and its latest videos. */
export default async function OutletPage({ params }: Props) {
  const o = outletFrom((await params).id);
  const { entry, headlines, videos, updated } = load(o);
  const youtube = entry.youtubeId && `https://www.youtube.com/channel/${entry.youtubeId}`;
  const sections = CATEGORIES.map((c) => ({ ...c, count: headlines.filter((h) => h.category === c.id).length }))
    .filter((c) => c.count && categoryPath(c.id))
    .sort((a, b) => b.count - a.count);
  const link = "font-semibold text-accent hover:underline";

  return (
    <InfoPage
      wide
      title={outletHeading(o)}
      intro={
        <>
          <p>
            {entry.label}. {entry.summary}
          </p>
          <p lang="bn">
            {o.name}-এর {o.source ? "আজকের সর্বশেষ খবর" : "সর্বশেষ সংবাদ ভিডিও"}, এক জায়গায়।
          </p>
        </>
      }
    >
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: outletJsonLd(o, entry, updated) }} />
      <p className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {entry.homepage && (
          <a href={entry.homepage} target="_blank" rel="noopener" className={link}>
            Website ↗
          </a>
        )}
        {entry.boardHref && (
          // A full load: the board reads its filters from the address when it opens.
          <a href={entry.boardHref} className={link}>
            On the board
          </a>
        )}
        {youtube && (
          <>
            <a href={youtube} target="_blank" rel="noopener" className={link}>
              YouTube ↗
            </a>
            <a href={`${youtube}/live`} target="_blank" rel="noopener" className={link}>
              Watch live ↗
            </a>
          </>
        )}
        <Link href={SOURCES_PATH} className={link}>
          All newspapers
        </Link>
      </p>

      {o.source && (
        <section>
          <h2 className="mt-10 font-display text-2xl font-semibold">Latest headlines</h2>
          {sections.length > 0 && (
            <p className="mt-3 flex flex-wrap gap-2 text-sm">
              {sections.map((c) => (
                <a
                  key={c.id}
                  href={categoryPath(c.id)}
                  className="rounded-full border border-line bg-surface px-3 py-1 text-muted transition hover:text-foreground"
                >
                  {c.label} <span className="tabular-nums text-muted/70">{c.count}</span>
                </a>
              ))}
            </p>
          )}
          {headlines.length ? (
            <ol className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface">
              {headlines.slice(0, HEADLINES).map((h) => (
                <li key={h.link} className="px-4 py-3">
                  <a
                    href={h.link}
                    target="_blank"
                    rel="noopener"
                    lang={h.lang}
                    className="text-[15px] font-medium leading-snug hover:text-accent"
                  >
                    {h.title}
                  </a>
                  <p className="mt-1 text-xs text-muted">
                    {CATEGORIES.find((c) => c.id === h.category)?.label}
                    {itemTime(h) && (
                      <>
                        {" · "}
                        <time dateTime={itemTime(h)}>{fullTime(itemTime(h))}</time>
                      </>
                    )}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-4 text-sm text-muted">No headlines from {o.name} on the board right now.</p>
          )}
        </section>
      )}

      {o.channel && (
        <section>
          <h2 className="mt-10 font-display text-2xl font-semibold">Latest videos</h2>
          {videos.length ? (
            <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {videos.slice(0, VIDEOS).map((v) => (
                <li key={v.id}>
                  <a href={watchUrl(v.id)} target="_blank" rel="noopener" className="group block">
                    {/* eslint-disable-next-line @next/next/no-img-element -- YouTube's own thumbnails, already sized */}
                    <img
                      src={thumb(v.id, "mqdefault")}
                      alt=""
                      width={320}
                      height={180}
                      loading="lazy"
                      decoding="async"
                      className="aspect-video w-full rounded-xl bg-surface-2 object-cover"
                    />
                    <span lang="bn" className="mt-2 block text-sm font-medium leading-snug group-hover:text-accent">
                      {v.title}
                    </span>
                  </a>
                  <time dateTime={v.publishedAt} className="mt-1 block text-xs text-muted">
                    {fullTime(v.publishedAt)}
                  </time>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-muted">No videos from {o.name} in the last day.</p>
          )}
          <p className="mt-4 text-sm">
            <Link href={VIDEOS_PATH} className={link}>
              All TV news videos
            </Link>
          </p>
        </section>
      )}
    </InfoPage>
  );
}
