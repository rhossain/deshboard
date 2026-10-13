import type { Metadata, ResolvingMetadata } from "next";
import Link from "next/link";
import { InfoPage } from "@/components/InfoPage";
import { CONTACT_EMAIL } from "@/components/LegalPage";
import { CHANNELS } from "@/lib/channels";
import { type Locale, localDigits, localePath } from "@/lib/i18n";
import {
  ABOUT_PATH,
  aboutDescription,
  aboutJsonLd,
  aboutTitle,
  INDEXABLE,
  localeAlternates,
  shareMetadata,
  SOURCES_PATH,
  VIDEOS_PATH,
} from "@/lib/site";
import { ACTIVE_SOURCES } from "@/lib/sources";

export async function aboutMetadata(locale: Locale, parent: ResolvingMetadata): Promise<Metadata> {
  const title = aboutTitle(locale);
  const description = aboutDescription(locale);
  return {
    title: { absolute: title },
    description,
    alternates: localeAlternates(ABOUT_PATH, locale),
    robots: INDEXABLE,
    ...(await shareMetadata(parent, { title, description, url: localePath(ABOUT_PATH, locale), locale })),
  };
}

/** What Bartaboard is, how it gathers the news, and how to reach whoever runs it. */
export function AboutPage({ locale }: { locale: Locale }) {
  const other = localePath(ABOUT_PATH, locale === "bn" ? "en" : "bn");
  return (
    <InfoPage
      title={locale === "bn" ? "বার্তাবোর্ড সম্পর্কে" : "About Bartaboard"}
      locale={locale}
      other={other}
    >
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: aboutJsonLd(locale) }} />
      {locale === "bn" ? <Bangla /> : <English />}
    </InfoPage>
  );
}

