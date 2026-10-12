import type { Metadata, ResolvingMetadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InfoPage } from "@/components/InfoPage";
import { fullTime } from "@/components/time";
import { thumb, watchUrl } from "@/components/youtube";
import { possessive } from "@/lib/bn-names";
import { CATEGORIES } from "@/lib/categories";
import { buildDirectory, OUTLETS, type Outlet, outletContent, outletName, outletPath } from "@/lib/directory";
import { readFeed, readVideos } from "@/lib/feed";
import { type Locale, languageAlternates, localDigits, localePath } from "@/lib/i18n";
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

/** Headlines and videos listed on an outlet's page, newest first. */
const HEADLINES = 40;
const VIDEOS = 12;

const WORDS = {
  en: {
    tagline: (name: string, site: boolean) => `${possessive(name)} ${site ? "আজকের সর্বশেষ খবর" : "সর্বশেষ সংবাদ ভিডিও"}, এক জায়গায়।`,
    website: "Website ↗",
    onBoard: "On the board",
    watchLive: "Watch live ↗",
    allNewspapers: "All newspapers",
    latestHeadlines: "Latest headlines",
    noHeadlines: (name: string) => `No headlines from ${name} on the board right now.`,
    latestVideos: "Latest videos",
    noVideos: (name: string) => `No videos from ${name} in the last day.`,
    allVideos: "All TV news videos",
  },
  bn: {
    tagline: () => "",
    website: "ওয়েবসাইট ↗",
    onBoard: "বোর্ডে দেখুন",
    watchLive: "লাইভ দেখুন ↗",
    allNewspapers: "সব পত্রিকা",
    latestHeadlines: "সর্বশেষ শিরোনাম",
    noHeadlines: (name: string) => `এই মুহূর্তে বোর্ডে ${possessive(name)} কোনো শিরোনাম নেই।`,
    latestVideos: "সর্বশেষ ভিডিও",
    noVideos: (name: string) => `গত এক দিনে ${possessive(name)} কোনো ভিডিও নেই।`,
    allVideos: "সব টিভি সংবাদ ভিডিও",
  },
};

/** One page per outlet, in each language. */
export function outletParams() {
  return OUTLETS.map((o) => ({ id: o.id }));
}

export function outletFrom(id: string): Outlet {
  return OUTLETS.find((o) => o.id === id) ?? notFound();
}

/** What the current feeds hold from the outlet. */
function load(o: Outlet, locale: Locale) {
  const feed = readFeed();
  const videoFeed = readVideos();
  const entry = buildDirectory(feed, videoFeed, locale)
    .flatMap((g) => g.entries)
    .find((e) => e.id === o.id)!;
  return { entry, ...outletContent(o, feed, videoFeed) };
}

export async function outletMetadata(id: string, locale: Locale, parent: ResolvingMetadata): Promise<Metadata> {
  const o = outletFrom(id);
  const { entry, headlines, videos } = load(o, locale);
  const title = outletTitle(o, locale);
  const description = outletDescription(o, locale);
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: entry.href, languages: languageAlternates(outletPath(o.id)) },
    // A page with nothing on it right now isn't worth a place in search results.
    robots: headlines.length || videos.length ? INDEXABLE : { index: false, follow: true },
    ...(await shareMetadata(parent, { title, description, url: entry.href, locale })),
  };
}

/** One outlet: what it is, its latest headlines (with their sections) and its latest videos. */
export function OutletPage({ id, locale }: { id: string; locale: Locale }) {
  const w = WORDS[locale];
  const o = outletFrom(id);
  const name = outletName(o, locale);
  const { entry, headlines, videos, updated } = load(o, locale);
  const youtube = entry.youtubeId && `https://www.youtube.com/channel/${entry.youtubeId}`;
  const sections = CATEGORIES.map((c) => ({ ...c, count: headlines.filter((h) => h.category === c.id).length }))
    .filter((c) => c.count && categoryPath(c.id))
    .sort((a, b) => b.count - a.count);
  const link = "font-semibold text-accent hover:underline";

  return (
    <InfoPage
      wide
      locale={locale}
      other={outletPath(o.id, locale === "bn" ? "en" : "bn")}
      title={outletHeading(o, locale)}
      intro={
        <>
          <p>
            {entry.label}. {entry.summary}
          </p>
          {locale === "en" && <p lang="bn">{w.tagline(outletName(o, "bn"), !!o.source)}</p>}
        </>
      }
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: outletJsonLd(o, entry, updated, locale) }}
      />
      <p className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {entry.homepage && (
          <a href={entry.homepage} target="_blank" rel="noopener" className={link}>
            {w.website}
          </a>
        )}
        {entry.boardHref && (
          // A full load: the board reads its filters from the address when it opens.
          <a href={entry.boardHref} className={link}>
            {w.onBoard}
          </a>
        )}
        {youtube && (
          <>
            <a href={youtube} target="_blank" rel="noopener" className={link}>
              YouTube ↗
            </a>
            <a href={`${youtube}/live`} target="_blank" rel="noopener" className={link}>
              {w.watchLive}
            </a>
          </>
        )}
        <Link href={localePath(SOURCES_PATH, locale)} className={link}>
          {w.allNewspapers}
        </Link>
      </p>

      {o.source && (
        <section>
          <h2 className="mt-10 font-display text-2xl font-semibold">{w.latestHeadlines}</h2>
          {sections.length > 0 && (
            <p className="mt-3 flex flex-wrap gap-2 text-sm">
              {sections.map((c) => (
                <a
                  key={c.id}
                  href={localePath(categoryPath(c.id)!, locale)}
                  className="rounded-full border border-line bg-surface px-3 py-1 text-muted transition hover:text-foreground"
                >
                  {locale === "bn" ? c.bn : c.label}{" "}
                  <span className="tabular-nums text-muted/70">{localDigits(String(c.count), locale)}</span>
                </a>
              ))}
            </p>
          )}
          {headlines.length ? (
            <ol className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface">
              {headlines.slice(0, HEADLINES).map((h) => {
                const category = CATEGORIES.find((c) => c.id === h.category);
                return (
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
                      {locale === "bn" ? category?.bn : category?.label}
                      {itemTime(h) && (
                        <>
                          {" · "}
                          <time dateTime={itemTime(h)}>{fullTime(itemTime(h), locale)}</time>
                        </>
                      )}
                    </p>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="mt-4 text-sm text-muted">{w.noHeadlines(name)}</p>
          )}
        </section>
      )}

      {o.channel && (
        <section>
          <h2 className="mt-10 font-display text-2xl font-semibold">{w.latestVideos}</h2>
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
                    {fullTime(v.publishedAt, locale)}
                  </time>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-muted">{w.noVideos(name)}</p>
          )}
          <p className="mt-4 text-sm">
            <Link href={localePath(VIDEOS_PATH, locale)} className={link}>
              {w.allVideos}
            </Link>
          </p>
        </section>
      )}
    </InfoPage>
  );
}
