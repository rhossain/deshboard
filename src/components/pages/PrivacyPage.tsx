import type { Metadata, ResolvingMetadata } from "next";
import { CONTACT_EMAIL, LegalPage } from "@/components/LegalPage";
import { type Locale, localePath } from "@/lib/i18n";
import { localeAlternates, shareMetadata, SITE_NAME } from "@/lib/site";

const PATH = "/privacy/";
const WORDS = {
  en: {
    title: "Privacy policy",
    description: "What Bartaboard and its analytics collect about you (very little), and how to delete your data.",
    updated: "14 October 2026",
  },
  bn: {
    title: "গোপনীয়তা নীতি",
    description: "বার্তাবোর্ড ও এর অ্যানালিটিক্স আপনার সম্পর্কে কী তথ্য নেয় (খুব সামান্য), আর কীভাবে মুছবেন।",
    updated: "১৪ অক্টোবর ২০২৬",
  },
};

export async function privacyMetadata(locale: Locale, parent: ResolvingMetadata): Promise<Metadata> {
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
export function PrivacyPage({ locale }: { locale: Locale }) {
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
      <p>
        Bartaboard collects Bangladeshi news headlines in one place. You can read it without an account, and we keep as
        little about you as we can.
      </p>

      <h2>Reading without an account</h2>
      <ul>
        <li>Bartaboard itself keeps no personal data about readers without an account.</li>
        <li>
          There are no ads. We count visits with Cloudflare Web Analytics, which sets no cookies, and Google Analytics,
          which does; in the EU, the UK and Switzerland, Google Analytics runs only if you accept it. See{" "}
          <a href="#analytics">Analytics</a> below.
        </li>
        <li>
          Your theme, saved stories, pinned sources, card settings and the time of your last visit are kept only in your
          own browser&apos;s storage. They never reach us, and clearing your browser&apos;s site data removes them.
        </li>
        <li>
          The site is served by Cloudflare, which handles requests (including your IP address) to deliver and protect
          it, under{" "}
          <a href="https://www.cloudflare.com/privacypolicy/" rel="noopener">
            Cloudflare&apos;s privacy policy
          </a>
          .
        </li>
        <li>
          Headlines link to the newspapers that published them. Once you open one, that site&apos;s own privacy policy
          applies.
        </li>
      </ul>

      <h2>With an account</h2>
      <p>Accounts are optional. When you sign in we keep:</p>
      <ul>
        <li>your email address, to sign you in and to send you the sign-in codes and alerts you ask for;</li>
        <li>if you use Google, the name and profile photo on your Google account, to show who is signed in;</li>
        <li>your plan, when you joined, and the settings you save, such as keyword alerts.</li>
      </ul>
      <p>
        Accounts are stored with <a href="https://supabase.com/privacy" rel="noopener">Supabase</a> in Singapore.
        Sign-in emails are sent through <a href="https://resend.com/legal/privacy-policy" rel="noopener">Resend</a>. We
        don&apos;t sell or share your information with anyone else, and we don&apos;t use it for advertising.
      </p>

      <h2 id="analytics">Analytics</h2>
      <p>
        To learn how many people visit, which pages they read and how fast the site loads, we use{" "}
        <a href="https://www.cloudflare.com/web-analytics/" rel="noopener">
          Cloudflare Web Analytics
        </a>
        . It sets no cookies, keeps nothing in your browser and doesn&apos;t follow you to other sites. For each page you
        open, your browser tells Cloudflare the page&apos;s address, the site you came from, your browser and device
        type, and how long the page took to load; Cloudflare works out the country from your connection. We see only
        totals, such as page views and visits, and Bartaboard keeps nothing about you.
      </p>
      <p>
        We also use{" "}
        <a href="https://policies.google.com/privacy" rel="noopener">
          Google Analytics
        </a>
        , which shows us how many people are reading right now and which pages they open. It sets cookies (named _ga)
        that tell one visit from the next. Your browser sends Google the page&apos;s address, the site you came from,
        your browser, device and screen size, and your IP address, from which Google works out your rough location;
        Google Analytics doesn&apos;t keep IP addresses. We see only totals, and we&apos;ve turned off its use for
        advertising.
      </p>
      <p>
        In the EU and EEA, the UK and Switzerland, Google Analytics runs only after you accept analytics, and you can
        change your answer at any time from Cookie choices at the foot of the page. Elsewhere it runs when you visit; to
        opt out, block cookies for this site or use{" "}
        <a href="https://tools.google.com/dlpage/gaoptout" rel="noopener">
          Google&apos;s opt-out add-on
        </a>
        .
      </p>

      <h2 id="ads">Ads</h2>
      <p>
        Bartaboard doesn&apos;t show ads yet, but plans to. Before the first ad appears, this policy will be updated to
        name who shows them, what they collect (such as cookies or your IP address) and the choices you have, and the
        date at the top will change. We won&apos;t give advertisers your email address, saved stories or alerts.
      </p>

      <h2>Signing in with Google</h2>
      <p>
        If you choose &ldquo;Continue with Google&rdquo;, we ask Google only for your name, email address and profile
        photo, and use them only to sign you in and show your account. We don&apos;t ask for access to your Gmail,
        contacts, files or anything else. Bartaboard&apos;s use of information received from Google APIs adheres to the{" "}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" rel="noopener">
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements.
      </p>

      <h2>Deleting your data</h2>
      <p>
        Delete your account at any time from <a href="/account/">Your account</a>. That removes your email, name, photo,
        plan and everything saved to the account straight away. You can also remove Bartaboard&apos;s access from your{" "}
        <a href="https://myaccount.google.com/connections" rel="noopener">
          Google account
        </a>
        .
      </p>

      <h2>Contact</h2>
      <p>
        Questions or requests about your data: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. If this policy
        changes, the date at the top changes with it.
      </p>
    </>
  );
}

