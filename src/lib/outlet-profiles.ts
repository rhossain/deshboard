/**
 * A few lines about each outlet, in English and Bangla, for its page (src/components/pages/OutletPage.tsx): what it
 * is, since when, from where. Each language's page gets its own text, so the English and Bangla pages of an outlet
 * aren't the same headlines in two wrappers (search engines kept only one of each pair).
 *
 * Facts were checked against the outlets' own pages, Wikipedia and the press in October 2026; a fact that couldn't
 * be confirmed is left out rather than guessed. No editors' names (they change), no opinions about outlets.
 * A test checks that every outlet with a page (directory.ts OUTLETS) has both texts.
 */
export interface OutletProfile {
  /** The year it started, when known: shown in the page's description. */
  since?: number;
  en: string;
  bn: string;
}

// prettier-ignore
export const OUTLET_PROFILES: Record<string, OutletProfile> = {
  prothomalo: {
    since: 1998,
    en: "Prothom Alo is a Bangla-language daily newspaper published in Dhaka since 4 November 1998 by Mediastar, a Transcom Group company. Alongside the print edition it runs a news website, and a 2018 Kantar MRB media survey put its daily print readership at about 6.6 million.",
    bn: "প্রথম আলো ঢাকা থেকে প্রকাশিত বাংলা দৈনিক, যাত্রা শুরু ১৯৯৮ সালের ৪ নভেম্বর; প্রকাশক ট্রান্সকম গ্রুপের প্রতিষ্ঠান মিডিয়াস্টার। ছাপা সংস্করণের পাশাপাশি এর একটি সংবাদ ওয়েবসাইট আছে। ২০১৮ সালে কান্তার এমআরবির এক জরিপে এর ছাপা সংস্করণের দৈনিক পাঠকসংখ্যা প্রায় ৬৬ লাখ ধরা হয়েছিল।",
  },
  "prothomalo-en": {
    since: 2015,
    en: "Prothom Alo English is the English-language news site of Prothom Alo, the Bangla daily founded in 1998. It launched on 22 March 2015 and is published from Dhaka by Mediastar, part of Transcom Group.",
    bn: "প্রথম আলো ইংরেজি হলো ১৯৯৮ সালে প্রতিষ্ঠিত বাংলা দৈনিক প্রথম আলোর ইংরেজি সংবাদ সাইট। এর যাত্রা শুরু ২০১৫ সালের ২২ মার্চ; ঢাকা থেকে প্রকাশ করে ট্রান্সকম গ্রুপের প্রতিষ্ঠান মিডিয়াস্টার।",
  },
  "dailystar-bn": {
    en: "The Daily Star Bangla is the Bangla-language online edition of The Daily Star, the English daily founded in Dhaka in 1991. It is published by Mediaworld, in which Transcom Group holds the majority stake.",
    bn: "দ্য ডেইলি স্টার বাংলা হলো ১৯৯১ সালে ঢাকায় প্রতিষ্ঠিত ইংরেজি দৈনিক দ্য ডেইলি স্টারের বাংলা অনলাইন সংস্করণ। প্রকাশক মিডিয়াওয়ার্ল্ড, যার সংখ্যাগরিষ্ঠ মালিকানা ট্রান্সকম গ্রুপের।",
  },
  dailystar: {
    since: 1991,
    en: "The Daily Star is an English-language daily newspaper published in Dhaka since 14 January 1991. Its publisher, Mediaworld, is majority-owned by Transcom Group, which also owns Prothom Alo.",
    bn: "দ্য ডেইলি স্টার ঢাকা থেকে প্রকাশিত ইংরেজি দৈনিক, প্রকাশ শুরু ১৯৯১ সালের ১৪ জানুয়ারি। প্রকাশক মিডিয়াওয়ার্ল্ডের সংখ্যাগরিষ্ঠ মালিকানা ট্রান্সকম গ্রুপের, যারা প্রথম আলোরও মালিক।",
  },
  dailysun: {
    since: 2010,
    en: "Daily Sun is an English-language daily newspaper published in Dhaka since 24 October 2010. It belongs to East West Media Group, part of Bashundhara Group, alongside the Bangla dailies Kaler Kantho and Bangladesh Pratidin.",
    bn: "ডেইলি সান ঢাকা থেকে প্রকাশিত ইংরেজি দৈনিক, যাত্রা শুরু ২০১০ সালের ২৪ অক্টোবর। এটি বসুন্ধরা গ্রুপের ইস্ট ওয়েস্ট মিডিয়া গ্রুপের পত্রিকা; একই গ্রুপ কালের কণ্ঠ ও বাংলাদেশ প্রতিদিনও প্রকাশ করে।",
  },
  jugantor: {
    since: 2000,
    en: "Jugantor is a Bangla-language daily newspaper published in Dhaka since 1 February 2000 by Jamuna Printing and Publishing, part of Jamuna Group. It launched with the slogan “fearless in search of truth”.",
    bn: "যুগান্তর ঢাকা থেকে প্রকাশিত বাংলা দৈনিক, প্রকাশ শুরু ২০০০ সালের ১ ফেব্রুয়ারি। প্রকাশক যমুনা গ্রুপের প্রতিষ্ঠান যমুনা প্রিন্টিং অ্যান্ড পাবলিশিং লিমিটেড; পত্রিকাটির স্লোগান ‘সত্যের সন্ধানে নির্ভীক’।",
  },
  kalerkantho: {
    since: 2010,
    en: "Kaler Kantho is a Bangla-language daily newspaper published in Dhaka since 10 January 2010. It is part of East West Media Group (Bashundhara Group), which also publishes Bangladesh Pratidin and the Daily Sun.",
    bn: "কালের কণ্ঠ ঢাকা থেকে প্রকাশিত বাংলা দৈনিক, প্রকাশ শুরু ২০১০ সালের ১০ জানুয়ারি। এটি বসুন্ধরা গ্রুপের ইস্ট ওয়েস্ট মিডিয়া গ্রুপের পত্রিকা; একই গ্রুপ বাংলাদেশ প্রতিদিন ও ডেইলি সানও প্রকাশ করে।",
  },
  observerbd: {
    since: 2011,
    en: "The Daily Observer is an English-language daily newspaper published in Dhaka by Observer Ltd. since 1 February 2011. It is a separate paper from the older Bangladesh Observer, which closed in 2010.",
    bn: "ডেইলি অবজারভার ঢাকা থেকে প্রকাশিত ইংরেজি দৈনিক; ২০১১ সালের ১ ফেব্রুয়ারি থেকে এটি প্রকাশ করছে অবজারভার লিমিটেড। ২০১০ সালে বন্ধ হয়ে যাওয়া পুরোনো বাংলাদেশ অবজারভার থেকে এটি আলাদা পত্রিকা।",
  },
  mzamin: {
    en: "Manab Zamin is a Bangla-language daily newspaper published in Dhaka, founded in the late 1990s. Unlike most Bangladeshi dailies, which are broadsheets, it is printed in tabloid format.",
    bn: "মানবজমিন ঢাকা থেকে প্রকাশিত বাংলা দৈনিক, যাত্রা শুরু নব্বইয়ের দশকের শেষ দিকে। দেশের বেশির ভাগ দৈনিক ব্রডশিট আকারে ছাপা হলেও মানবজমিন ছাপা হয় ট্যাবলয়েড আকারে।",
  },
  ittefaq: {
    since: 1953,
    en: "Ittefaq is one of the oldest Bangla newspapers still published. It began in 1949 as a weekly, during the Pakistan period, became a daily on 24 December 1953, and is published in Dhaka by Ittefaq Group of Publications.",
    bn: "ইত্তেফাক এখনো প্রকাশিত প্রাচীনতম বাংলা পত্রিকাগুলোর একটি। পাকিস্তান আমলে ১৯৪৯ সালে সাপ্তাহিক হিসেবে যাত্রা শুরু, ১৯৫৩ সালের ২৪ ডিসেম্বর থেকে দৈনিক; ঢাকা থেকে প্রকাশ করে ইত্তেফাক গ্রুপ অব পাবলিকেশন্স।",
  },
  "banglanews24": {
    since: 2010,
    en: "Banglanews24 is an online news site publishing in Bangla and English, launched in Dhaka on 1 July 2010. It belongs to East West Media Group, part of Bashundhara Group.",
    bn: "বাংলানিউজ২৪ বাংলা ও ইংরেজিতে প্রকাশিত অনলাইন সংবাদ সাইট, ঢাকা থেকে যাত্রা শুরু ২০১০ সালের ১ জুলাই। এটি বসুন্ধরা গ্রুপের ইস্ট ওয়েস্ট মিডিয়া গ্রুপের প্রতিষ্ঠান।",
  },
  kalbela: {
    en: "Kalbela is a Bangla-language daily newspaper and news site published in Dhaka by Kalbela Media. The title dates from 1991; the paper in its current form was relaunched on 16 October 2022 after a change of ownership.",
    bn: "কালবেলা ঢাকা থেকে প্রকাশিত বাংলা দৈনিক ও সংবাদ সাইট, প্রকাশক কালবেলা মিডিয়া লিমিটেড। পত্রিকার নামটি ১৯৯১ সালের; মালিকানা বদলের পর বর্তমান রূপে এর নতুন যাত্রা শুরু ২০২২ সালের ১৬ অক্টোবর।",
  },
  amadershomoy: {
    since: 2003,
    en: "Amader Shomoy is a Bangla-language daily newspaper published in Dhaka since 2003 by New Vision Ltd. Alongside the print edition, its news is published online.",
    bn: "আমাদের সময় ঢাকা থেকে প্রকাশিত বাংলা দৈনিক; ২০০৩ সাল থেকে এটি প্রকাশ করছে নিউ ভিশন লিমিটেড। ছাপা সংস্করণের পাশাপাশি এর খবর অনলাইনেও প্রকাশিত হয়।",
  },
  amardesh: {
    since: 2004,
    en: "Amar Desh is a Bangla-language daily newspaper published in Dhaka by Amar Desh Publications, first launched in 2004. Its regular print edition resumed on 22 December 2024.",
    bn: "আমার দেশ ঢাকা থেকে প্রকাশিত বাংলা দৈনিক, প্রকাশক আমার দেশ পাবলিকেশন্স লিমিটেড; প্রথম প্রকাশ ২০০৪ সালে। ২০২৪ সালের ২২ ডিসেম্বর থেকে এর ছাপা সংস্করণ আবার নিয়মিত প্রকাশিত হচ্ছে।",
  },
  "bd-pratidin": {
    since: 2010,
    en: "Bangladesh Pratidin is a Bangla-language daily newspaper published in Dhaka since 15 March 2010 by East West Media Group, part of Bashundhara Group. In 2014, figures from the government's Department of Films and Publications put its circulation above 553,000 copies a day, the highest of any daily.",
    bn: "বাংলাদেশ প্রতিদিন ঢাকা থেকে প্রকাশিত বাংলা দৈনিক; ২০১০ সালের ১৫ মার্চ থেকে এটি প্রকাশ করছে বসুন্ধরা গ্রুপের ইস্ট ওয়েস্ট মিডিয়া গ্রুপ। ২০১৪ সালে চলচ্চিত্র ও প্রকাশনা অধিদপ্তরের হিসাবে এর দৈনিক প্রচারসংখ্যা ছিল সাড়ে পাঁচ লাখের বেশি, দেশের দৈনিকগুলোর মধ্যে সর্বোচ্চ।",
  },
  nayadiganta: {
    since: 2004,
    en: "Naya Diganta is a Bangla-language daily newspaper published in Dhaka since 2004 by Diganta Media Corporation. Alongside the print edition, its news is published online.",
    bn: "নয়া দিগন্ত ঢাকা থেকে প্রকাশিত বাংলা দৈনিক; ২০০৪ সাল থেকে এটি প্রকাশ করছে দিগন্ত মিডিয়া করপোরেশন। ছাপা সংস্করণের পাশাপাশি এর খবর অনলাইনেও প্রকাশিত হয়।",
  },
  bonikbarta: {
    since: 2011,
    en: "Bonik Barta is a Bangla-language business daily published in Dhaka since 7 June 2011, in print and online. It concentrates on business and economic news.",
    bn: "বণিক বার্তা ঢাকা থেকে প্রকাশিত বাংলা ব্যবসায় দৈনিক; ছাপা ও অনলাইনে প্রকাশ শুরু ২০১১ সালের ৭ জুন। এর মূল বিষয় অর্থনীতি ও ব্যবসা-বাণিজ্যের খবর।",
  },
  bhorerkagoj: {
    since: 1992,
    en: "Bhorer Kagoj is a Bangla-language newspaper first published in Dhaka as a daily on 15 February 1992. Its publisher is Mediascene Ltd., and its news is published online.",
    bn: "ভোরের কাগজ বাংলা দৈনিক, ঢাকা থেকে প্রথম প্রকাশিত হয় ১৯৯২ সালের ১৫ ফেব্রুয়ারি। প্রকাশক মিডিয়াসিন লিমিটেড; এর খবর অনলাইনেও প্রকাশিত হয়।",
  },
  inqilab: {
    since: 1986,
    en: "Inqilab is a Bangla-language daily newspaper published in Dhaka since 4 June 1986. Alongside the print edition, its news is published online.",
    bn: "ইনকিলাব ঢাকা থেকে প্রকাশিত বাংলা দৈনিক, প্রকাশ শুরু ১৯৮৬ সালের ৪ জুন। ছাপা সংস্করণের পাশাপাশি এর খবর অনলাইনেও প্রকাশিত হয়।",
  },
  deshrupantor: {
    since: 2018,
    en: "Desh Rupantor is a Bangla-language daily newspaper published in Dhaka since 20 December 2018 by Rupayan Media and Communications, in print and online.",
    bn: "দেশ রূপান্তর ঢাকা থেকে প্রকাশিত বাংলা দৈনিক; ২০১৮ সালের ২০ ডিসেম্বর থেকে ছাপা ও অনলাইনে এটি প্রকাশ করছে রূপায়ণ মিডিয়া অ্যান্ড কমিউনিকেশনস লিমিটেড।",
  },
  sarabangla: {
    since: 2017,
    en: "Sarabangla is a Bangla-language online news site based in Dhaka, launched on 6 December 2017. It also publishes an English-language edition.",
    bn: "সারাবাংলা ঢাকাভিত্তিক বাংলা অনলাইন সংবাদ সাইট, আনুষ্ঠানিক যাত্রা শুরু ২০১৭ সালের ৬ ডিসেম্বর। এর একটি ইংরেজি সংস্করণও আছে।",
  },
  "bdnews24-bn": {
    en: "bdnews24 Bangla is the Bangla-language side of bdnews24.com, the online newspaper published in Dhaka by Bangladesh News 24 Hours Ltd, which opened to the public on 23 October 2006. The Financial Express has described it as the first Bangla internet news outlet in Bangladesh.",
    bn: "বিডিনিউজ২৪ বাংলা হলো ঢাকা থেকে বাংলাদেশ নিউজ ২৪ আওয়ার্স লিমিটেড প্রকাশিত অনলাইন সংবাদপত্র বিডিনিউজ২৪ ডটকমের বাংলা সংস্করণ; সাইটটি সবার জন্য খুলে দেওয়া হয় ২০০৬ সালের ২৩ অক্টোবর। দ্য ফিন্যান্সিয়াল এক্সপ্রেস একে দেশের প্রথম বাংলা ইন্টারনেট সংবাদমাধ্যম বলেছে।",
  },
  "bdnews24-en": {
    since: 2006,
    en: "bdnews24.com is an online newspaper published in Dhaka by Bangladesh News 24 Hours Ltd, open to the public since 23 October 2006. It grew out of BDNEWS, an internet news agency started in 2005, and describes itself as Bangladesh's first online newspaper.",
    bn: "বিডিনিউজ২৪ ডটকম ঢাকা থেকে বাংলাদেশ নিউজ ২৪ আওয়ার্স লিমিটেড প্রকাশিত অনলাইন সংবাদপত্র, ২০০৬ সালের ২৩ অক্টোবর থেকে সবার জন্য উন্মুক্ত। ২০০৫ সালে চালু হওয়া ইন্টারনেটভিত্তিক সংবাদ সংস্থা বিডিনিউজ থেকে এর জন্ম; এটি নিজেকে দেশের প্রথম অনলাইন সংবাদপত্র বলে পরিচয় দেয়। এই পাতাটি এর ইংরেজি সংস্করণের।",
  },
  dhakatribune: {
    since: 2013,
    en: "Dhaka Tribune is an English-language daily newspaper published in Dhaka since 19 April 2013 by 2A Media Limited, whose largest shareholder is Gemcon Group. It has been the official media partner of the Dhaka Literary Festival since 2015.",
    bn: "ঢাকা ট্রিবিউন ঢাকা থেকে প্রকাশিত ইংরেজি দৈনিক; ২০১৩ সালের ১৯ এপ্রিল থেকে এটি প্রকাশ করছে টুএ মিডিয়া লিমিটেড, যার সবচেয়ে বড় অংশীদার জেমকন গ্রুপ। ২০১৫ সাল থেকে এটি ঢাকা লিট ফেস্টের আনুষ্ঠানিক মিডিয়া পার্টনার।",
  },
  banglatribune: {
    since: 2014,
    en: "Bangla Tribune is a Bangla-language online news site launched in Dhaka on 13 May 2014. It is published by 2A Media Limited as a sister site of the English-language Dhaka Tribune.",
    bn: "বাংলা ট্রিবিউন ঢাকা থেকে প্রকাশিত বাংলা অনলাইন সংবাদ সাইট, যাত্রা শুরু ২০১৪ সালের ১৩ মে। প্রকাশক টুএ মিডিয়া লিমিটেড; এটি ইংরেজি দৈনিক ঢাকা ট্রিবিউনের সহযোগী প্রকাশনা।",
  },
  tbs: {
    since: 2020,
    en: "The Business Standard is an English-language daily newspaper published in Dhaka by The Horizon Media and Publication Ltd, online since 2019 and in print since 21 January 2020. It concentrates on business and the economy alongside general news.",
    bn: "দ্য বিজনেস স্ট্যান্ডার্ড ঢাকা থেকে প্রকাশিত ইংরেজি দৈনিক, প্রকাশক দ্য হরাইজন মিডিয়া অ্যান্ড পাবলিকেশন লিমিটেড; অনলাইনে ২০১৯ সাল থেকে এবং ছাপা সংস্করণে ২০২০ সালের ২১ জানুয়ারি থেকে প্রকাশিত। সাধারণ খবরের পাশাপাশি এর মূল মনোযোগ ব্যবসা ও অর্থনীতিতে।",
  },
  "tbs-bn": {
    en: "TBS Bangla is the Bangla-language online edition of The Business Standard, the English daily published in Dhaka by The Horizon Media and Publication Ltd since 2020. It brings the paper's business, economic and general news to Bangla readers.",
    bn: "টিবিএস বাংলা হলো ২০২০ সাল থেকে ঢাকায় দ্য হরাইজন মিডিয়া অ্যান্ড পাবলিকেশন লিমিটেড প্রকাশিত ইংরেজি দৈনিক দ্য বিজনেস স্ট্যান্ডার্ডের বাংলা অনলাইন সংস্করণ। এতে বাংলায় ব্যবসা, অর্থনীতি ও সাধারণ খবর প্রকাশিত হয়।",
  },
  samakal: {
    since: 2005,
    en: "Samakal is a Bangla-language daily newspaper published in Dhaka since 2005. It is owned by Ha-Meem Group, and its news is published online alongside the print edition.",
    bn: "সমকাল ঢাকা থেকে প্রকাশিত বাংলা দৈনিক, প্রকাশ শুরু ২০০৫ সালে। এর মালিকানা হা-মীম গ্রুপের; ছাপা সংস্করণের পাশাপাশি এর খবর অনলাইনেও প্রকাশিত হয়।",
  },
  ajkerpatrika: {
    since: 2021,
    en: "Ajker Patrika is a Bangla-language daily newspaper published in Dhaka since 27 June 2021 by Bijoy Bangla Media (US-Bangla Group). Alongside its national edition it publishes regional local editions.",
    bn: "আজকের পত্রিকা ঢাকা থেকে প্রকাশিত বাংলা দৈনিক; ২০২১ সালের ২৭ জুন থেকে এটি প্রকাশ করছে ইউএস-বাংলা গ্রুপের প্রতিষ্ঠান বিজয় বাংলা মিডিয়া লিমিটেড। জাতীয় সংস্করণের পাশাপাশি এর বিভিন্ন আঞ্চলিক সংস্করণও প্রকাশিত হয়।",
  },
  sangbad: {
    since: 1951,
    en: "Sangbad is a Bangla-language daily newspaper published in Dhaka since 17 May 1951; The Daily Star has called it the country's oldest national daily. Alongside the print edition, its news is published online.",
    bn: "সংবাদ ঢাকা থেকে প্রকাশিত বাংলা দৈনিক, প্রকাশ শুরু ১৯৫১ সালের ১৭ মে; দ্য ডেইলি স্টার একে দেশের প্রাচীনতম জাতীয় দৈনিক বলেছে। ছাপা সংস্করণের পাশাপাশি এর খবর অনলাইনেও প্রকাশিত হয়।",
  },
  "jagonews24": {
    since: 2014,
    en: "Jago News 24 is a Bangla-language online news site launched in Dhaka in May 2014 and published by AKC (Pvt) Ltd. Since 2015 it has also printed a special Eid edition.",
    bn: "জাগো নিউজ২৪ ঢাকা থেকে প্রকাশিত বাংলা অনলাইন সংবাদ সাইট, যাত্রা শুরু ২০১৪ সালের মে মাসে; প্রকাশক একেসি (প্রাইভেট) লিমিটেড। ২০১৫ সাল থেকে এটি ঈদ উপলক্ষে বিশেষ ছাপা সংস্করণও প্রকাশ করে।",
  },
  dhakapost: {
    since: 2021,
    en: "Dhaka Post is an online news site launched in Dhaka on 16 February 2021, publishing mainly in Bangla with some English content. It belongs to Bijoy Bangla Media (US-Bangla Group), the same owner as the daily Ajker Patrika.",
    bn: "ঢাকা পোস্ট ঢাকা থেকে প্রকাশিত অনলাইন সংবাদ সাইট, যাত্রা শুরু ২০২১ সালের ১৬ ফেব্রুয়ারি; খবর মূলত বাংলায়, কিছু ইংরেজিতেও। এর মালিক ইউএস-বাংলা গ্রুপের বিজয় বাংলা মিডিয়া লিমিটেড, যারা দৈনিক আজকের পত্রিকারও মালিক।",
  },
  risingbd: {
    since: 2013,
    en: "Rising BD is a Bangla-language online news site launched in Dhaka on 26 April 2013 by Skyroute Media Limited. It also runs an English-language section.",
    bn: "রাইজিংবিডি ঢাকা থেকে প্রকাশিত বাংলা অনলাইন সংবাদ সাইট; ২০১৩ সালের ২৬ এপ্রিল এটি চালু করে স্কাইরুট মিডিয়া লিমিটেড। এর একটি ইংরেজি বিভাগও আছে।",
  },
  "daily-bangladesh": {
    en: "Daily Bangladesh is a Bangla-language online news site based in Dhaka, published by Daily Bangladesh Media Limited and registered with the Ministry of Information and Broadcasting as an online news portal.",
    bn: "ডেইলি বাংলাদেশ ঢাকাভিত্তিক বাংলা অনলাইন সংবাদ সাইট, প্রকাশক ডেইলি বাংলাদেশ মিডিয়া লিমিটেড। এটি তথ্য ও সম্প্রচার মন্ত্রণালয়ে নিবন্ধিত অনলাইন সংবাদমাধ্যম।",
  },
  "barta24": {
    en: "Barta24 is a Bangla-language online news site based in Dhaka and run by Barta Media Limited, publishing news around the clock.",
    bn: "বার্তা২৪ ঢাকাভিত্তিক বাংলা অনলাইন সংবাদ সাইট, পরিচালনায় বার্তা মিডিয়া লিমিটেড; সাইটটিতে দিনরাত খবর প্রকাশিত হয়।",
  },
  "dhakatimes24": {
    en: "Dhaka Times is a Bangla-language online news site based in Dhaka, publishing since the early 2010s.",
    bn: "ঢাকা টাইমস ঢাকাভিত্তিক বাংলা অনলাইন সংবাদ সাইট, প্রকাশিত হচ্ছে ২০১০-এর দশকের শুরু থেকে।",
  },
  "ekushey-tv": {
    since: 2000,
    en: "Ekushey Television (ETV) went on air on 14 April 2000 as Bangladesh's first private terrestrial TV channel, and returned as a satellite channel in 2007. Based in Dhaka, it broadcasts entertainment and news, which its website also publishes.",
    bn: "একুশে টেলিভিশন (ইটিভি) ২০০০ সালের ১৪ এপ্রিল দেশের প্রথম বেসরকারি টেরেস্ট্রিয়াল টিভি চ্যানেল হিসেবে সম্প্রচার শুরু করে; ২০০৭ সালে এটি স্যাটেলাইট চ্যানেল হিসেবে আবার ফিরে আসে। ঢাকাভিত্তিক চ্যানেলটি বিনোদন ও সংবাদ সম্প্রচার করে, যার খবর এর ওয়েবসাইটেও প্রকাশিত হয়।",
  },
  jamuna: {
    since: 2014,
    en: "Jamuna Television is a Bangla news and current-affairs satellite channel owned by Jamuna Group, on air from Dhaka since 5 April 2014. Its website and YouTube channel carry its news reports.",
    bn: "যমুনা টেলিভিশন যমুনা গ্রুপের মালিকানাধীন সংবাদ ও চলতি ঘটনাভিত্তিক বাংলা স্যাটেলাইট চ্যানেল, ঢাকা থেকে সম্প্রচার শুরু ২০১৪ সালের ৫ এপ্রিল। এর ওয়েবসাইট ও ইউটিউব চ্যানেলে সংবাদ প্রতিবেদন প্রকাশিত হয়।",
  },
  channeli: {
    since: 1999,
    en: "Channel i is a Bangla satellite TV channel launched in Dhaka on 1 October 1999 by Impress Group, and described as Bangladesh's first digital TV channel. It broadcasts entertainment and news, and Channel i Online is its news website.",
    bn: "চ্যানেল আই ইমপ্রেস গ্রুপের বাংলা স্যাটেলাইট টিভি চ্যানেল, ঢাকা থেকে যাত্রা শুরু ১৯৯৯ সালের ১ অক্টোবর; একে দেশের প্রথম ডিজিটাল টিভি চ্যানেল বলা হয়। চ্যানেলটি বিনোদন ও সংবাদ সম্প্রচার করে, আর চ্যানেল আই অনলাইন এর সংবাদ ওয়েবসাইট।",
  },
  ntv: {
    since: 2003,
    en: "NTV is a Bangla satellite TV channel on air since 3 July 2003, run by International Television Channel Limited from Karwan Bazar in Dhaka. It broadcasts entertainment and news, which its website and YouTube channel also carry.",
    bn: "এনটিভি বাংলা স্যাটেলাইট টিভি চ্যানেল, সম্প্রচার শুরু ২০০৩ সালের ৩ জুলাই; ঢাকার কারওয়ান বাজার থেকে এটি পরিচালনা করে ইন্টারন্যাশনাল টেলিভিশন চ্যানেল লিমিটেড। চ্যানেলটি বিনোদন ও সংবাদ সম্প্রচার করে, যা এর ওয়েবসাইট ও ইউটিউব চ্যানেলেও প্রকাশিত হয়।",
  },
  rtv: {
    since: 2005,
    en: "RTV is a Bangla satellite TV channel run by Bengal Media Corporation, broadcasting from Dhaka since 26 December 2005; it began as a sister channel of NTV. RTV Online is its news website.",
    bn: "আরটিভি বেঙ্গল মিডিয়া করপোরেশনের বাংলা স্যাটেলাইট টিভি চ্যানেল, ঢাকা থেকে সম্প্রচার শুরু ২০০৫ সালের ২৬ ডিসেম্বর; শুরুতে এটি এনটিভির সহযোগী চ্যানেল ছিল। আরটিভি অনলাইন এর সংবাদ ওয়েবসাইট।",
  },
  ekattor: {
    since: 2012,
    en: "Ekattor TV is a Bangla news channel owned by Meghna Group of Industries, broadcasting from Dhaka since 21 June 2012. It has been described as Bangladesh's first news channel to broadcast in full HD.",
    bn: "একাত্তর টিভি মেঘনা গ্রুপ অব ইন্ডাস্ট্রিজের মালিকানাধীন বাংলা সংবাদ চ্যানেল, ঢাকা থেকে সম্প্রচার শুরু ২০১২ সালের ২১ জুন। একে দেশের প্রথম ফুল এইচডি সংবাদ চ্যানেল বলা হয়।",
  },
  "channel24": {
    since: 2012,
    en: "Channel 24 is a Bangla satellite channel run by Times Media Limited (Ha-Meem Group), launched in Dhaka on 24 May 2012. It began as a mixed entertainment channel and later moved mainly to news and current affairs.",
    bn: "চ্যানেল ২৪ হা-মীম গ্রুপের প্রতিষ্ঠান টাইমস মিডিয়া লিমিটেডের বাংলা স্যাটেলাইট চ্যানেল, ঢাকা থেকে যাত্রা শুরু ২০১২ সালের ২৪ মে। শুরুতে বিনোদন ও সংবাদ মিলিয়ে চললেও পরে এটি মূলত সংবাদ ও চলতি ঘটনার চ্যানেলে পরিণত হয়।",
  },
  itv: {
    since: 2011,
    en: "Independent Television is a 24-hour Bangla news channel owned by BEXIMCO, on air from Dhaka since 28 July 2011. It was the first Bangladeshi TV channel to broadcast using MPEG-4 technology.",
    bn: "ইনডিপেনডেন্ট টেলিভিশন বেক্সিমকোর মালিকানাধীন ২৪ ঘণ্টার বাংলা সংবাদ চ্যানেল, ঢাকা থেকে সম্প্রচার শুরু ২০১১ সালের ২৮ জুলাই। দেশে এটিই প্রথম এমপেগ-৪ প্রযুক্তিতে সম্প্রচার শুরু করে।",
  },
  dbc: {
    since: 2016,
    en: "DBC News is a Bangla news channel run by Dhaka Bangla Media & Communication Ltd, on air from Dhaka since September 2016. Its news is also published on its website and YouTube channel.",
    bn: "ডিবিসি নিউজ ঢাকা বাংলা মিডিয়া অ্যান্ড কমিউনিকেশন লিমিটেডের বাংলা সংবাদ চ্যানেল, ঢাকা থেকে সম্প্রচার শুরু ২০১৬ সালের সেপ্টেম্বরে। এর খবর ওয়েবসাইট ও ইউটিউব চ্যানেলেও প্রকাশিত হয়।",
  },
  banglavision: {
    since: 2006,
    en: "BanglaVision is a Bangla satellite TV channel run by Shamol Bangla Media Limited, broadcasting from Dhaka since 31 March 2006 with the slogan “Drishti Jure Desh”. It carries entertainment and news.",
    bn: "বাংলাভিশন শ্যামল বাংলা মিডিয়া লিমিটেডের বাংলা স্যাটেলাইট টিভি চ্যানেল, ঢাকা থেকে সম্প্রচার শুরু ২০০৬ সালের ৩১ মার্চ; স্লোগান ‘দৃষ্টিজুড়ে দেশ’। চ্যানেলটি বিনোদন ও সংবাদ সম্প্রচার করে।",
  },
  shomoyeralo: {
    since: 2019,
    en: "Shomoyer Alo is a Bangla-language daily newspaper published in Dhaka since 2019 by Amin Mohammad Media Communication (Amin Mohammad Group). Alongside the print edition, its news is published online.",
    bn: "সময়ের আলো ঢাকা থেকে প্রকাশিত বাংলা দৈনিক; ২০১৯ সাল থেকে এটি প্রকাশ করছে আমিন মোহাম্মদ গ্রুপের প্রতিষ্ঠান আমিন মোহাম্মদ মিডিয়া কমিউনিকেশন লিমিটেড। ছাপা সংস্করণের পাশাপাশি এর খবর অনলাইনেও প্রকাশিত হয়।",
  },
  alokito: {
    since: 2013,
    en: "Alokito Bangladesh is a Bangla-language daily newspaper published in Dhaka since 2013 by Alokito Media Ltd, in print and online.",
    bn: "আলোকিত বাংলাদেশ ঢাকা থেকে প্রকাশিত বাংলা দৈনিক; ২০১৩ সাল থেকে ছাপা ও অনলাইনে এটি প্রকাশ করছে আলোকিত মিডিয়া লিমিটেড।",
  },
  financialexpress: {
    since: 1993,
    en: "The Financial Express is an English-language daily newspaper published in Dhaka since 1993 by International Publications Limited. It focuses on business and the economy, and describes itself as Bangladesh's first financial daily in English.",
    bn: "দ্য ফিন্যান্সিয়াল এক্সপ্রেস ঢাকা থেকে প্রকাশিত ইংরেজি দৈনিক; ১৯৯৩ সাল থেকে এটি প্রকাশ করছে ইন্টারন্যাশনাল পাবলিকেশন্স লিমিটেড। এর মূল বিষয় ব্যবসা ও অর্থনীতি; পত্রিকাটি নিজেকে দেশের প্রথম ইংরেজি অর্থনৈতিক দৈনিক বলে পরিচয় দেয়।",
  },
  newage: {
    since: 2003,
    en: "New Age is an English-language daily newspaper published in Dhaka by Media New Age Limited since 2003. Alongside the print edition, its news is published online.",
    bn: "নিউ এজ ঢাকা থেকে প্রকাশিত ইংরেজি দৈনিক; ২০০৩ সাল থেকে এটি প্রকাশ করছে মিডিয়া নিউ এজ লিমিটেড। ছাপা সংস্করণের পাশাপাশি এর খবর অনলাইনেও প্রকাশিত হয়।",
  },
  bangladeshpost: {
    en: "Bangladesh Post is an English-language daily newspaper published in Dhaka. Alongside the print edition, its news is published online.",
    bn: "বাংলাদেশ পোস্ট ঢাকা থেকে প্রকাশিত ইংরেজি দৈনিক। ছাপা সংস্করণের পাশাপাশি এর খবর অনলাইনেও প্রকাশিত হয়।",
  },
  asianage: {
    en: "The Asian Age is an English-language daily newspaper published in Dhaka by Express Media Ltd. It is a separate paper from the Indian newspaper of the same name.",
    bn: "দ্য এশিয়ান এজ ঢাকা থেকে প্রকাশিত ইংরেজি দৈনিক, প্রকাশক এক্সপ্রেস মিডিয়া লিমিটেড। একই নামের ভারতীয় পত্রিকা থেকে এটি আলাদা।",
  },
  unb: {
    since: 1988,
    en: "United News of Bangladesh (UNB) is a private news agency founded in Dhaka in 1988. It supplies news to newspapers and broadcasters, and its principal international news-exchange partner is the Associated Press.",
    bn: "ইউনাইটেড নিউজ অব বাংলাদেশ (ইউএনবি) ১৯৮৮ সালে ঢাকায় প্রতিষ্ঠিত বেসরকারি সংবাদ সংস্থা। এটি সংবাদপত্র ও সম্প্রচারমাধ্যমে খবর সরবরাহ করে; আন্তর্জাতিক সংবাদ বিনিময়ে এর প্রধান সহযোগী অ্যাসোসিয়েটেড প্রেস (এপি)।",
  },
  "bss-bn": {
    since: 1999,
    en: "BSS Bangla is the Bangla news service of Bangladesh Sangbad Sangstha (BSS), the state-owned national news agency founded in Dhaka on 1 January 1972. The Bangla service was introduced in 1999.",
    bn: "বাসস বাংলা হলো রাষ্ট্রায়ত্ত জাতীয় সংবাদ সংস্থা বাংলাদেশ সংবাদ সংস্থার (বাসস) বাংলা সংবাদ সেবা। বাসসের যাত্রা শুরু ১৯৭২ সালের ১ জানুয়ারি ঢাকায়; বাংলা সেবা চালু হয় ১৯৯৯ সালে।",
  },
  bss: {
    since: 1972,
    en: "Bangladesh Sangbad Sangstha (BSS) is Bangladesh's state-owned national news agency, launched in Dhaka on 1 January 1972 from the Dhaka bureau of the Associated Press of Pakistan. This is its English-language news service.",
    bn: "বাংলাদেশ সংবাদ সংস্থা (বাসস) দেশের রাষ্ট্রায়ত্ত জাতীয় সংবাদ সংস্থা; অ্যাসোসিয়েটেড প্রেস অব পাকিস্তানের ঢাকা ব্যুরো থেকে ১৯৭২ সালের ১ জানুয়ারি এর যাত্রা শুরু। এটি বাসসের ইংরেজি সংবাদ সেবা।",
  },
  "bonikbarta-en": {
    en: "Bonik Barta English is the English-language online edition of Bonik Barta, the Bangla business daily first published in Dhaka in 2011. It covers Bangladesh's business and economic news in English.",
    bn: "বণিক বার্তা ইংরেজি হলো ২০১১ সালে ঢাকায় প্রথম প্রকাশিত বাংলা ব্যবসায় দৈনিক বণিক বার্তার ইংরেজি অনলাইন সংস্করণ। এতে ইংরেজিতে দেশের অর্থনীতি ও ব্যবসার খবর প্রকাশিত হয়।",
  },
  protidinersangbad: {
    since: 2012,
    en: "Protidiner Sangbad is a Bangla-language daily newspaper published by Frox Media Limited, first published in 2012. Alongside the print edition, its news is published online.",
    bn: "প্রতিদিনের সংবাদ একটি বাংলা দৈনিক, প্রকাশক ফ্রক্স মিডিয়া লিমিটেড; প্রথম প্রকাশ ২০১২ সালে। ছাপা সংস্করণের পাশাপাশি এর খবর অনলাইনেও প্রকাশিত হয়।",
  },
  kholakagoj: {
    en: "Khola Kagoj is a Bangla-language daily newspaper. Alongside the print edition, its news is published online at kholakagojbd.com.",
    bn: "খোলা কাগজ একটি বাংলা দৈনিক। ছাপা সংস্করণের পাশাপাশি এর খবর অনলাইনেও প্রকাশিত হয় kholakagojbd.com ঠিকানায়।",
  },
  "dhakatribune-bn": {
    en: "Dhaka Tribune Bangla is the Bangla-language edition of the Dhaka Tribune, the English daily published in Dhaka since 2013 by 2A Media Limited. It is a separate site from Bangla Tribune, the same company's other Bangla news site.",
    bn: "ঢাকা ট্রিবিউন বাংলা হলো ২০১৩ সাল থেকে ঢাকায় টুএ মিডিয়া লিমিটেড প্রকাশিত ইংরেজি দৈনিক ঢাকা ট্রিবিউনের বাংলা সংস্করণ। একই প্রতিষ্ঠানের আরেক বাংলা সংবাদ সাইট বাংলা ট্রিবিউন থেকে এটি আলাদা।",
  },
  somoy: {
    since: 2011,
    en: "Somoy TV is a 24-hour Bangla news channel run by Somoy Media Limited, broadcasting commercially from Dhaka since 17 April 2011. This page shows the news videos from its YouTube channel.",
    bn: "সময় টিভি সময় মিডিয়া লিমিটেডের ২৪ ঘণ্টার বাংলা সংবাদ চ্যানেল, ঢাকা থেকে বাণিজ্যিক সম্প্রচার শুরু ২০১১ সালের ১৭ এপ্রিল। এই পাতায় এর ইউটিউব চ্যানেলের সংবাদ ভিডিও দেখানো হয়।",
  },
  "atn-bangla": {
    since: 1997,
    en: "ATN Bangla, on air since 15 July 1997, was Bangladesh's first privately owned satellite TV channel. Run from Dhaka by Multimedia Production Company, it broadcasts entertainment and news; this YouTube channel carries its news.",
    bn: "এটিএন বাংলা দেশের প্রথম বেসরকারি স্যাটেলাইট টিভি চ্যানেল, সম্প্রচার শুরু ১৯৯৭ সালের ১৫ জুলাই। ঢাকা থেকে মাল্টিমিডিয়া প্রোডাকশন কোম্পানি পরিচালিত চ্যানেলটি বিনোদন ও সংবাদ সম্প্রচার করে; এই ইউটিউব চ্যানেলে এর খবর প্রকাশিত হয়।",
  },
  "atn-news": {
    since: 2010,
    en: "ATN News is a Bangla news and current-affairs satellite channel launched in Dhaka on 7 June 2010. It is the sister channel of ATN Bangla; both are run by Multimedia Production Company.",
    bn: "এটিএন নিউজ সংবাদ ও চলতি ঘটনাভিত্তিক বাংলা স্যাটেলাইট চ্যানেল, ঢাকা থেকে যাত্রা শুরু ২০১০ সালের ৭ জুন। এটি এটিএন বাংলার সহযোগী চ্যানেল; দুটিই পরিচালনা করে মাল্টিমিডিয়া প্রোডাকশন কোম্পানি।",
  },
  "news24": {
    since: 2016,
    en: "News24 is a Bangla satellite news channel owned by East West Media Group (Bashundhara Group). After test broadcasts from March 2016, it launched officially in Dhaka on 28 July 2016.",
    bn: "নিউজ২৪ বসুন্ধরা গ্রুপের ইস্ট ওয়েস্ট মিডিয়া গ্রুপের বাংলা স্যাটেলাইট সংবাদ চ্যানেল। ২০১৬ সালের মার্চ থেকে পরীক্ষামূলক সম্প্রচারের পর ২০১৬ সালের ২৮ জুলাই ঢাকা থেকে এর আনুষ্ঠানিক যাত্রা শুরু।",
  },
  desh: {
    since: 2009,
    en: "Desh TV is a Bangla satellite TV channel run by Desh Television Limited (Karnaphuli Group), on air from Dhaka since Independence Day, 26 March 2009. It broadcasts entertainment and news; this YouTube channel carries its news.",
    bn: "দেশ টিভি কর্ণফুলী গ্রুপের প্রতিষ্ঠান দেশ টেলিভিশন লিমিটেডের বাংলা স্যাটেলাইট চ্যানেল; স্বাধীনতা দিবসে, ২০০৯ সালের ২৬ মার্চ ঢাকা থেকে এর সম্প্রচার শুরু। চ্যানেলটি বিনোদন ও সংবাদ সম্প্রচার করে; এই ইউটিউব চ্যানেলে এর খবর প্রকাশিত হয়।",
  },
  "bbc-bangla": {
    since: 1941,
    en: "BBC News Bangla is the Bangla-language service of the BBC World Service, based in London. It began on 11 October 1941 as a 15-minute Bengali radio programme and now publishes news online, on video and on TV.",
    bn: "বিবিসি নিউজ বাংলা লন্ডনভিত্তিক বিবিসি ওয়ার্ল্ড সার্ভিসের বাংলা বিভাগ। ১৯৪১ সালের ১১ অক্টোবর ১৫ মিনিটের একটি বাংলা রেডিও অনুষ্ঠান হিসেবে এর যাত্রা শুরু; এখন এটি অনলাইন, ভিডিও ও টেলিভিশনে খবর প্রকাশ করে।",
  },
  mytv: {
    since: 2010,
    en: "My TV is a Bangla satellite TV channel run by V.M. International Limited, broadcasting from Dhaka since 15 April 2010. It carries entertainment and news; this YouTube channel carries its news.",
    bn: "মাই টিভি ভি.এম. ইন্টারন্যাশনাল লিমিটেডের বাংলা স্যাটেলাইট টিভি চ্যানেল, ঢাকা থেকে সম্প্রচার শুরু ২০১০ সালের ১৫ এপ্রিল। চ্যানেলটি বিনোদন ও সংবাদ সম্প্রচার করে; এই ইউটিউব চ্যানেলে এর খবর প্রকাশিত হয়।",
  },
  maasranga: {
    since: 2011,
    en: "Maasranga Television is a Bangla satellite TV channel owned by Square Group, on air from Dhaka since 30 July 2011; at its launch it was described as the first Bangladeshi channel to broadcast in HD. This YouTube channel carries its news.",
    bn: "মাছরাঙা টেলিভিশন স্কয়ার গ্রুপের বাংলা স্যাটেলাইট টিভি চ্যানেল, ঢাকা থেকে সম্প্রচার শুরু ২০১১ সালের ৩০ জুলাই; চালুর সময় একে দেশের প্রথম এইচডি সম্প্রচারকারী চ্যানেল বলা হয়েছিল। এই ইউটিউব চ্যানেলে এর খবর প্রকাশিত হয়।",
  },
  ekhon: {
    since: 2022,
    en: "Ekhon TV is a Bangla satellite channel focused on business, the economy and news, run by Spice Television Limited (City Group). It launched in Dhaka on 9 June 2022, after test broadcasts under the name Spice Television.",
    bn: "এখন টিভি ব্যবসা, অর্থনীতি ও সংবাদভিত্তিক বাংলা স্যাটেলাইট চ্যানেল, পরিচালনায় সিটি গ্রুপের স্পাইস টেলিভিশন লিমিটেড। স্পাইস টেলিভিশন নামে পরীক্ষামূলক সম্প্রচারের পর ২০২২ সালের ৯ জুন ঢাকা থেকে এর যাত্রা শুরু।",
  },
  btv: {
    since: 1964,
    en: "Bangladesh Television (BTV) is the state-owned public broadcaster, on terrestrial and satellite. It started on 25 December 1964 as the Dhaka station of Pakistan Television and took its present name after independence in 1971.",
    bn: "বাংলাদেশ টেলিভিশন (বিটিভি) রাষ্ট্রায়ত্ত সরকারি সম্প্রচারমাধ্যম, টেরেস্ট্রিয়াল ও স্যাটেলাইট দুই মাধ্যমেই সম্প্রচারিত হয়। ১৯৬৪ সালের ২৫ ডিসেম্বর পাকিস্তান টেলিভিশনের ঢাকা কেন্দ্র হিসেবে এর যাত্রা শুরু; ১৯৭১ সালে স্বাধীনতার পর এর বর্তমান নাম হয়।",
  },
  satv: {
    since: 2013,
    en: "SATV is a Bangla satellite TV channel owned by S.A. Group, broadcasting from Dhaka since 19 January 2013. It carries entertainment and news; this YouTube channel carries its news.",
    bn: "এসএ টিভি এস.এ. গ্রুপের বাংলা স্যাটেলাইট টিভি চ্যানেল, ঢাকা থেকে সম্প্রচার শুরু ২০১৩ সালের ১৯ জানুয়ারি। চ্যানেলটি বিনোদন ও সংবাদ সম্প্রচার করে; এই ইউটিউব চ্যানেলে এর খবর প্রকাশিত হয়।",
  },
  boishakhi: {
    en: "Boishakhi TV is a Bangla satellite TV channel run from Dhaka by Destiny 2000 Ltd., on air since the mid-2000s. It broadcasts entertainment and news; this YouTube channel carries its news.",
    bn: "বৈশাখী টিভি ঢাকা থেকে ডেসটিনি ২০০০ লিমিটেড পরিচালিত বাংলা স্যাটেলাইট টিভি চ্যানেল, সম্প্রচার শুরু ২০০০-এর দশকের মাঝামাঝি। চ্যানেলটি বিনোদন ও সংবাদ সম্প্রচার করে; এই ইউটিউব চ্যানেলে এর খবর প্রকাশিত হয়।",
  },
  banglatv: {
    en: "Bangla TV began as a Bengali-language channel based in London and moved its broadcasts to Bangladesh in 2017. It carries entertainment and news; this YouTube channel carries its news.",
    bn: "বাংলা টিভি লন্ডনভিত্তিক বাংলা চ্যানেল হিসেবে যাত্রা শুরু করে; ২০১৭ সালে এর সম্প্রচার বাংলাদেশে চলে আসে। চ্যানেলটি বিনোদন ও সংবাদ সম্প্রচার করে; এই ইউটিউব চ্যানেলে এর খবর প্রকাশিত হয়।",
  },
  asian: {
    since: 2013,
    en: "Asian TV is a Bangla satellite TV channel owned by Asian Group of Industries, broadcasting from Dhaka since 18 January 2013. It carries entertainment and news; this YouTube channel carries its news.",
    bn: "এশিয়ান টিভি এশিয়ান গ্রুপ অব ইন্ডাস্ট্রিজের বাংলা স্যাটেলাইট টিভি চ্যানেল, ঢাকা থেকে সম্প্রচার শুরু ২০১৩ সালের ১৮ জানুয়ারি। চ্যানেলটি বিনোদন ও সংবাদ সম্প্রচার করে; এই ইউটিউব চ্যানেলে এর খবর প্রকাশিত হয়।",
  },
  gtv: {
    since: 2012,
    en: "GTV (Gazi Television) is a Bangla entertainment and sports satellite channel run by Gazi Satellite Television (Gazi Group), on air from Dhaka since 12 June 2012. It held the Bangladesh Cricket Board's worldwide media rights for 2014–2020; this YouTube channel carries its news.",
    bn: "জিটিভি (গাজী টেলিভিশন) গাজী গ্রুপের গাজী স্যাটেলাইট টেলিভিশন লিমিটেড পরিচালিত বিনোদন ও খেলাধুলাভিত্তিক বাংলা স্যাটেলাইট চ্যানেল, ঢাকা থেকে সম্প্রচার শুরু ২০১২ সালের ১২ জুন। ২০১৪–২০২০ মেয়াদে বাংলাদেশ ক্রিকেট বোর্ডের বিশ্বব্যাপী সম্প্রচারস্বত্ব এর কাছে ছিল; এই ইউটিউব চ্যানেলে এর খবর প্রকাশিত হয়।",
  },
  "channel9": {
    since: 2012,
    en: "Channel Nine is a Bangla satellite TV channel run by Virgo Media Limited, broadcasting from Dhaka since 30 January 2012. Its programming centres on sport and entertainment, alongside news.",
    bn: "চ্যানেল নাইন ভার্গো মিডিয়া লিমিটেডের বাংলা স্যাটেলাইট টিভি চ্যানেল, ঢাকা থেকে সম্প্রচার শুরু ২০১২ সালের ৩০ জানুয়ারি। এর অনুষ্ঠানের কেন্দ্রে খেলাধুলা ও বিনোদন, পাশাপাশি সংবাদ।",
  },
  deepto: {
    since: 2015,
    en: "Deepto TV is a Bangla satellite TV channel run by Kazi Media Limited (Kazi Farms Group), on air from Dhaka since 18 November 2015. Its programming centres on entertainment, especially daily drama serials; this YouTube channel carries its news.",
    bn: "দীপ্ত টিভি কাজী ফার্মস গ্রুপের প্রতিষ্ঠান কাজী মিডিয়া লিমিটেডের বাংলা স্যাটেলাইট চ্যানেল, ঢাকা থেকে সম্প্রচার শুরু ২০১৫ সালের ১৮ নভেম্বর। এর অনুষ্ঠানের বড় অংশ বিনোদন, বিশেষ করে দৈনিক ধারাবাহিক নাটক; এই ইউটিউব চ্যানেলে এর খবর প্রকাশিত হয়।",
  },
  "dw-bangla": {
    since: 1975,
    en: "DW Bangla is the Bengali service of Deutsche Welle, Germany's international broadcaster, run from DW's headquarters in Bonn. It has broadcast in Bengali since 15 April 1975 and now publishes news online and on video.",
    bn: "ডয়চে ভেলে বাংলা জার্মানির আন্তর্জাতিক সম্প্রচারমাধ্যম ডয়চে ভেলের বাংলা বিভাগ, পরিচালিত হয় বনে ডিডব্লিউর প্রধান কার্যালয় থেকে। ১৯৭৫ সালের ১৫ এপ্রিল থেকে এটি বাংলায় সম্প্রচার করছে; এখন অনলাইন ও ভিডিওতে খবর প্রকাশ করে।",
  },
  "etv-news": {
    since: 2000,
    en: "This is the YouTube news channel of Ekushey Television (ETV), which went on air in Dhaka on 14 April 2000 as Bangladesh's first privately owned terrestrial channel. It carries ETV's news bulletins and reports.",
    bn: "এটি একুশে টেলিভিশনের (ইটিভি) সংবাদের ইউটিউব চ্যানেল। ইটিভি ২০০০ সালের ১৪ এপ্রিল ঢাকা থেকে দেশের প্রথম বেসরকারি টেরেস্ট্রিয়াল চ্যানেল হিসেবে সম্প্রচার শুরু করে; এই চ্যানেলে এর সংবাদ বুলেটিন ও প্রতিবেদন প্রকাশিত হয়।",
  },
  mohona: {
    since: 2010,
    en: "Mohona TV is a Bangla satellite TV channel broadcasting from Dhaka since 11 November 2010. It carries news and entertainment; this YouTube channel carries its news.",
    bn: "মোহনা টিভি বাংলা স্যাটেলাইট টিভি চ্যানেল, ঢাকা থেকে সম্প্রচার শুরু ২০১০ সালের ১১ নভেম্বর। চ্যানেলটি সংবাদ ও বিনোদন সম্প্রচার করে; এই ইউটিউব চ্যানেলে এর খবর প্রকাশিত হয়।",
  },
  globaltv: {
    since: 2022,
    en: "Global Television is a Bangla satellite TV channel run by Globe Multimedia Limited (Globe Pharma Group), on air from Dhaka since 30 June 2022. It carries entertainment and news; this YouTube channel carries its news.",
    bn: "গ্লোবাল টেলিভিশন গ্লোব ফার্মা গ্রুপের প্রতিষ্ঠান গ্লোব মাল্টিমিডিয়া লিমিটেডের বাংলা স্যাটেলাইট চ্যানেল, ঢাকা থেকে সম্প্রচার শুরু ২০২২ সালের ৩০ জুন। চ্যানেলটি বিনোদন ও সংবাদ সম্প্রচার করে; এই ইউটিউব চ্যানেলে এর খবর প্রকাশিত হয়।",
  },
};

export const outletProfile = (id: string): OutletProfile | undefined => OUTLET_PROFILES[id];
