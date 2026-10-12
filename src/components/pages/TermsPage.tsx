import type { Metadata, ResolvingMetadata } from "next";
import { CONTACT_EMAIL, LegalPage } from "@/components/LegalPage";
import { type Locale, localePath } from "@/lib/i18n";
import { localeAlternates, shareMetadata, SITE_NAME } from "@/lib/site";

const PATH = "/terms/";
const WORDS = {
  en: {
    title: "Terms of service",
    description: "The rules for using Bartaboard and its accounts.",
    updated: "12 October 2026",
  },
  bn: {
    title: "ব্যবহারের শর্তাবলি",
    description: "বার্তাবোর্ড ও এর অ্যাকাউন্ট ব্যবহারের নিয়ম।",
    updated: "১২ অক্টোবর ২০২৬",
  },
};

export async function termsMetadata(locale: Locale, parent: ResolvingMetadata): Promise<Metadata> {
  const { title, description } = WORDS[locale];
  return {
    title: { absolute: `${title} | ${SITE_NAME}` },
    description,
    alternates: localeAlternates(PATH, locale),
    ...(await shareMetadata(parent, {
      title: `${title} | ${SITE_NAME}`,
      description,
      url: localePath(PATH, locale),
      locale,
    })),
  };
}

/** Linked from Google's sign-in screen, the account page and the board's footer. */
export function TermsPage({ locale }: { locale: Locale }) {
  const { title, updated } = WORDS[locale];
  return (
    <LegalPage title={title} updated={updated} path={PATH} locale={locale}>
      {locale === "bn" ? <Bangla /> : <English />}
    </LegalPage>
  );
}

function English() {
  return (
    <>
      <p>By using Bartaboard you agree to these terms. They are short on purpose.</p>

      <h2>What Bartaboard is</h2>
      <p>
        Bartaboard shows headlines, short excerpts and links from Bangladeshi news sites. The stories, names and images
        belong to the publishers that wrote them; we link to them and don&apos;t claim them as ours. If you publish one of
        these sites and want something changed, write to us.
      </p>

      <h2>Accounts</h2>
      <ul>
        <li>Accounts are optional and free. Keep access to the email or Google account you sign in with.</li>
        <li>One person per account. Don&apos;t sign up for someone else or use an address that isn&apos;t yours.</li>
        <li>You can delete your account whenever you like from Your account.</li>
        <li>
          We may close accounts used to abuse the service, such as automated scraping, sending sign-in emails to other
          people or trying to break in.
        </li>
      </ul>

      <h2>Ads and paid plans</h2>
      <ul>
        <li>
          Reading Bartaboard is free. We plan to show ads to pay for it. They will be marked as ads and kept apart from
          the headlines. Ads come from their advertisers, not from us or the publishers we list.
        </li>
        <li>
          Paid plans for extras such as keyword alerts are planned but not on sale yet. When they are, their price, what
          they include and how refunds work will be shown before you pay. Headlines, Videos, saving and pinning stay
          free.
        </li>
      </ul>

      <h2>No guarantees</h2>
      <p>
        Bartaboard is provided as it is. Headlines come from other sites and can be late, missing or wrong, and the
        service may sometimes be down. Check the original story before relying on it. As far as the law allows, we
        aren&apos;t liable for losses from using Bartaboard.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these terms; the date at the top shows when. Questions:{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. See also the <a href="/privacy/">privacy policy</a>.
      </p>
    </>
  );
}

function Bangla() {
  return (
    <>
      <p>বার্তাবোর্ড ব্যবহার করলে আপনি এই শর্তগুলোতে সম্মত হচ্ছেন। এগুলো ইচ্ছে করেই সংক্ষিপ্ত।</p>

      <h2>বার্তাবোর্ড কী</h2>
      <p>
        বার্তাবোর্ড বাংলাদেশের সংবাদ সাইটগুলোর শিরোনাম, ছোট অংশ ও লিংক দেখায়। খবর, নাম ও ছবি সেগুলোর প্রকাশকদের; আমরা
        সেগুলোতে লিংক দিই, নিজেদের বলে দাবি করি না। আপনি এসব সাইটের কোনোটি প্রকাশ করলে আর কিছু বদলাতে চাইলে আমাদের লিখুন।
      </p>

      <h2>অ্যাকাউন্ট</h2>
      <ul>
        <li>অ্যাকাউন্ট ঐচ্ছিক ও বিনা মূল্যের। যে ইমেইল বা গুগল অ্যাকাউন্ট দিয়ে সাইন ইন করেন, তাতে নিজের প্রবেশাধিকার রাখুন।</li>
        <li>একজনের জন্য একটি অ্যাকাউন্ট। অন্য কারও হয়ে সাইন আপ করবেন না, বা নিজের নয় এমন ঠিকানা ব্যবহার করবেন না।</li>
        <li>যেকোনো সময় &ldquo;আপনার অ্যাকাউন্ট&rdquo; থেকে অ্যাকাউন্ট মুছে দিতে পারেন।</li>
        <li>
          সেবার অপব্যবহারে ব্যবহৃত অ্যাকাউন্ট, যেমন স্বয়ংক্রিয় স্ক্র্যাপিং, অন্যদের সাইন-ইন ইমেইল পাঠানো বা অনুপ্রবেশের
          চেষ্টা, আমরা বন্ধ করে দিতে পারি।
        </li>
      </ul>

      <h2>বিজ্ঞাপন ও পেইড প্ল্যান</h2>
      <ul>
        <li>
          বার্তাবোর্ড পড়া বিনা মূল্যের। এর খরচ মেটাতে আমরা বিজ্ঞাপন দেখানোর পরিকল্পনা করছি। বিজ্ঞাপনে &ldquo;বিজ্ঞাপন&rdquo;
          লেখা থাকবে আর সেগুলো শিরোনাম থেকে আলাদা থাকবে। বিজ্ঞাপন আসে বিজ্ঞাপনদাতাদের কাছ থেকে, আমাদের বা তালিকার
          প্রকাশকদের কাছ থেকে নয়।
        </li>
        <li>
          কিওয়ার্ড অ্যালার্টের মতো বাড়তি সুবিধার জন্য পেইড প্ল্যানের পরিকল্পনা আছে, তবে এখনো বিক্রি শুরু হয়নি। শুরু হলে দাম,
          কী কী থাকছে আর ফেরতের নিয়ম টাকা দেওয়ার আগেই দেখানো হবে। শিরোনাম, ভিডিও, সংরক্ষণ আর পিন করা বিনা মূল্যেই থাকবে।
        </li>
      </ul>

      <h2>কোনো নিশ্চয়তা নেই</h2>
      <p>
        বার্তাবোর্ড যেমন আছে তেমনভাবেই দেওয়া হয়। শিরোনাম অন্য সাইট থেকে আসে, তাই দেরিতে আসতে পারে, বাদ পড়তে পারে বা ভুল
        থাকতে পারে, আর সেবাটি মাঝে মাঝে বন্ধ থাকতে পারে। কোনো খবরের ওপর নির্ভর করার আগে মূল খবরটি দেখে নিন। আইন যতটা
        অনুমতি দেয়, বার্তাবোর্ড ব্যবহারের কারণে কোনো ক্ষতির দায় আমাদের নয়।
      </p>

      <h2>পরিবর্তন</h2>
      <p>
        আমরা এই শর্তগুলো হালনাগাদ করতে পারি; ওপরের তারিখ দেখাবে কবে। প্রশ্ন:{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>। আরও দেখুন{" "}
        <a href={localePath("/privacy/", "bn")}>গোপনীয়তা নীতি</a>।
      </p>
    </>
  );
}