function Bangla() {
  return (
    <>
      <p>
        বার্তাবোর্ড বাংলাদেশের খবরের শিরোনাম এক জায়গায় সংগ্রহ করে। অ্যাকাউন্ট ছাড়াই পড়া যায়, আর আমরা আপনার সম্পর্কে যতটা
        সম্ভব কম তথ্য রাখি।
      </p>

      <h2>অ্যাকাউন্ট ছাড়া পড়লে</h2>
      <ul>
        <li>অ্যাকাউন্ট ছাড়া যাঁরা পড়েন, তাঁদের কোনো ব্যক্তিগত তথ্য বার্তাবোর্ড নিজে রাখে না।</li>
        <li>
          কোনো বিজ্ঞাপন নেই। ভিজিট গুনতে আমরা ক্লাউডফ্লেয়ার ওয়েব অ্যানালিটিক্স ব্যবহার করি, যা কোনো কুকি রাখে না, আর গুগল
          অ্যানালিটিক্স, যা কুকি রাখে; ইউরোপীয় ইউনিয়ন, যুক্তরাজ্য ও সুইজারল্যান্ডে গুগল অ্যানালিটিক্স চলে শুধু আপনি রাজি হলে।
          নিচের <a href="#analytics">অ্যানালিটিক্স</a> অংশ দেখুন।
        </li>
        <li>
          আপনার থিম, সংরক্ষিত খবর, পিন করা উৎস, কার্ডের সেটিংস আর শেষবার আসার সময় শুধু আপনার নিজের ব্রাউজারের স্টোরেজে
          থাকে। এগুলো কখনো আমাদের কাছে আসে না, আর ব্রাউজারের সাইট ডেটা মুছলে এগুলোও মুছে যায়।
        </li>
        <li>
          সাইটটি ক্লাউডফ্লেয়ারের মাধ্যমে পরিবেশিত হয়। সাইট পৌঁছে দিতে ও সুরক্ষিত রাখতে ক্লাউডফ্লেয়ার অনুরোধগুলো (আপনার আইপি
          ঠিকানাসহ) সামলায়,{" "}
          <a href="https://www.cloudflare.com/privacypolicy/" rel="noopener">
            ক্লাউডফ্লেয়ারের গোপনীয়তা নীতি
          </a>{" "}
          অনুযায়ী।
        </li>
        <li>শিরোনাম সেই পত্রিকায় নিয়ে যায়, যারা খবরটি প্রকাশ করেছে। খুললে সেই সাইটের নিজের গোপনীয়তা নীতি প্রযোজ্য হয়।</li>
      </ul>

      <h2>অ্যাকাউন্ট থাকলে</h2>
      <p>অ্যাকাউন্ট ঐচ্ছিক। সাইন ইন করলে আমরা রাখি:</p>
      <ul>
        <li>আপনার ইমেইল ঠিকানা, সাইন ইন করাতে এবং আপনার চাওয়া সাইন-ইন কোড ও অ্যালার্ট পাঠাতে;</li>
        <li>গুগল ব্যবহার করলে আপনার গুগল অ্যাকাউন্টের নাম ও প্রোফাইল ছবি, কে সাইন ইন করেছেন তা দেখাতে;</li>
        <li>আপনার প্ল্যান, কবে যোগ দিয়েছেন, আর আপনার সংরক্ষিত সেটিংস, যেমন কিওয়ার্ড অ্যালার্ট।</li>
      </ul>
      <p>
        অ্যাকাউন্ট সিঙ্গাপুরে <a href="https://supabase.com/privacy" rel="noopener">সুপাবেস</a>-এ রাখা হয়। সাইন-ইন ইমেইল
        পাঠানো হয় <a href="https://resend.com/legal/privacy-policy" rel="noopener">রিসেন্ডের</a> মাধ্যমে। আমরা আপনার তথ্য
        আর কারও কাছে বিক্রি বা শেয়ার করি না, বিজ্ঞাপনের কাজেও ব্যবহার করি না।
      </p>

      <h2 id="analytics">অ্যানালিটিক্স</h2>
      <p>
        কতজন আসেন, কোন পাতা পড়েন আর সাইট কত দ্রুত খোলে তা জানতে আমরা{" "}
        <a href="https://www.cloudflare.com/web-analytics/" rel="noopener">
          ক্লাউডফ্লেয়ার ওয়েব অ্যানালিটিক্স
        </a>{" "}
        ব্যবহার করি। এটি কোনো কুকি রাখে না, আপনার ব্রাউজারে কিছু জমা রাখে না, আর অন্য সাইটে আপনাকে অনুসরণ করে না। আপনি
        যে পাতা খোলেন, তার ঠিকানা, কোন সাইট থেকে এসেছেন, আপনার ব্রাউজার ও ডিভাইসের ধরন আর পাতাটি খুলতে কত সময় লাগল,
        তা আপনার ব্রাউজার ক্লাউডফ্লেয়ারকে জানায়; দেশটি ক্লাউডফ্লেয়ার আপনার সংযোগ থেকে বোঝে। আমরা দেখি শুধু মোট হিসাব,
        যেমন কতবার পাতা খোলা হলো বা কতজন এলেন, আর আপনার সম্পর্কে বার্তাবোর্ড কিছুই রাখে না।
      </p>
      <p>
        আমরা{" "}
        <a href="https://policies.google.com/privacy" rel="noopener">
          গুগল অ্যানালিটিক্স
        </a>{" "}
        ও ব্যবহার করি, যা দেখায় এই মুহূর্তে কতজন পড়ছেন আর কোন পাতা খুলছেন। এটি কুকি (_ga নামে) রাখে, যা দিয়ে একবারের ভিজিট
        থেকে পরেরটি আলাদা করা যায়। আপনার ব্রাউজার গুগলকে জানায় পাতার ঠিকানা, কোন সাইট থেকে এসেছেন, আপনার ব্রাউজার, ডিভাইস ও
        স্ক্রিনের মাপ, আর আপনার আইপি ঠিকানা, যা থেকে গুগল আপনার মোটামুটি অবস্থান বোঝে; গুগল অ্যানালিটিক্স আইপি ঠিকানা রাখে
        না। আমরা দেখি শুধু মোট হিসাব, আর বিজ্ঞাপনের কাজে এর ব্যবহার আমরা বন্ধ রেখেছি।
      </p>
      <p>
        ইউরোপীয় ইউনিয়ন ও ইইএ, যুক্তরাজ্য আর সুইজারল্যান্ডে গুগল অ্যানালিটিক্স চলে শুধু আপনি অ্যানালিটিক্সে রাজি হলে, আর
        পাতার নিচে কুকির পছন্দ থেকে যেকোনো সময় মত বদলাতে পারেন। অন্য সব জায়গায় সাইটে এলেই এটি চলে; বন্ধ করতে এই সাইটের
        কুকি আটকে দিন, অথবা{" "}
        <a href="https://tools.google.com/dlpage/gaoptout" rel="noopener">
          গুগলের অপ্ট-আউট অ্যাড-অন
        </a>{" "}
        ব্যবহার করুন।
      </p>

      <h2 id="ads">বিজ্ঞাপন</h2>
      <p>
        বার্তাবোর্ডে এখনো বিজ্ঞাপন নেই, তবে দেখানোর পরিকল্পনা আছে। প্রথম বিজ্ঞাপন আসার আগে এই নীতি হালনাগাদ করে জানানো হবে
        কারা বিজ্ঞাপন দেখাবে, তারা কী তথ্য নেয় (যেমন কুকি বা আপনার আইপি ঠিকানা) আর আপনার কী কী বেছে নেওয়ার সুযোগ থাকবে;
        ওপরের তারিখও বদলাবে। আপনার ইমেইল ঠিকানা, সংরক্ষিত খবর বা অ্যালার্ট আমরা বিজ্ঞাপনদাতাদের দেব না।
      </p>

      <h2>গুগল দিয়ে সাইন ইন</h2>
      <p>
        &ldquo;Continue with Google&rdquo; বেছে নিলে আমরা গুগলের কাছে শুধু আপনার নাম, ইমেইল ঠিকানা ও প্রোফাইল ছবি চাই, আর
        সেগুলো শুধু সাইন ইন করাতে ও আপনার অ্যাকাউন্ট দেখাতে ব্যবহার করি। আপনার জিমেইল, কন্টাক্ট, ফাইল বা অন্য কিছুতে
        প্রবেশাধিকার চাই না। গুগল এপিআই থেকে পাওয়া তথ্য বার্তাবোর্ড ব্যবহার করে{" "}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" rel="noopener">
          Google API Services User Data Policy
        </a>
        , এবং এর Limited Use শর্তগুলো মেনে।
      </p>

      <h2>আপনার তথ্য মোছা</h2>
      <p>
        যেকোনো সময় <a href="/account/">আপনার অ্যাকাউন্ট</a> থেকে অ্যাকাউন্ট মুছে দিতে পারেন। তাতে আপনার ইমেইল, নাম, ছবি,
        প্ল্যান আর অ্যাকাউন্টে সংরক্ষিত সবকিছু সঙ্গে সঙ্গে মুছে যায়। আপনার{" "}
        <a href="https://myaccount.google.com/connections" rel="noopener">
          গুগল অ্যাকাউন্ট
        </a>{" "}
        থেকেও বার্তাবোর্ডের প্রবেশাধিকার সরিয়ে নিতে পারেন।
      </p>

      <h2>যোগাযোগ</h2>
      <p>
        আপনার তথ্য নিয়ে প্রশ্ন বা অনুরোধ: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>। এই নীতি বদলালে ওপরের
        তারিখও বদলাবে।
      </p>
    </>
  );
}
