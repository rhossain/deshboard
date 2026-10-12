import type { Metadata, ResolvingMetadata } from "next";
import Link from "next/link";
import { InfoPage } from "@/components/InfoPage";
import { CHANNELS } from "@/lib/channels";
import { buildDirectory, type DirectoryEntry } from "@/lib/directory";
import { readFeed, readVideos } from "@/lib/feed";
import { type Locale, localDigits, localePath } from "@/lib/i18n";
import {
  INDEXABLE,
  localeAlternates,
  shareMetadata,
  SOURCES_PATH,
  sourcesDescription,
  sourcesJsonLd,
  sourcesTitle,
  VIDEOS_PATH,
} from "@/lib/site";
import { ACTIVE_SOURCES } from "@/lib/sources";

const WORDS = {
  en: {
    heading: "All Bangladesh newspapers and news sites",
    intro: (sources: string, channels: string) =>
      `Bartaboard collects the latest headlines from ${sources} Bangladeshi newspapers and news sites, in Bangla and ` +
      `English, and the latest videos from ${channels} TV news channels on YouTube. Each one below links to its own ` +
      "site and to its headlines or videos here.",
    groups: "Groups",
    headlines: "Headlines",
    videos: "Videos",
    website: "Website ↗",
    live: "Live ↗",
  },
  bn: {
    heading: "সব বাংলা পত্রিকা ও সংবাদ সাইট",
    intro: (sources: string, channels: string) =>
      `সকল বাংলা পত্রিকা, অনলাইন সংবাদ ও টিভি চ্যানেলের সর্বশেষ খবর এক জায়গায়। বার্তাবোর্ড বাংলা ও ইংরেজি মিলিয়ে ` +
      `বাংলাদেশের ${sources}টি সংবাদপত্র ও সংবাদ সাইটের সর্বশেষ শিরোনাম আর ইউটিউবে ${channels}টি টিভি সংবাদ চ্যানেলের ` +
      "সর্বশেষ ভিডিও সংগ্রহ করে। নিচের প্রতিটি থেকে তার নিজের সাইটে আর এখানে তার শিরোনাম বা ভিডিওতে যাওয়া যায়।",
    groups: "বিভাগ",
    headlines: "শিরোনাম",
    videos: "ভিডিও",
    website: "ওয়েবসাইট ↗",
    live: "লাইভ ↗",
  },
};

export async function sourcesMetadata(locale: Locale, parent: ResolvingMetadata): Promise<Metadata> {
  const title = sourcesTitle(locale);
  const description = sourcesDescription(locale);
  return {
    title: { absolute: title },
    description,
    alternates: localeAlternates(SOURCES_PATH, locale),
    robots: INDEXABLE,
    ...(await shareMetadata(parent, { title, description, url: localePath(SOURCES_PATH, locale), locale })),
  };
}

/** Every outlet Bartaboard reads, grouped, each with its own site, its headlines here and its videos. */
export function SourcesPage({ locale }: { locale: Locale }) {
  const w = WORDS[locale];
  const groups = buildDirectory(readFeed(), readVideos(), locale);
  const count = (n: number) => localDigits(String(n), locale);
  return (
    <InfoPage
      wide
      locale={locale}
      other={localePath(SOURCES_PATH, locale === "bn" ? "en" : "bn")}
      title={w.heading}
      intro={
        <>
          <p>{w.intro(count(ACTIVE_SOURCES.length), count(CHANNELS.length))}</p>
          {locale === "en" && <p lang="bn">সকল বাংলা পত্রিকা, অনলাইন সংবাদ ও টিভি চ্যানেলের সর্বশেষ খবর এক জায়গায়।</p>}
        </>
      }
    >
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: sourcesJsonLd(groups, locale) }} />
      <nav aria-label={w.groups} className="flex flex-wrap gap-2">
        {groups.map((g) => (
          <a
            key={g.id}
            href={`#${g.id}`}
            className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm font-medium text-muted transition hover:text-foreground"
          >
            {g.title} <span className="tabular-nums text-muted">{count(g.entries.length)}</span>
          </a>
        ))}
      </nav>
      {groups.map((g) => (
        <section key={g.id} id={g.id} className="scroll-mt-6">
          <h2 className="mt-10 font-display text-2xl font-semibold">
            {g.title}{" "}
            <span className="font-sans text-base font-normal tabular-nums text-muted">{count(g.entries.length)}</span>
          </h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {g.entries.map((e) => (
              <Entry key={e.id} entry={e} locale={locale} />
            ))}
          </ul>
        </section>
      ))}
    </InfoPage>
  );
}

function Entry({ entry: e, locale }: { entry: DirectoryEntry; locale: Locale }) {
  const w = WORDS[locale];
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
      <h3 className="text-[15px] font-semibold">
        <Link href={e.href} className="hover:text-accent">
          {e.name}
        </Link>
      </h3>
      <p className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted">{e.label}</p>
      <p className="mt-2 flex-1 text-sm text-muted">{e.summary}</p>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {e.boardHref && (
          // A full load: the board reads its filters from the address when it opens.
          <a href={e.boardHref} className={external}>
            {w.headlines}
          </a>
        )}
        {e.youtubeId && (
          <Link href={localePath(VIDEOS_PATH, locale)} className={external}>
            {w.videos}
          </Link>
        )}
        {e.homepage && (
          <a href={e.homepage} target="_blank" rel="noopener" className={external}>
            {w.website}
          </a>
        )}
        {youtube && (
          <>
            <a href={youtube} target="_blank" rel="noopener" className={external}>
              YouTube ↗
            </a>
            <a href={`${youtube}/live`} target="_blank" rel="noopener" className={external}>
              {w.live}
            </a>
          </>
        )}
      </p>
    </li>
  );
}