function English() {
  return (
    <>
      <p>
        Bartaboard is a Bangladesh news aggregator: the latest headlines from {ACTIVE_SOURCES.length} Bangladeshi
        newspapers and news sites, in Bangla and English, and the latest videos from {CHANNELS.length} TV news channels,
        on one board. It is free, and you don&apos;t need an account to read it.
      </p>
      <p lang="bn">দেশের সব সংবাদপত্র, অনলাইন পোর্টাল ও টিভি চ্যানেলের সর্বশেষ খবর এক জায়গায়।</p>

      <h2>How it works</h2>
      <ul>
        <li>
          Every few minutes Bartaboard reads each site&apos;s own news feed, its sitemap for search engines or its front
          page, and for the few that can&apos;t be read directly, Google News. It keeps the headline, the link and the
          time, and sorts each story into a section: national, politics, sports and so on.
        </li>
        <li>
          Headlines link straight to the newspaper that published them. Bartaboard doesn&apos;t copy articles; you read
          them on the publisher&apos;s own site.
        </li>
        <li>
          <strong>Top stories</strong> groups the same event reported by several outlets, by matching their headlines.
          The more outlets cover it, and the more recently, the higher it ranks.
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
      </ul>

      <h2>Free, with ads and paid plans to come</h2>
      <p>Reading Bartaboard is free, and it will stay free.</p>
      <ul>
        <li>
          <strong>Today</strong> there are no ads, no analytics and no tracking cookies. Your saved stories, pinned
          sources and settings stay in your own browser (see the <Link href="/privacy">privacy policy</Link>).
        </li>
        <li>
          <strong>Ads.</strong> To pay for running Bartaboard, we plan to show ads. They will be marked as ads and kept
          apart from the headlines, and before the first one appears the privacy policy will say who shows them and what
          they collect.
        </li>
        <li>
          <strong>Paid plans.</strong> We also plan optional paid plans for extras such as keyword alerts. Headlines,
          Videos, saving and pinning stay free, with no account needed. A plan&apos;s price, what it includes and how
          refunds work are shown before you pay (see the <Link href="/terms">terms</Link>).
        </li>
      </ul>

      <h2>The sources</h2>
      <p>
        <Link href={SOURCES_PATH}>All newspapers and channels</Link> lists every outlet Bartaboard reads, with links to
        its own site. <Link href="/health">Source health</Link> shows how each one was read on the last update and why
        any is missing.
      </p>

      <h2>Add a newspaper or channel</h2>
      <p>
        Missing a Bangladeshi news site or TV channel, or publish one and want something changed? Write to{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> with its address. Bartaboard is independent and not
        affiliated with any of the outlets it lists.
      </p>
    </>
  );
}

function Bangla() {
  const sources = localDigits(String(ACTIVE_SOURCES.length), "bn");
  const channels = localDigits(String(CHANNELS.length), "bn");
  return (
    <>
      <p>
        বার্তাবোর্ড বাংলাদেশের খবরের একটি সংকলক: বাংলা ও ইংরেজি মিলিয়ে দেশের {sources}টি সংবাদপত্র ও সংবাদ সাইটের সর্বশেষ
        শিরোনাম, আর {channels}টি টিভি সংবাদ চ্যানেলের সর্বশেষ ভিডিও, একটি বোর্ডে। এটি বিনা মূল্যে পড়া যায়, কোনো
        অ্যাকাউন্টও লাগে না।
      </p>

      <h2>যেভাবে কাজ করে</h2>
      <ul>
        <li>
          কয়েক মিনিট পরপর বার্তাবোর্ড প্রতিটি সাইটের নিজস্ব নিউজ ফিড, সার্চ ইঞ্জিনের জন্য রাখা সাইটম্যাপ বা প্রথম পাতা পড়ে;
          যে কয়েকটি সরাসরি পড়া যায় না, সেগুলোর জন্য গুগল নিউজ। শিরোনাম, লিংক আর সময় রাখা হয়, আর প্রতিটি খবর একটি বিভাগে
          সাজানো হয়: জাতীয়, রাজনীতি, খেলা ইত্যাদি।
        </li>
        <li>
          শিরোনাম সরাসরি সেই পত্রিকায় নিয়ে যায়, যারা খবরটি প্রকাশ করেছে। বার্তাবোর্ড কোনো খবর নকল করে না; খবরটি আপনি
          প্রকাশকের নিজের সাইটেই পড়েন।
        </li>
        <li>
          <strong>শীর্ষ খবর</strong> একাধিক মাধ্যমে আসা একই ঘটনাকে শিরোনাম মিলিয়ে একসঙ্গে রাখে। যত বেশি মাধ্যমে, যত সাম্প্রতিক সময়ে খবরটি
          আসে, তত ওপরে থাকে।
        </li>
        <li>
          <Link href={localePath(VIDEOS_PATH, "bn")}>ভিডিও</Link> বিভাগে টিভি চ্যানেলগুলোর ইউটিউব চ্যানেলের গত এক দিনের সংবাদ
          ভিডিও থাকে, নতুনগুলো আগে। ভিডিও এখানেই বা ইউটিউবে দেখা যায়।
        </li>
        <li>
          সব বাংলাদেশি পত্রিকা এক পাতা থেকে পড়ার ভাবনাটি এসেছে ২৪ লাইভ নিউজপেপার (
          <a href="https://www.24livenewspaper.com/" target="_blank" rel="noopener">
            24livenewspaper.com
          </a>
          ) থেকে; বার্তাবোর্ড তার সঙ্গে যোগ করেছে সরাসরি হালনাগাদ শিরোনাম, শীর্ষ খবর আর টিভি সংবাদ ভিডিও।
        </li>
      </ul>

      <h2>বিনা মূল্যে; সামনে বিজ্ঞাপন ও পেইড প্ল্যান</h2>
      <p>বার্তাবোর্ড পড়া বিনা মূল্যের, আর বিনা মূল্যেরই থাকবে।</p>
      <ul>
        <li>
          <strong>এখন</strong> কোনো বিজ্ঞাপন, অ্যানালিটিক্স বা ট্র্যাকিং কুকি নেই। আপনার সংরক্ষিত খবর, পিন করা উৎস আর
          সেটিংস আপনার নিজের ব্রাউজারেই থাকে (দেখুন <Link href={localePath("/privacy", "bn")}>গোপনীয়তা নীতি</Link>)।
        </li>
        <li>
          <strong>বিজ্ঞাপন।</strong> বার্তাবোর্ড চালানোর খরচ মেটাতে আমরা বিজ্ঞাপন দেখানোর পরিকল্পনা করছি। বিজ্ঞাপনে
          &ldquo;বিজ্ঞাপন&rdquo; লেখা থাকবে, সেগুলো শিরোনাম থেকে আলাদা থাকবে, আর প্রথম বিজ্ঞাপন আসার আগেই গোপনীয়তা নীতিতে
          জানানো হবে কারা সেগুলো দেখায় ও কী তথ্য নেয়।
        </li>
        <li>
          <strong>পেইড প্ল্যান।</strong> কিওয়ার্ড অ্যালার্টের মতো বাড়তি সুবিধার জন্য ঐচ্ছিক পেইড প্ল্যান আনারও পরিকল্পনা আছে।
          শিরোনাম, ভিডিও, সংরক্ষণ আর পিন করা বিনা মূল্যেই থাকবে, অ্যাকাউন্ট ছাড়াই। কোনো প্ল্যানের দাম, তাতে কী থাকছে আর
          ফেরতের নিয়ম টাকা দেওয়ার আগেই দেখানো হবে (দেখুন <Link href={localePath("/terms", "bn")}>শর্তাবলি</Link>)।
        </li>
      </ul>

      <h2>উৎসগুলো</h2>
      <p>
        <Link href={localePath(SOURCES_PATH, "bn")}>সব পত্রিকা ও চ্যানেল</Link> পাতায় বার্তাবোর্ড যত উৎস পড়ে তার পুরো
        তালিকা আছে, প্রতিটির নিজের সাইটের লিংকসহ। <Link href="/health">উৎসের অবস্থা</Link> পাতায় দেখা যায় গত আপডেটে
        প্রতিটি কীভাবে পড়া হয়েছে, আর কোনোটি বাদ পড়লে কেন।
      </p>

      <h2>পত্রিকা বা চ্যানেল যোগ করুন</h2>
      <p>
        কোনো বাংলাদেশি সংবাদ সাইট বা টিভি চ্যানেল বাদ পড়েছে, কিংবা আপনি কোনোটি প্রকাশ করেন আর কিছু বদলাতে চান? তার ঠিকানাসহ
        লিখুন <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>-এ। বার্তাবোর্ড স্বাধীন, তালিকার কোনো মাধ্যমের সঙ্গে
        এর কোনো সম্পর্ক নেই।
      </p>
    </>
  );
}
