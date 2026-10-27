// Generated from the verified source list (5 Oct 2026). Edit freely.
// What each outlet is, for the pages and the browser; where and how the fetch reads it is in
// source-feeds.ts, which only the fetch loads (so the feed addresses and patterns stay out of the page bundle).
import type { NewsSource } from "./types";

const LISTED: NewsSource[] = [
  {id: "prothomalo", name: "Prothom Alo", lang: "bn", kind: "Newspaper", homepage: "https://www.prothomalo.com", method: "rss", notes: "Live RSS 2.0"},
  {id: "prothomalo-en", name: "Prothom Alo English", lang: "en", kind: "Newspaper", homepage: "https://en.prothomalo.com", method: "rss", notes: "Live but only ~2 items; poll often"},
  {id: "dailystar", name: "The Daily Star", lang: "en", kind: "Newspaper", homepage: "https://www.thedailystar.net", method: "html", notes: "/rss.xml stale (newest 1 Jun 2026); /frontpage/rss.xml stale (2022)"},
  {id: "dailystar-bn", name: "The Daily Star Bangla", lang: "bn", kind: "Newspaper", homepage: "https://bangla.thedailystar.net", method: "html", notes: "/rss.xml stale (Feb 2026)"},
  {id: "bdnews24-bn", name: "bdnews24 Bangla", lang: "bn", kind: "Online", homepage: "https://bangla.bdnews24.com", method: "html", notes: "Old widget RSS URL now returns homepage HTML"},
  {id: "bdnews24-en", name: "bdnews24 English", lang: "en", kind: "Online", homepage: "https://bdnews24.com", method: "html", notes: "Old widget RSS URL now returns homepage HTML"},
  {id: "dhakatribune", name: "Dhaka Tribune", lang: "en", kind: "Newspaper", homepage: "https://www.dhakatribune.com", method: "sitemap", notes: "Google News sitemap; /feed is 404"},
  {id: "banglatribune", name: "Bangla Tribune", lang: "bn", kind: "Online", homepage: "https://www.banglatribune.com", method: "sitemap", notes: "Google News sitemap; /feed/ is 404"},
  {id: "tbs", name: "The Business Standard", lang: "en", kind: "Newspaper", homepage: "https://www.tbsnews.net", method: "html", notes: "/rss.xml stale (2021); homepage also links TBS Bangla articles"},
  {id: "tbs-bn", name: "TBS Bangla", lang: "bn", kind: "Newspaper", homepage: "https://www.tbsnews.net/bangla", method: "html", notes: "/bangla/rss.xml stale (Oct 2025)"},
  {id: "jugantor", name: "Jugantor", lang: "bn", kind: "Newspaper", homepage: "https://www.jugantor.com", method: "sitemap", notes: "Underscore filename; found via /sitemap.xml"},
  {id: "kalerkantho", name: "Kaler Kantho", lang: "bn", kind: "Newspaper", homepage: "https://www.kalerkantho.com", method: "sitemap", notes: "One sitemap per day (index: /sitemap.xml); ~1 day lag"},
  {id: "samakal", name: "Samakal", lang: "bn", kind: "Newspaper", homepage: "https://samakal.com", method: "google-news", notes: "Homepage and RSS return 403; sitemap ~10 days old"},
  {id: "ittefaq", name: "Ittefaq", lang: "bn", kind: "Newspaper", homepage: "https://www.ittefaq.com.bd", method: "sitemap", notes: "Google News sitemap"},
  {id: "bd-pratidin", name: "Bangladesh Pratidin", lang: "bn", kind: "Newspaper", homepage: "https://www.bd-pratidin.com", method: "google-news", notes: "403 on every URL tested"},
  {id: "nayadiganta", name: "Naya Diganta", lang: "bn", kind: "Newspaper", homepage: "https://dailynayadiganta.com", method: "html", notes: "www host fails SSL; use bare domain"},
  {id: "mzamin", name: "Manab Zamin", lang: "bn", kind: "Newspaper", homepage: "https://www.mzamin.com", method: "html", notes: "No RSS (404)"},
  {id: "deshrupantor", name: "Desh Rupantor", lang: "bn", kind: "Newspaper", homepage: "https://www.deshrupantor.com", method: "sitemap", notes: "Google News sitemap"},
  {id: "kalbela", name: "Kalbela", lang: "bn", kind: "Newspaper", homepage: "https://www.kalbela.com", method: "html", notes: "RSS paths empty / 403"},
  {id: "ajkerpatrika", name: "Ajker Patrika", lang: "bn", kind: "Newspaper", homepage: "https://www.ajkerpatrika.com", method: "rss", notes: "Live RSS 2.0"},
  {id: "bonikbarta", name: "Bonik Barta", lang: "bn", kind: "Newspaper", homepage: "https://bonikbarta.com", method: "google-news", notes: "Daily sitemap has links but no titles; homepage JS-rendered"},
  {id: "janakantha", name: "Janakantha", lang: "bn", kind: "Newspaper", homepage: "https://www.dailyjanakantha.com", method: "unavailable", notes: "XML returns 403; homepage stale, no links"},
  {id: "inqilab", name: "Inqilab", lang: "bn", kind: "Newspaper", homepage: "https://dailyinqilab.com", method: "google-news", notes: "403; www host shows stale 2020 content"},
  {id: "bhorerkagoj", name: "Bhorer Kagoj", lang: "bn", kind: "Newspaper", homepage: "https://www.bhorerkagoj.net", method: "html", notes: "bhorerkagoj.com redirects to .net"},
  {id: "amadershomoy", name: "Amader Shomoy", lang: "bn", kind: "Newspaper", homepage: "https://www.dainikamadershomoy.com", method: "google-news", notes: "No feed/sitemap; homepage JS-rendered"},
  {id: "sangbad", name: "Sangbad", lang: "bn", kind: "Newspaper", homepage: "https://sangbad.net", method: "rss", notes: "sangbad.net.bd redirects here; small feed"},
  {id: "jagonews24", name: "Jago News 24", lang: "bn", kind: "Online", homepage: "https://www.jagonews24.com", method: "html", notes: "/rss/rss.xml is a soft 404"},
  {id: "dhakapost", name: "Dhaka Post", lang: "bn", kind: "Online", homepage: "https://www.dhakapost.com", method: "rss", notes: "Live RSS 2.0"},
  {id: "risingbd", name: "Rising BD", lang: "bn", kind: "Online", homepage: "https://www.risingbd.com", method: "rss", notes: "Live RSS 2.0"},
  {id: "banglanews24", name: "Banglanews24", lang: "bn", kind: "Online", homepage: "https://www.banglanews24.com", method: "google-news", notes: "HTTP 402 on everything (bot blocking)"},
  {id: "daily-bangladesh", name: "Daily Bangladesh", lang: "bn", kind: "Online", homepage: "https://www.daily-bangladesh.com", method: "rss", notes: "/rss/rss.xml is 404"},
  {id: "sarabangla", name: "Sarabangla", lang: "bn", kind: "Online", homepage: "https://sarabangla.net", method: "rss", notes: "Live RSS 2.0"},
  {id: "barta24", name: "Barta24", lang: "bn", kind: "Online", homepage: "https://barta24.com", method: "rss", notes: "Contains duplicates; dedupe by link"},
  {id: "dhakatimes24", name: "Dhaka Times 24", lang: "bn", kind: "Online", homepage: "https://www.dhakatimes24.com", method: "html", notes: "RSS paths return homepage (soft 404)"},
  {id: "banglainsider", name: "Bangla Insider", lang: "bn", kind: "Online", homepage: "https://www.banglainsider.com", method: "unavailable", notes: "robots.txt disallows automated fetchers"},
  {id: "ekushey-tv", name: "Ekushey TV", lang: "bn", kind: "TV", homepage: "https://www.ekushey-tv.com", method: "rss", notes: "Live RSS 2.0"},
  {id: "somoynews", name: "Somoy News", lang: "bn", kind: "TV", homepage: "https://www.somoynews.tv", method: "unavailable", notes: "Site under maintenance (live stream only)"},
  {id: "jamuna", name: "Jamuna TV", lang: "bn", kind: "TV", homepage: "https://www.jamuna.tv", method: "sitemap", notes: "Homepage 403; sitemap works"},
  {id: "channeli", name: "Channel i Online", lang: "bn", kind: "TV", homepage: "https://www.channelionline.com", method: "rss", notes: "WordPress RSS"},
  {id: "ntv", name: "NTV", lang: "bn", kind: "TV", homepage: "https://www.ntvbd.com", method: "html", notes: "No RSS; plain sitemaps without titles"},
  {id: "rtv", name: "RTV Online", lang: "bn", kind: "TV", homepage: "https://www.rtvonline.com", method: "html", notes: "No RSS or news sitemap"},
  {id: "ekattor", name: "Ekattor TV", lang: "bn", kind: "TV", homepage: "https://ekattor.tv", method: "sitemap", notes: "Google News sitemap"},
  {id: "channel24", name: "Channel 24", lang: "bn", kind: "TV", homepage: "https://www.channel24bd.tv", method: "sitemap", notes: "Homepage JS-rendered; sitemap only"},
  {id: "itv", name: "Independent TV", lang: "bn", kind: "TV", homepage: "https://www.itvbd.com", method: "sitemap", notes: "Google News sitemap"},
  {id: "dbc", name: "DBC News", lang: "bn", kind: "TV", homepage: "https://dbcnews.tv", method: "google-news", notes: "News sitemap listed but 404; homepage stale"},
  {id: "banglavision", name: "Bangla Vision", lang: "bn", kind: "TV", homepage: "https://www.bvnews24.com", method: "rss", notes: "banglavision.tv redirects to bvnews24.com"},
  {id: "shomoyeralo", name: "Shomoyer Alo", lang: "bn", kind: "Newspaper", homepage: "https://www.shomoyeralo.com", method: "html", notes: "No RSS"},
  {id: "alokito", name: "Alokito Bangladesh", lang: "bn", kind: "Newspaper", homepage: "https://www.alokitobangladesh.com", method: "rss", notes: "Live RSS 2.0"},
  {id: "financialexpress", name: "The Financial Express", lang: "en", kind: "Newspaper", homepage: "https://thefinancialexpress.com.bd", method: "html", notes: "RSS paths return HTML"},
  {id: "newage", name: "New Age", lang: "en", kind: "Newspaper", homepage: "https://www.newagebd.net", method: "google-news", notes: "403 on every URL tested"},
  {id: "dailysun", name: "Daily Sun", lang: "en", kind: "Newspaper", homepage: "https://www.daily-sun.com", method: "sitemap", notes: "Underscore filename"},
  {id: "observerbd", name: "Daily Observer", lang: "en", kind: "Newspaper", homepage: "https://www.observerbd.com", method: "rss", notes: "Live RSS"},
  {id: "bangladeshpost", name: "Bangladesh Post", lang: "en", kind: "Newspaper", homepage: "https://bangladeshpost.net", method: "google-news", notes: "Connection timeouts"},
  {id: "asianage", name: "The Asian Age (BD)", lang: "en", kind: "Newspaper", homepage: "https://dailyasianage.com", method: "html", notes: "/rss is valid but empty"},
  {id: "dailymessenger", name: "The Daily Messenger", lang: "bn", kind: "Newspaper", homepage: "https://www.dailymessenger.net", method: "unclear", notes: "Feed stale since May 2025; site may be inactive"},
  {id: "unb", name: "UNB", lang: "en", kind: "Agency", homepage: "https://unb.com.bd", method: "html", notes: "Footer RSS link is 404"},
  {id: "bss-bn", name: "BSS Bangla", lang: "bn", kind: "Agency", homepage: "https://www.bssnews.net/bangla", method: "google-news", notes: "/bangla/rss redirect loop; no links extracted"},
  {id: "bss", name: "BSS English", lang: "en", kind: "Agency", homepage: "https://www.bssnews.net", method: "html", notes: "/rss redirect loop"},
  {id: "bonikbarta-en", name: "Bonik Barta English", lang: "en", kind: "Newspaper", homepage: "https://en.bonikbarta.com", method: "google-news", notes: "Daily sitemap has links but no titles"},
  {id: "protidinersangbad", name: "Protidiner Sangbad", lang: "bn", kind: "Newspaper", homepage: "https://www.protidinersangbad.com", method: "html", notes: "No RSS"},
  {id: "kholakagoj", name: "Khola Kagoj", lang: "bn", kind: "Newspaper", homepage: "https://www.kholakagojbd.com", method: "rss", notes: "/rss.xml is 404; /rss works"},
  {id: "shokalerkhobor", name: "Shokaler Khobor", lang: "bn", kind: "Newspaper", homepage: "https://www.shokalerkhobor.com", method: "unavailable", notes: "DNS failure / HTTP 445; domain may have changed"},
  {id: "amardesh", name: "Amar Desh", lang: "bn", kind: "Newspaper", homepage: "https://www.dailyamardesh.com", method: "rss", notes: "Live RSS 2.0"},
  {id: "dhakatribune-bn", name: "Dhaka Tribune Bangla", lang: "bn", kind: "Newspaper", homepage: "https://bangla.dhakatribune.com", method: "sitemap", notes: "Google News sitemap"},
];

