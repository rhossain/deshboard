// Where and how the fetch reads each outlet (src/lib/news.ts): the feed, sitemap or page address and, for
// pages, the pattern an article link matches. Kept apart from sources.ts, which every page and the browser
// load: this file is only for the fetch. `{YYYY-MM-DD}` in a URL is replaced with the current date in Asia/Dhaka.
import type { NewsSource, SourceFeed } from "./types";

const FEEDS: Record<string, SourceFeed> = {
  "prothomalo": {url: "https://www.prothomalo.com/feed/"},
  "prothomalo-en": {url: "https://en.prothomalo.com/feed/"},
  "dailystar": {url: "https://www.thedailystar.net/", articlePattern: "/news/.+-\\d{5,}$"},
  "dailystar-bn": {url: "https://bangla.thedailystar.net/", articlePattern: "/news-\\d{5,}$"},
  "bdnews24-bn": {url: "https://bangla.bdnews24.com/", articlePattern: "^/[a-z-]+/[a-z0-9]{8,12}$"},
  "bdnews24-en": {url: "https://bdnews24.com/", articlePattern: "^/[a-z-]+/[a-z0-9]{8,12}$"},
  "dhakatribune": {url: "https://www.dhakatribune.com/news-sitemap.xml"},
  "banglatribune": {url: "https://www.banglatribune.com/news-sitemap.xml"},
  "tbs": {url: "https://www.tbsnews.net/", articlePattern: "^/(?!bangla/)[a-z-]+/.+-\\d{5,}$"},
  "tbs-bn": {url: "https://www.tbsnews.net/bangla", articlePattern: "^/bangla/.+-\\d{5,}$"},
  "jugantor": {url: "https://www.jugantor.com/news_sitemap.xml"},
  "kalerkantho": {url: "https://www.kalerkantho.com/daily-sitemap/{YYYY-MM-DD}/sitemap.xml"},
  "ittefaq": {url: "https://www.ittefaq.com.bd/news-sitemap.xml"},
  "nayadiganta": {url: "https://dailynayadiganta.com/", articlePattern: "^/post/[a-z-]+/\\d+"},
  "mzamin": {url: "https://www.mzamin.com/", articlePattern: "^/article/\\d+"},
  "deshrupantor": {url: "https://www.deshrupantor.com/news-sitemap.xml"},
  "kalbela": {url: "https://www.kalbela.com/", articlePattern: "^/[a-z-]+(/[a-z-]+)?/\\d{4,}$"},
  "ajkerpatrika": {url: "https://www.ajkerpatrika.com/feed"},
  "bhorerkagoj": {url: "https://www.bhorerkagoj.net/", articlePattern: "^/[a-z-]+/\\d{5,}"},
  "sangbad": {url: "https://sangbad.net/rss.xml"},
  "jagonews24": {url: "https://www.jagonews24.com/", articlePattern: "/news/\\d+"},
  "dhakapost": {url: "https://www.dhakapost.com/rss/rss.xml"},
  "risingbd": {url: "https://www.risingbd.com/rss/rss.xml"},
  "daily-bangladesh": {url: "https://www.daily-bangladesh.com/rss.xml", dhakaTimeAsUtc: true},
  "sarabangla": {url: "https://sarabangla.net/feed/"},
  "barta24": {url: "https://barta24.com/rss/rss.xml"},
  "dhakatimes24": {url: "https://www.dhakatimes24.com/", articlePattern: "^/\\d{4}/\\d{2}/\\d{2}/\\d+"},
  "ekushey-tv": {url: "https://www.ekushey-tv.com/rss/rss.xml"},
  "jamuna": {url: "https://www.jamuna.tv/news_sitemap.xml"},
  "channeli": {url: "https://www.channelionline.com/feed/"},
  "ntv": {url: "https://www.ntvbd.com/", articlePattern: "/news-\\d+$"},
  "rtv": {url: "https://www.rtvonline.com/", articlePattern: "^/[a-z-]+/\\d{5,}"},
  "ekattor": {url: "https://ekattor.tv/news-sitemap.xml"},
  "channel24": {url: "https://www.channel24bd.tv/news-sitemap.xml"},
  "itv": {url: "https://www.itvbd.com/news-sitemap.xml"},
  "banglavision": {url: "https://www.bvnews24.com/rss/rss.xml"},
  "shomoyeralo": {url: "https://www.shomoyeralo.com/", articlePattern: "^/news/\\d+"},
  "alokito": {url: "https://www.alokitobangladesh.com/rss/rss.xml"},
  "financialexpress": {url: "https://thefinancialexpress.com.bd/", articlePattern: "^/[a-z-]+/[a-z0-9-]{20,}$"},
  "dailysun": {url: "https://www.daily-sun.com/news_sitemap.xml"},
  "observerbd": {url: "https://www.observerbd.com/rss.php", dhakaTimeAsUtc: true},
  "asianage": {url: "https://dailyasianage.com/", articlePattern: "^/news/\\d+/"},
  "dailymessenger": {url: "https://www.dailymessenger.net/rss/rss.xml"},
  "unb": {url: "https://unb.com.bd/", articlePattern: "^/category/[^/]+/[^/]+/\\d+$"},
  "bss": {url: "https://www.bssnews.net/", articlePattern: "^/news/\\d+$"},
  "protidinersangbad": {url: "https://www.protidinersangbad.com/", articlePattern: "^/[a-z-]+/\\d{5,}"},
  "kholakagoj": {url: "https://www.kholakagojbd.com/rss", dhakaTimeAsUtc: true},
  "amardesh": {url: "https://www.dailyamardesh.com/feed"},
  "dhakatribune-bn": {url: "https://bangla.dhakatribune.com/news-sitemap.xml"},
};

/** Where to read `source`, or an empty feed for outlets read through Google News or not read at all. */
export function feedOf(source: NewsSource): SourceFeed {
  return FEEDS[source.id] ?? {};
}
