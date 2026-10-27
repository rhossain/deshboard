/**
 * The sections and their names. Sorting headlines into them (the portals' section names and the headline
 * keywords, a large table) is in categorize.ts, which only the fetch needs, so the browser never downloads it.
 */
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
