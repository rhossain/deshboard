import type { Locale } from "./i18n";
import type { NewsSource, SourceStatus } from "./types";
import { isFetched } from "./sources";

export interface Problem {
  /** Plain-language explanation for readers. */
  message: string;
  /** The technical reason (fetch error or source note), for a tooltip. */
  detail?: string;
}

/** Ordered: the first pattern that matches the technical text wins. English, then Bangla. */
const EXPLANATIONS: [RegExp, string, string][] = [
  [
    /ENOTFOUND|EAI_AGAIN|DNS/i,
    "The site could not be reached; its address may have changed.",
    "সাইটটিতে পৌঁছানো যায়নি; এর ঠিকানা হয়তো বদলে গেছে।",
  ],
  [
    /\b40[123]\b|\b451\b|bot blocking|robots\.txt/i,
    "The site is blocking automated access to its headlines.",
    "সাইটটি স্বয়ংক্রিয়ভাবে শিরোনাম পড়া আটকে দিচ্ছে।",
  ],
  [
    /\b429\b/,
    "The site is limiting requests right now. Try again in a few minutes.",
    "সাইটটি এই মুহূর্তে অনুরোধ সীমিত করছে। কয়েক মিনিট পরে আবার চেষ্টা করুন।",
  ],
  [/HTTP 5\d\d|maintenance/i, "The site is having problems or is under maintenance.", "সাইটটিতে সমস্যা চলছে বা রক্ষণাবেক্ষণের কাজ হচ্ছে।"],
  [
    /\b404\b|not found/i,
    "The site's news feed could not be found; its address may have changed.",
    "সাইটটির নিউজ ফিড পাওয়া যায়নি; এর ঠিকানা হয়তো বদলে গেছে।",
  ],
  [/redirect loop/i, "The site's news feed is broken (it redirects endlessly).", "সাইটটির নিউজ ফিড নষ্ট (এটি অবিরাম অন্য ঠিকানায় পাঠায়)।"],
  [/Timed out|timeout/i, "The site took too long to respond.", "সাইটটি সাড়া দিতে অনেক বেশি সময় নিয়েছে।"],
  [/certificate|SSL|TLS/i, "The site's security certificate could not be verified.", "সাইটটির নিরাপত্তা সনদ যাচাই করা যায়নি।"],
  [/ECONNREFUSED|ECONNRESET|fetch failed/i, "The site could not be reached.", "সাইটটিতে পৌঁছানো যায়নি।"],
  [
    /articlePattern|layout may have changed/i,
    "No headlines were found on the homepage; the site's layout may have changed.",
    "প্রথম পাতায় কোনো শিরোনাম পাওয়া যায়নি; সাইটটির নকশা হয়তো বদলেছে।",
  ],
  [
    /not XML|soft 404|returns? (the )?homepage|returns? HTML/i,
    "The site's feed returns a web page instead of headlines.",
    "সাইটটির ফিড শিরোনামের বদলে একটি ওয়েব পাতা দেয়।",
  ],
  [/no titles|no news:title/i, "The site's feed lists links but no headlines.", "সাইটটির ফিডে লিংক আছে, কিন্তু শিরোনাম নেই।"],
  [
    /JS-rendered|live stream only/i,
    "The site loads its headlines with JavaScript, so they can't be read directly.",
    "সাইটটি জাভাস্ক্রিপ্ট দিয়ে শিরোনাম দেখায়, তাই সরাসরি পড়া যায় না।",
  ],
  [/stale|inactive/i, "The site's feed hasn't been updated recently.", "সাইটটির ফিড সম্প্রতি হালনাগাদ হয়নি।"],
  [/empty/i, "The site's feed has no headlines right now.", "সাইটটির ফিডে এই মুহূর্তে কোনো শিরোনাম নেই।"],
];

function explain(text: string, locale: Locale = "en"): string | undefined {
  const match = EXPLANATIONS.find(([re]) => re.test(text));
  return match && (locale === "bn" ? match[2] : match[1]);
}

/**
 * For a source whose headlines came from Google News: a short label, and why, for a tooltip. Its
 * own site refused us (usually a bot check), and Google lists articles a little after they appear.
 */
export function fallbackNote(status?: SourceStatus, locale: Locale = "en"): Problem | undefined {
  if (status?.via !== "google-news") return undefined;
  if (locale === "bn") {
    const why = explain(status.directError ?? "", locale) ?? "সাইটটির নিজের ফিড পড়া যায়নি।";
    return {
      message: "গুগল নিউজের মাধ্যমে",
      detail: `${why} তাই এই শিরোনামগুলো গুগল নিউজ থেকে আসে, আর সাইটের চেয়ে একটু দেরিতে দেখা দিতে পারে।`,
    };
  }
  const why = explain(status.directError ?? "") ?? "The site's own feed couldn't be read.";
  return {
    message: "via Google News",
    detail: `${why} These headlines come from Google News instead, and may appear a little later than on the site.`,
  };
}

/**
 * Why a source has no headlines: it is not fetched at all, or its last fetch
 * failed. Returns undefined while it is loading or when it is fine.
 */
export function sourceProblem(source: NewsSource, status?: SourceStatus, locale: Locale = "en"): Problem | undefined {
  const bn = locale === "bn";
  if (!isFetched(source)) {
    const why =
      explain(source.notes ?? "", locale) ??
      (bn ? "এই মুহূর্তে এই সাইট থেকে শিরোনাম আনা যাচ্ছে না।" : "Headlines can't currently be fetched from this site.");
    return { message: `${bn ? "পাওয়া যাচ্ছে না।" : "Not available."} ${why}`, detail: source.notes };
  }
  if (status && !status.ok) {
    const why =
      explain(status.error ?? "", locale) ??
      (bn ? "সাইটটি অপ্রত্যাশিত সাড়া দিয়েছে।" : "The site returned an unexpected response.");
    return { message: `${bn ? "শিরোনাম লোড করা যায়নি।" : "Couldn't load headlines."} ${why}`, detail: status.error };
  }
  return undefined;
}
