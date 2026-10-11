import type { Category } from "./categories";
import { CHANNELS } from "./channels";
import { ACTIVE_SOURCES } from "./sources";

/**
 * A few lines about each page, shown at its foot and prerendered: what it holds, in English, and a line
 * in Bangla. Written for readers first; they also give search engines a little text of the site's own.
 */
export interface Intro {
  en: string[];
  bn: string;
}

const SORTED =
  `Bartaboard sorts the latest headlines from ${ACTIVE_SOURCES.length} Bangladeshi news sites into sections ` +
  "every few minutes, and each one links straight to the newspaper that published it.";

export const BOARD_INTRO: Intro = {
  en: [
    `Bartaboard gathers the latest Bangladesh news from ${ACTIVE_SOURCES.length} newspapers and news sites, Bangla ` +
      "and English, on one page: Prothom Alo, The Daily Star, bdnews24, Jugantor, Dhaka Tribune and more.",
    "Headlines refresh every few minutes and link straight to the publisher; Top stories shows the events most " +
      "outlets are covering.",
  ],
  bn: "দেশের সব পত্রিকার আজকের সর্বশেষ খবর এক জায়গায়।",
};

export const VIDEOS_INTRO: Intro = {
  en: [
    `The last day's news videos from ${CHANNELS.length} Bangladeshi TV channels on YouTube, newest first: Jamuna ` +
      "TV, Somoy TV, Channel 24, Ekattor TV, BBC News Bangla and more.",
    "They play here or on YouTube, and refresh every few minutes.",
  ],
  bn: "সব টিভি চ্যানেলের সর্বশেষ সংবাদ ভিডিও এক জায়গায়।",
};

const SECTION: Record<Exclude<Category, "other">, { en: string; bn: string }> = {
  national: {
    en: "Bangladesh national news today: Dhaka and the districts, the government, weather and the environment, from every newspaper at once.",
    bn: "জাতীয় খবর: সারা দেশের সর্বশেষ সংবাদ।",
  },
  politics: {
    en: "Bangladesh politics news: the parties, elections, parliament and government, as each newspaper reports them.",
    bn: "রাজনীতির সর্বশেষ খবর, সব পত্রিকা থেকে।",
  },
  international: {
    en: "International news from Bangladeshi newspapers: world events, South Asia, and Bangladeshis abroad.",
    bn: "আন্তর্জাতিক খবর ও প্রবাসের সংবাদ।",
  },
  business: {
    en: "Bangladesh business news: the economy, banks, the share market, trade and jobs.",
    bn: "অর্থনীতি ও বাণিজ্যের সর্বশেষ খবর।",
  },
  sports: {
    en: "Bangladesh sports news today: cricket, football and every other sport, from every Bangladeshi newspaper on one page.",
    bn: "খেলার খবর: ক্রিকেট, ফুটবলসহ সব খেলার সর্বশেষ সংবাদ।",
  },
  entertainment: {
    en: "Bangla entertainment news: film, drama, music, celebrities and culture.",
    bn: "বিনোদনের সর্বশেষ খবর: সিনেমা, নাটক ও গান।",
  },
  tech: {
    en: "Bangladesh science and technology news: mobile phones, the internet, gadgets and science.",
    bn: "বিজ্ঞান ও প্রযুক্তির সর্বশেষ খবর।",
  },
  education: {
    en: "Bangladesh education news: schools and universities, admissions, exams and results such as SSC and HSC.",
    bn: "শিক্ষার খবর: ভর্তি, পরীক্ষা ও ফলাফল।",
  },
  health: {
    en: "Bangladesh health news: hospitals, diseases, medicine and public health.",
    bn: "স্বাস্থ্যের সর্বশেষ খবর।",
  },
  lifestyle: {
    en: "Bangla lifestyle news: food, fashion, travel, family and wellbeing.",
    bn: "জীবনযাপনের খবর: খাবার, ফ্যাশন ও ভ্রমণ।",
  },
  crime: {
    en: "Bangladesh law and crime news: the courts, police, cases and verdicts.",
    bn: "আইন-আদালত ও অপরাধের খবর।",
  },
  opinion: {
    en: "Opinion from Bangladeshi newspapers: columns, analysis and editorials.",
    bn: "মতামত, কলাম ও সম্পাদকীয়।",
  },
};

/** The intro for a section's page, or the board's for "" (and "other", which has no page). */
export function sectionIntro(category: Category | ""): Intro {
  if (!category || category === "other") return BOARD_INTRO;
  return { en: [SECTION[category].en, SORTED], bn: SECTION[category].bn };
}

/** Questions on the board, also given to search engines and AI assistants as FAQPage data. */
export const FAQ: { q: string; a: string }[] = [
  {
    q: "Which newspapers are included?",
    a:
      `${ACTIVE_SOURCES.length} Bangladeshi newspapers and news sites in Bangla and English, among them Prothom Alo, ` +
      "The Daily Star, Jugantor, Kaler Kantho, bdnews24 and Dhaka Tribune, and " +
      `${CHANNELS.length} TV news channels on YouTube. The All newspapers page lists every one.`,
  },
  {
    q: "Is it free?",
    a: "Yes. Reading Bartaboard is free, with no ads, and you don't need an account.",
  },
  {
    q: "How often is it updated?",
    a: "Every few minutes. When new headlines arrive while you're reading, the page offers them without moving what you're reading.",
  },
  {
    q: "Does Bartaboard write its own news?",
    a: "No. Every headline links to the newspaper that published it, and you read the story on its own site.",
  },
  {
    q: "Why are some sites read through Google News?",
    a: "A few sites block automated reading or publish no feed, so their headlines come from Google News instead. Each site's card says how its headlines were read.",
  },
  {
    q: "Can I watch TV news here?",
    a: `Yes. Videos has the last day's news videos from ${CHANNELS.length} Bangladeshi TV channels on YouTube, including Jamuna TV, Somoy TV and Channel 24. They play right on the page.`,
  },
];
