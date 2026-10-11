import type { Metadata, ResolvingMetadata } from "next";
import Link from "next/link";
import { InfoPage } from "@/components/InfoPage";
import { CONTACT_EMAIL } from "@/components/LegalPage";
import { CHANNELS } from "@/lib/channels";
import {
  ABOUT_DESCRIPTION,
  ABOUT_PATH,
  ABOUT_TITLE,
  aboutJsonLd,
  INDEXABLE,
  shareMetadata,
  SOURCES_PATH,
  VIDEOS_PATH,
} from "@/lib/site";
import { ACTIVE_SOURCES } from "@/lib/sources";

export async function generateMetadata(_: unknown, parent: ResolvingMetadata): Promise<Metadata> {
  return {
    title: { absolute: ABOUT_TITLE },
    description: ABOUT_DESCRIPTION,
    alternates: { canonical: ABOUT_PATH },
    robots: INDEXABLE,
    ...(await shareMetadata(parent, { title: ABOUT_TITLE, description: ABOUT_DESCRIPTION, url: ABOUT_PATH })),
  };
}

/** What Bartaboard is, how it gathers the news, and how to reach whoever runs it. */
export default function AboutPage() {
  return (
    <InfoPage title="About Bartaboard">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: aboutJsonLd() }} />
      <p>
        Bartaboard is a Bangladesh news aggregator: the latest headlines from {ACTIVE_SOURCES.length} Bangladeshi
        newspapers and news sites, in Bangla and English, and the latest videos from {CHANNELS.length} TV news channels,
        on one board. It is free, and you don&apos;t need an account to read it.
      </p>
      <p lang="bn">দেশের সব সংবাদপত্র, অনলাইন পোর্টাল ও টিভি চ্যানেলের সর্বশেষ খবর এক জায়গায়।</p>

      <h2>How it works</h2>
      <ul>
        <li>
          Every 15 minutes Bartaboard reads each site&apos;s own news feed, its sitemap for search engines or its front
          page, and for the few that can&apos;t be read directly, Google News. It keeps the headline, the link and the
          time, and sorts each story into a section: national, politics, sports and so on.
        </li>
        <li>
          Headlines link straight to the newspaper that published them. Bartaboard doesn&apos;t copy articles; you read
          them on the publisher&apos;s own site.
        </li>
        <li>
          <strong>Top stories</strong> groups the same event reported by several outlets, by matching their headlines.
          The more outlets cover it, the higher it ranks.
        </li>
        <li>
          <Link href={VIDEOS_PATH}>Videos</Link> shows the last day&apos;s news videos from the TV channels&apos; YouTube
          channels, newest first. They play here or on YouTube.
        </li>
        <li>
          The idea of reading every Bangladeshi newspaper from one page comes from 24 Live Newspaper (
          <a href="https://www.24livenewspaper.com/" target="_blank" rel="noopener">
            24livenewspaper.com
          </a>
          ); Bartaboard builds on it with live headlines, top stories and TV news videos.
        </li>
        <li>
          There are no ads, no analytics and no tracking cookies. Your saved stories, pinned sources and settings stay in
          your own browser (see the <Link href="/privacy/">privacy policy</Link>).
        </li>
      </ul>

      <h2>The sources</h2>
      <p>
        <Link href={SOURCES_PATH}>All newspapers and channels</Link> lists every outlet Bartaboard reads, with links to
        its own site. <Link href="/health/">Source health</Link> shows how each one was read on the last update and why
        any is missing.
      </p>

      <h2>Add a newspaper or channel</h2>
      <p>
        Missing a Bangladeshi news site or TV channel, or publish one and want something changed? Write to{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> with its address. Bartaboard is independent and not
        affiliated with any of the outlets it lists.
      </p>
    </InfoPage>
  );
}
