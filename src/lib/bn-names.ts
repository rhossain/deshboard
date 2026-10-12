import type { Locale } from "./i18n";

/**
 * Outlets' names as they are written in Bangla, for Bangla pages: people search for "প্রথম আলো", not
 * "Prothom Alo". Keyed by source id (src/lib/sources.ts) and channel id (src/lib/channels.ts); a name
 * missing here falls back to the English one.
 */
const SOURCE_NAMES: Record<string, string> = {
  prothomalo: "প্রথম আলো",
  "prothomalo-en": "প্রথম আলো ইংরেজি",
  dailystar: "দ্য ডেইলি স্টার",
  "dailystar-bn": "দ্য ডেইলি স্টার বাংলা",
  "bdnews24-bn": "বিডিনিউজ২৪ বাংলা",
  "bdnews24-en": "বিডিনিউজ২৪ ইংরেজি",
  dhakatribune: "ঢাকা ট্রিবিউন",
  banglatribune: "বাংলা ট্রিবিউন",
  tbs: "দ্য বিজনেস স্ট্যান্ডার্ড",
  "tbs-bn": "টিবিএস বাংলা",
  jugantor: "যুগান্তর",
  kalerkantho: "কালের কণ্ঠ",
  samakal: "সমকাল",
  ittefaq: "ইত্তেফাক",
  "bd-pratidin": "বাংলাদেশ প্রতিদিন",
  nayadiganta: "নয়া দিগন্ত",
  mzamin: "মানবজমিন",
  deshrupantor: "দেশ রূপান্তর",
  kalbela: "কালবেলা",
  ajkerpatrika: "আজকের পত্রিকা",
  bonikbarta: "বণিক বার্তা",
  janakantha: "জনকণ্ঠ",
  inqilab: "ইনকিলাব",
  bhorerkagoj: "ভোরের কাগজ",
  amadershomoy: "আমাদের সময়",
  sangbad: "সংবাদ",
  jagonews24: "জাগো নিউজ২৪",
  dhakapost: "ঢাকা পোস্ট",
  risingbd: "রাইজিংবিডি",
  banglanews24: "বাংলানিউজ২৪",
  "daily-bangladesh": "ডেইলি বাংলাদেশ",
  sarabangla: "সারাবাংলা",
  barta24: "বার্তা২৪",
  dhakatimes24: "ঢাকা টাইমস",
  banglainsider: "বাংলা ইনসাইডার",
  "ekushey-tv": "একুশে টেলিভিশন",
  somoynews: "সময় নিউজ",
  jamuna: "যমুনা টিভি",
  channeli: "চ্যানেল আই অনলাইন",
  ntv: "এনটিভি",
  rtv: "আরটিভি অনলাইন",
  ekattor: "একাত্তর টিভি",
  channel24: "চ্যানেল ২৪",
  itv: "ইনডিপেনডেন্ট টেলিভিশন",
  dbc: "ডিবিসি নিউজ",
  banglavision: "বাংলাভিশন",
  shomoyeralo: "সময়ের আলো",
  alokito: "আলোকিত বাংলাদেশ",
  financialexpress: "দ্য ফিন্যান্সিয়াল এক্সপ্রেস",
  newage: "নিউ এজ",
  dailysun: "ডেইলি সান",
  observerbd: "ডেইলি অবজারভার",
  bangladeshpost: "বাংলাদেশ পোস্ট",
  asianage: "দ্য এশিয়ান এজ",
  dailymessenger: "দ্য ডেইলি মেসেঞ্জার",
  unb: "ইউএনবি",
  "bss-bn": "বাসস",
  bss: "বাসস ইংরেজি",
  "bonikbarta-en": "বণিক বার্তা ইংরেজি",
  protidinersangbad: "প্রতিদিনের সংবাদ",
  kholakagoj: "খোলা কাগজ",
  shokalerkhobor: "সকালের খবর",
  amardesh: "আমার দেশ",
  "dhakatribune-bn": "ঢাকা ট্রিবিউন বাংলা",
};

const CHANNEL_NAMES: Record<string, string> = {
  jamuna: "যমুনা টিভি",
  somoy: "সময় টিভি",
  channel24: "চ্যানেল ২৪",
  ekattor: "একাত্তর টিভি",
  itv: "ইনডিপেনডেন্ট টেলিভিশন",
  rtv: "আরটিভি নিউজ",
  "atn-bangla": "এটিএন বাংলা নিউজ",
  banglavision: "বাংলাভিশন নিউজ",
  ntv: "এনটিভি নিউজ",
  dbc: "ডিবিসি নিউজ",
  "atn-news": "এটিএন নিউজ",
  news24: "নিউজ২৪",
  desh: "দেশ টিভি নিউজ",
  "bbc-bangla": "বিবিসি নিউজ বাংলা",
  channeli: "চ্যানেল আই নিউজ",
  ekushey: "একুশে টেলিভিশন",
  mytv: "মাই টিভি",
  maasranga: "মাছরাঙা নিউজ",
  ekhon: "এখন টিভি",
  btv: "বিটিভি",
  satv: "এসএ টিভি",
  boishakhi: "বৈশাখী টিভি নিউজ",
  banglatv: "বাংলা টিভি",
  asian: "এশিয়ান টিভি",
  gtv: "জিটিভি নিউজ",
  channel9: "চ্যানেল নাইন",
  deepto: "দীপ্ত নিউজ",
  "dw-bangla": "ডয়চে ভেলে বাংলা",
  "etv-news": "ইটিভি নিউজ",
  mohona: "মোহনা টিভি",
  globaltv: "গ্লোবাল টিভি নিউজ",
};

/** A news site's name in the page's language. */
export function sourceName(id: string, name: string, locale: Locale): string {
  return locale === "bn" ? (SOURCE_NAMES[id] ?? name) : name;
}

/** A YouTube channel's name in the page's language. */
export function channelName(id: string, name: string, locale: Locale): string {
  return locale === "bn" ? (CHANNEL_NAMES[id] ?? name) : name;
}

// Bangla case endings depend on how the name ends: after a vowel sign or a vowel ("প্রথম আলো",
// "সময় টিভি") the possessive is -র and the locative -তে; after a consonant ("যুগান্তর", or "সময়", whose
// য় ends in a nukta) they are -ের and -ে; after anything else (digits, Latin letters) they are written
// apart, -এর and -এ.
const VOWEL_END = /[অ-ঔা-ৌৗ]$/;
const CONSONANT_END = /[ক-হ়ৎড়-য়]$/;

/** "প্রথম আলোর", "যুগান্তরের", "চ্যানেল ২৪-এর": whose. */
export function possessive(name: string): string {
  return VOWEL_END.test(name) ? `${name}র` : CONSONANT_END.test(name) ? `${name}ের` : `${name}-এর`;
}

/** "প্রথম আলোতে", "যুগান্তরে", "bdnews24.com-এ": where. */
export function locative(name: string): string {
  return VOWEL_END.test(name) ? `${name}তে` : CONSONANT_END.test(name) ? `${name}ে` : `${name}-এ`;
}