/**
 * Shown (and fetched) first, in this order. Everything else follows in list order. The first six are
 * Bangla papers, so the board opens on Bangla news (NewsBoard keeps six Bangla cards first even when
 * one of these fails); the English editions follow them.
 */
const PRIORITY = [
  "prothomalo", "dailystar-bn", "jugantor", "kalerkantho", "mzamin", "ittefaq",
  "prothomalo-en", "dailystar", "dailysun", "observerbd",
  "banglanews24", "kalbela",
  "amadershomoy", "amardesh", "bd-pratidin", "nayadiganta", "bonikbarta", "bhorerkagoj", "inqilab",
  "deshrupantor", "sarabangla", "somoynews",
];

function rank(id: string) {
  const i = PRIORITY.indexOf(id);
  return i === -1 ? PRIORITY.length : i;
}

// Array.prototype.sort is stable, so sources outside PRIORITY keep their list order.
export const SOURCES: NewsSource[] = [...LISTED].sort((a, b) => rank(a.id) - rank(b.id));

/** Sources with method `unclear` / `unavailable` are listed but never fetched. */
export function isFetched(s: NewsSource): boolean {
  return s.method === "rss" || s.method === "sitemap" || s.method === "html" || s.method === "google-news";
}

export const ACTIVE_SOURCES = SOURCES.filter(isFetched);

export function getSource(id: string) {
  return SOURCES.find((s) => s.id === id);
}
