export type Category =
  | "national"
  | "politics"
  | "international"
  | "business"
  | "sports"
  | "entertainment"
  | "tech"
  | "education"
  | "health"
  | "lifestyle"
  | "crime"
  | "opinion"
  | "other";

export const CATEGORIES: { id: Category; label: string; bn: string }[] = [
  { id: "national", label: "National", bn: "জাতীয়" },
  { id: "politics", label: "Politics", bn: "রাজনীতি" },
  { id: "international", label: "International", bn: "আন্তর্জাতিক" },
  { id: "business", label: "Business", bn: "অর্থনীতি" },
  { id: "sports", label: "Sports", bn: "খেলা" },
  { id: "entertainment", label: "Entertainment", bn: "বিনোদন" },
  { id: "tech", label: "Science & Tech", bn: "বিজ্ঞান-প্রযুক্তি" },
  { id: "education", label: "Education", bn: "শিক্ষা" },
  { id: "health", label: "Health", bn: "স্বাস্থ্য" },
  { id: "lifestyle", label: "Lifestyle", bn: "জীবনযাপন" },
  { id: "crime", label: "Law & Crime", bn: "আইন-অপরাধ" },
  { id: "opinion", label: "Opinion", bn: "মতামত" },
  { id: "other", label: "Other", bn: "অন্যান্য" },
];

/**
 * Section names as portals spell them, in URL slugs (lower-cased) and in
 * RSS <category> / sitemap news:keywords. Matched as whole words only.
 */
const SYNONYMS: Record<Exclude<Category, "other">, string[]> = {
  national: [
    "national", "bangladesh", "country", "countries", "country-news", "national-news", "capital", "dhaka",
    "samagrabangladesh", "whole-country", "district", "ctg", "chittagong", "chittagong24", "rajshahi", "khulna",
    "barisal", "sylhet", "rangpur", "mymensingh", "city", "environment", "weather",
    "capital-city", "capital-news", "national-others", "tp-city", "tp-ten-horizon", "chattogram", "sohor-nogor", "desh", "জাতীয়", "দেশ", "সারাদেশ", "সারা দেশ", "রাজধানী", "বাংলাদেশ", "আবহাওয়া", "পরিবেশ",
  ],
  politics: ["politics", "politics-news", "election", "ncp", "jamat", "jamaat-e-islami", "রাজনীতি", "নির্বাচন"],
  international: [
    "international", "interrnational", "international-news", "world", "worldbiz", "foreign", "abroad", "probash",
    "durporobash", "neighbours", "asia", "america", "india", "middleeast", "united-state", "europe",
    "middle-east", "south-asia", "bbc", "আন্তর্জাতিক", "বিশ্ব", "বিশ্ব সংবাদ", "দেশান্তর", "বিদেশ", "প্রবাস",
  ],
  business: [
    "business", "economy", "economics", "economics-business-news", "trade", "stock", "share-market", "bangla-economy",
    "corporate", "banking", "finance", "finance-n-commerce", "jobs", "job", "jobs-career", "job-corner", "chakri",
    "employment", "চাকরি", "করপোরেট", "অর্থনীতি", "বাণিজ্য", "অর্থ-বাণিজ্য", "শেয়ারবাজার", "ব্যাংক",
  ],
  sports: [
    "sports", "sport", "cricket", "football", "more-sports", "tp-sports", "khela",
    "খেলা", "খেলাধুলা", "ক্রিকেট", "ফুটবল",
  ],
  entertainment: [
    "entertainment", "entertainment-other", "showtime", "glitz", "bollywood", "hollywood", "drama", "music",
    "binodon", "tp-anando-nagar", "culture", "celeb", "literature", "বিনোদন", "সাহিত্য", "গান", "নাটক", "চলচ্চিত্র", "সিনেমা",
  ],
  tech: [
    "tech", "technology", "tech-and-gadget", "information-technology", "science", "physics", "science-tech",
    "tech-other", "tech-socialmedia", "social-media",
    "প্রযুক্তি", "বিজ্ঞান", "তথ্যপ্রযুক্তি", "বিজ্ঞান-প্রযুক্তি",
  ],
  education: [
    "education", "educations", "education-news", "campus", "my-campus", "শিক্ষা", "ক্যাম্পাস",
  ],
  health: ["health", "health-news", "health-medical", "স্বাস্থ্য"],
  lifestyle: [
    "lifestyle", "life-living", "fashion", "travel", "travelandtourism", "journey", "food", "tp-suranjona",
    "religion", "islam", "জীবনযাপন", "লাইফস্টাইল", "ভ্রমণ", "ধর্ম", "ইসলাম", "দৈনন্দিন ইসলাম",
  ],
  crime: [
    "crime", "law-and-crime", "law-court", "law-courts", "law-and-justice-news", "court", "law-justice", "law-n-judiciary",
    "court-law", "law-and-court", "crime-justice", "অপরাধ", "আদালত", "আইন-আদালত", "আইন আদালত",
  ],
  opinion: [
    "opinion", "opinions", "op-ed", "views", "columns", "editorial", "thoughts", "analysis", "roundtable", "tp-editorial", "tp-ub-editorial", "চিন্তা",
    "মতামত", "কলাম", "সম্পাদকীয়", "অভিমত-মতামত",
  ],
};

const LOOKUP = new Map<string, Category>();
for (const [cat, words] of Object.entries(SYNONYMS) as [Category, string[]][]) {
  for (const w of words) LOOKUP.set(normalize(w), cat);
}

/**
 * Feeds spell some Bangla letters two ways: "য়" as one code point (U+09DF) or as য + nukta.
 * NFC turns both into the same form, so "জাতীয়" matches however it was typed.
 */
function normalize(word: string): string {
  return word.normalize("NFC").trim().toLowerCase();
}

function match(word: string): Category | undefined {
  return LOOKUP.get(normalize(word));
}

/** The words a category is picked from: the URL's path sections, then the feed's tags. */
function sectionWords(link: string, tags: string[]): string[] {
  let segments: string[] = [];
  try {
    segments = new URL(link).pathname.split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    // keep empty
  }
  // The last path segment is usually the article slug or id, not a section.
  return [...segments.slice(0, -1), ...tags];
}

/** Pick a main category from the article URL's path sections, then from feed tags. */
export function categorize(link: string, tags: string[] = []): Category {
  // "National" is often a parent (/bangladesh/politics/...), so a more specific match wins.
  let broad: Category | undefined;
  for (const word of sectionWords(link, tags)) {
    const c = match(word);
    if (c && c !== "national") return c;
    broad ??= c;
  }
  return broad ?? "other";
}

/**
 * For a headline that landed in "other": the section names it had, none of which are known (the
 * candidates for a new synonym above), or a note that it had none to go on.
 */
export function unmappedSection(link: string, tags: string[] = []): string {
  const words = sectionWords(link, tags).filter((w) => !/^\d+$/.test(w));
  return words.length ? words.slice(0, 2).join(" / ") : "(no section in URL or feed)";
}
