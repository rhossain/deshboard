/**
 * Offline tests for the parsers (no network needed): npm test
 */
import "./test-env";
import assert from "node:assert/strict";
import { categorize } from "../src/lib/categories";
import { extractHeadlines } from "../src/lib/fetchers/html";
import { parseFeed } from "../src/lib/fetchers/rss";
import { parseNewsSitemap } from "../src/lib/fetchers/sitemap";
import { cleanVideoTitle, parseYouTubeFeed } from "../src/lib/fetchers/youtube";
import {
  articleSignature,
  googleNewsFeedUrl,
  looksLikeArticle,
  parseGoogleNewsFeed,
  parseResolvedUrl,
  siteHost,
} from "../src/lib/fetchers/google-news";
import { fullTime, timeAgo } from "../src/components/time";
import { articleUrl } from "../src/lib/article";
import { cleanTitle, dedupeByLink, parseDate, resolveUrl, shiftDhakaAsUtc } from "../src/lib/fetchers/utils";
import { DEFAULT_FILTERS, filtersToSearch, parseFilters } from "../src/lib/filters";
import { stampFirstSeen } from "../src/lib/first-seen";
import { findLogoCandidates } from "../src/lib/logos";
import { newsQueryFrom } from "../src/lib/news";
import { fallbackNote, sourceProblem } from "../src/lib/problems";
import { SHARE_TARGETS, sharePath } from "../src/lib/share";
import { findStories, keywords } from "../src/lib/stories";
import type { NewsItem, NewsSource, SourceStatus, Video } from "../src/lib/types";
import { mergeVideos } from "../src/lib/videos";

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}\n`, err);
    process.exitCode = 1;
  }
}

test("RSS 2.0 with CDATA and Bangla titles", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <rss version="2.0"><channel><title>Prothom Alo</title>
    <item><title><![CDATA[অসুস্থ হয়ে আরেক কারাবন্দীর মৃত্যু]]></title>
      <link>https://www.prothomalo.com/bangladesh/capital/se83mmzf6z</link>
      <pubDate>Sun, 04 Oct 2026 18:15:02 GMT</pubDate></item>
    <item><title>Second &amp; item</title><guid isPermaLink="true">https://example.com/a/2</guid></item>
  </channel></rss>`;
  const items = parseFeed(xml, "https://www.prothomalo.com/feed/");
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "অসুস্থ হয়ে আরেক কারাবন্দীর মৃত্যু");
  assert.equal(items[0].publishedAt, "2026-10-04T18:15:02.000Z");
  assert.equal(items[1].title, "Second & item");
  assert.equal(items[1].link, "https://example.com/a/2");
});

test("Atom feed", () => {
  const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
    <entry><title>Atom title here</title><link rel="alternate" href="/news/1"/><updated>2026-10-04T10:00:00Z</updated></entry>
  </feed>`;
  const items = parseFeed(xml, "https://site.test/feed");
  assert.deepEqual(items, [
    { title: "Atom title here", link: "https://site.test/news/1", publishedAt: "2026-10-04T10:00:00.000Z" },
  ]);
});

test("HTML soft-404 is rejected as a feed", () => {
  assert.throws(() => parseFeed("<!DOCTYPE html><html><body>Not found</body></html>", "https://x.test"), /not XML/);
});

test("Google News sitemap", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
    <url><loc>https://www.jugantor.com/national/1163658</loc>
      <news:news><news:publication><news:name>Jugantor</news:name><news:language>bn</news:language></news:publication>
      <news:publication_date>2026-10-04T01:02:14+06:00</news:publication_date>
      <news:title>'বাংলাদেশ পর্যটন পুরস্কার ২০২৬' পেলেন সাংবাদিক নাঈম আবির</news:title></news:news></url>
    <url><loc>https://www.jugantor.com/country-news/1163659</loc>
      <news:news><news:publication_date>2026-10-04T01:32:47+06:00</news:publication_date>
      <news:title>চুরির অভিযোগে কিশোরকে হাত বেঁধে মারধর</news:title></news:news></url>
  </urlset>`;
  const items = parseNewsSitemap(xml, "https://www.jugantor.com/news_sitemap.xml");
  assert.equal(items.length, 2);
  assert.equal(items[0].link, "https://www.jugantor.com/country-news/1163659"); // newest first
  assert.equal(items[1].title, "'বাংলাদেশ পর্যটন পুরস্কার ২০২৬' পেলেন সাংবাদিক নাঈম আবির");
});

test("Plain sitemap without titles is reported", () => {
  const xml = `<?xml version="1.0"?><urlset><url><loc>https://x.test/a/1</loc></url></urlset>`;
  assert.throws(() => parseNewsSitemap(xml, "https://x.test"), /no news:title/);
});

test("Date formats seen on BD feeds", () => {
  assert.equal(parseDate("2026-10-04 22:39:44 GMT+6"), "2026-10-04T16:39:44.000Z");
  assert.equal(parseDate("2026-10-04 22:00:00"), "2026-10-04T16:00:00.000Z");
  assert.equal(parseDate("Sun, 04 Oct 2026 23:43:43 +06"), "2026-10-04T17:43:43.000Z");
  assert.equal(parseDate("2026-10-05T00:11:06+06:00"), "2026-10-04T18:11:06.000Z");
  assert.equal(parseDate("not a date"), undefined);
});

test("Dhaka time mislabelled as UTC is shifted back 6 hours", () => {
  assert.equal(shiftDhakaAsUtc(parseDate("Mon, 05 Oct 2026 11:14:00 +0000")), "2026-10-05T05:14:00.000Z");
  assert.equal(shiftDhakaAsUtc(parseDate("Mon, 05 Oct 2026 10:59:01 UTC")), "2026-10-05T04:59:01.000Z");
  assert.equal(shiftDhakaAsUtc(undefined), undefined);
});

test("HTML headline extraction keeps best text and page order", () => {
  const html = `<html><body>
    <a href="/article/101"><img src="x.jpg" alt="Image alt text for story"></a>
    <a href="/article/101"><h3>নিরাপত্তা চৌহদ্দি, তবুও অপরাধ বাড়ছে গুলশানে</h3></a>
    <a href="https://www.mzamin.com/article/102">দ্বিতীয় খবরের শিরোনাম এখানে</a>
    <a href="/article/103">বিস্তারিত</a>
    <a href="/category/national">জাতীয় সংবাদ বিভাগ পাতা</a>
    <a href="https://other.site/article/104">Off-site link should be ignored</a>
  </body></html>`;
  const items = extractHeadlines(html, "https://mzamin.com/", "^/article/\\d+");
  assert.deepEqual(
    items.map((i) => [i.title, i.link]),
    [
      ["নিরাপত্তা চৌহদ্দি, তবুও অপরাধ বাড়ছে গুলশানে", "https://mzamin.com/article/101"],
      ["দ্বিতীয় খবরের শিরোনাম এখানে", "https://www.mzamin.com/article/102"],
    ],
  );
});

test("HTML: hidden headings, timestamps and overlay links", () => {
  const html = `<html><body>
    <a href="/education/news/1"><h1 style="display:none">jagonews24</h1><h2> শিক্ষাপ্রতিষ্ঠান জাতীয়করণে নীতিমালা</h2></a>
    <a href="/campus/news/2"><h3>রাজশাহী বিশ্ববিদ্যালয়ে হামলা, আহত ১০<time>২ ঘণ্টা আগে</time></h3></a>
    <a href="/campus/news/3">দ্বিতীয় শিরোনাম, আহত ৫<span class="time-ago">২ ঘণ্টা আগে</span></a>
    <div class="card"><a href="/national/801407"></a><img src="x.jpg"><h3>প্রতিটি সিটি করপোরেশনে মাস্টারপ্ল্যান</h3></div>
  </body></html>`;
  const items = extractHeadlines(html, "https://www.site.test/", "^/[a-z-]+/(news/)?\\d+$");
  assert.deepEqual(
    items.map((i) => i.title),
    [
      "শিক্ষাপ্রতিষ্ঠান জাতীয়করণে নীতিমালা",
      "রাজশাহী বিশ্ববিদ্যালয়ে হামলা, আহত ১০",
      "দ্বিতীয় শিরোনাম, আহত ৫",
      "প্রতিটি সিটি করপোরেশনে মাস্টারপ্ল্যান",
    ],
  );
});

test("Categories from URL sections and feed tags", () => {
  assert.equal(categorize("https://barta24.com/details/politics/341351"), "politics");
  assert.equal(categorize("https://unb.com.bd/category/World/imran-khan-march/197027"), "international");
  assert.equal(categorize("https://www.tbsnews.net/bangla/Economy/news-details-547781"), "business");
  assert.equal(categorize("https://www.thedailystar.net/sports/more-sports/news/bigger-4290671"), "sports");
  // A specific section beats the broad "national" parent
  assert.equal(categorize("https://www.dhakatribune.com/bangladesh/politics/123456"), "politics");
  assert.equal(categorize("https://www.prothomalo.com/bangladesh/capital/se83mmzf6z"), "national");
  // The article slug is never treated as a section
  assert.equal(categorize("https://example.com/news/sports"), "other");
  // Bangla sitemap keywords
  assert.equal(categorize("https://www.ittefaq.com.bd/813209/রোনালদো", ["খেলা", "রোনালদো", "ফুটবল"]), "sports");
  assert.equal(categorize("https://www.ittefaq.com.bd/1/x", ["বিশ্ব সংবাদ", "বাংলাদেশ"]), "international");
  assert.equal(categorize("https://www.deshrupantor.com/1/x", ["আজকের পত্রিকা", "দেশ"]), "national");
  assert.equal(categorize("https://www.mzamin.com/article/47008"), "other");
});

test("Logo candidates: header logo first, social icons and parking pages skipped", () => {
  const html = `<html><head>
    <link rel="icon" href="/favicon.ico">
    <script type="application/ld+json">{"@type":"NewsMediaOrganization","logo":{"@type":"ImageObject","url":"/ld-logo.png"}}</script>
  </head><body>
    <header><a href="/" class="site-logo"><img data-src="/img/logo.svg" src="data:image/gif;base64,R0lGOD"></a>
      <a href="https://facebook.com/x"><img src="/icons/facebook-logo.svg"></a></header>
    <img src="https://img.sedoparking.com/logo.png" alt="logo">
    <footer><img src="/img/footer-logo.png"></footer>
  </body></html>`;
  const urls = findLogoCandidates(html, "https://www.site.test/");
  assert.equal(urls[0], "https://www.site.test/img/logo.svg");
  assert.equal(urls[1], "https://www.site.test/ld-logo.png");
  assert.ok(!urls.some((u) => u.includes("facebook")));
  assert.ok(!urls.some((u) => u.includes("sedoparking")));
});

function item(sourceId: string, title: string, extra: Partial<NewsItem> = {}): NewsItem {
  return {
    title,
    link: `https://${sourceId}.test/${encodeURIComponent(title)}`,
    sourceId,
    sourceName: sourceId,
    lang: /[a-z]/i.test(title) ? "en" : "bn",
    category: "other",
    ...extra,
  };
}

test("keywords: Bangla suffixes, digits and stopwords", () => {
  assert.deepEqual(keywords("ঢাকার পুলিশের ২৪ কর্মকর্তাকে বদলি"), ["পুলিশ", "24", "কর্মকর্তা", "বদলি"]);
  assert.deepEqual(keywords("PM's visit: Tarique meets envoys"), ["pm", "visit", "tarique", "meet", "envoy"]);
});

test("stories: groups the same event across outlets, keeps others apart", () => {
  // Filler, so the event words are rare enough to carry weight.
  const filler = Array.from({ length: 200 }, (_, i) => item(`f${i % 9}`, `filler story number ${i} about topic ${i}`));
  const items = [
    ...filler,
    item("a", "পুলিশের ঊর্ধ্বতন ২৪ কর্মকর্তার রদবদল"),
    item("b", "তিন ডিআইজিসহ পুলিশের ২৪ ঊর্ধ্বতন কর্মকর্তাকে বদলি"),
    item("c", "পুলিশের ২৪ ঊর্ধ্বতন কর্মকর্তা বদলি"),
    item("a", "বিশ্ব বসতি দিবসের অনুষ্ঠানে প্রধানমন্ত্রী"),
    item("b", "বিশ্ব বসতি দিবসের আলোচনা সভায় প্রধানমন্ত্রী"),
    item("c", "বিশ্ব শিক্ষক দিবস আজ"),
    item("d", "আজ বিশ্ব শিক্ষক দিবস, সম্মাননা পাচ্ছেন শিক্ষকরা"),
  ];
  const stories = findStories(items);
  const police = stories.find((s) => s.lead.title.includes("পুলিশ"));
  assert.equal(police?.outlets, 3);
  const habitat = stories.find((s) => s.items.some((it) => it.title.includes("বসতি")));
  const teachers = stories.find((s) => s.items.some((it) => it.title.includes("শিক্ষক")));
  assert.ok(habitat && teachers && habitat !== teachers, "two different days stay two stories");
  assert.ok(!habitat.items.some((it) => it.title.includes("শিক্ষক")));
});

test("stories: one headline per outlet, old headlines left out", () => {
  const now = Date.parse("2026-10-05T12:00:00Z");
  const old = new Date(now - 3 * 86400_000).toISOString();
  const filler = Array.from({ length: 100 }, (_, i) => item(`f${i % 9}`, `filler story number ${i} about topic ${i}`));
  const stories = findStories(
    [
      ...filler,
      item("a", "Messi trains with Argentina squad in Miami"),
      item("a", "Messi trains with Argentina squad in Miami ahead of final"),
      item("b", "Messi trains with Argentina squad in Miami"),
      item("c", "Messi trains with Argentina squad in Miami", { publishedAt: old }),
    ],
    { now },
  );
  assert.equal(stories.length, 1);
  assert.equal(stories[0].outlets, 2);
  assert.equal(stories[0].items.length, 2);
});

test("first seen: none on a source's first fetch, then stamped once", () => {
  const first = [item("home", "Old headline")];
  stampFirstSeen("home", first, Date.parse("2026-10-05T10:00:00Z"));
  assert.equal(first[0].seenAt, undefined);

  const second = [
    item("home", "Old headline"),
    item("home", "Fresh headline"),
    item("home", "Dated", { publishedAt: "2026-10-05T09:00:00Z" }),
  ];
  stampFirstSeen("home", second, Date.parse("2026-10-05T10:10:00Z"));
  assert.equal(second[0].seenAt, undefined);
  assert.equal(second[1].seenAt, "2026-10-05T10:10:00.000Z");
  assert.equal(second[2].seenAt, undefined);

  const third = [item("home", "Fresh headline")];
  stampFirstSeen("home", third, Date.parse("2026-10-05T10:20:00Z"));
  assert.equal(third[0].seenAt, "2026-10-05T10:10:00.000Z");
});

test("categorize: Bangla spelled with a precomposed য় still matches", () => {
  assert.equal(categorize("https://www.ittefaq.com.bd/813243/slug", ["\u099c\u09be\u09a4\u09c0\u09df"]), "national");
  assert.equal(categorize("https://www.ittefaq.com.bd/1/slug", ["জাতীয়", "আইন আদালত"]), "crime");
});

test("filters: URL round trip, unknown values ignored", () => {
  const ids = new Set(["prothomalo"]);
  const f = parseFilters({ view: "latest", lang: "bn", source: "prothomalo", cat: "sports", q: " হামলা " }, ids);
  assert.deepEqual(f, {
    view: "latest",
    lang: "bn",
    source: "prothomalo",
    category: "sports",
    query: "হামলা",
    order: "default",
  });
  assert.deepEqual(parseFilters(Object.fromEntries(new URLSearchParams(filtersToSearch(f))), ids), f);
  assert.deepEqual(
    parseFilters({ view: "x", lang: "fr", source: "nope", cat: "x", order: "oldest" }, ids),
    DEFAULT_FILTERS,
  );
  assert.equal(filtersToSearch(DEFAULT_FILTERS), "");
});

test("share: path round trip, most specific outlet wins", () => {
  const segs = (link: string) => sharePath(link).slice("/s/".length).split("/");
  assert.equal(sharePath("https://www.prothomalo.com/bangladesh/abc"), "/s/www.prothomalo.com/bangladesh/abc");

  const pa = articleUrl(segs("https://www.prothomalo.com/bangladesh/abc"));
  assert.equal(pa?.source.id, "prothomalo");
  assert.equal(pa?.url.href, "https://www.prothomalo.com/bangladesh/abc");
  assert.equal(articleUrl(segs("https://prothomalo.com/x"))?.source.id, "prothomalo");
  assert.equal(articleUrl(segs("https://bangla.thedailystar.net/news-123456"))?.source.id, "dailystar-bn");
  assert.equal(articleUrl(segs("https://www.tbsnews.net/bangla/x-123456"))?.source.id, "tbs-bn");
  assert.equal(articleUrl(segs("https://www.tbsnews.net/economy/x-123456"))?.source.id, "tbs");
  assert.equal(articleUrl(segs("https://www.tbsnews.net/banglax/1"))?.source.id, "tbs");
});

test("share: links to other sites are refused", () => {
  for (const path of [
    "evil.test/x",
    "prothomalo.com.evil.test/x",
    "evilprothomalo.com/x",
    "www.prothomalo.com@evil.test/x",
    "evil.test/www.prothomalo.com/x",
    "",
  ]) {
    assert.equal(articleUrl(path ? path.split("/") : []), null, path);
  }
});

test("share targets put the link and title in the URL", () => {
  const url = "https://deshboard.test/s/www.prothomalo.com/a?b=1&c";
  for (const t of SHARE_TARGETS) {
    const href = t.href(url, "শিরোনাম & title");
    assert.ok(href.startsWith("https://"), t.id);
    assert.ok(href.includes(encodeURIComponent(url)), t.id);
  }
  const wa = SHARE_TARGETS.find((t) => t.id === "whatsapp")!;
  assert.equal(new URL(wa.href(url, "Title")).searchParams.get("text"), `Title\n${url}`);
});

test("news query from the request URL", () => {
  assert.deepEqual(newsQueryFrom("http://x.test/api/news"), { lang: undefined, sourceIds: undefined, force: false });
  assert.deepEqual(newsQueryFrom("http://x.test/api/news?lang=bn&source=a,%20b,,&refresh=1"), {
    lang: "bn",
    sourceIds: ["a", "b"],
    force: true,
  });
  assert.equal(newsQueryFrom("http://x.test/?lang=fr").lang, undefined);
  assert.equal(newsQueryFrom("http://x.test/?refresh=true").force, false);
});

test("source problems explain the technical reason", () => {
  const source = (over: Partial<NewsSource>): NewsSource => ({
    id: "s",
    name: "S",
    lang: "en",
    kind: "Online",
    homepage: "https://s.test",
    method: "rss",
    url: "https://s.test/feed",
    ...over,
  });
  const fine = source({});
  assert.equal(sourceProblem(fine), undefined);
  assert.equal(sourceProblem(fine, { sourceId: "s", ok: true } as SourceStatus), undefined);

  const blocked = sourceProblem(source({ method: "unavailable", url: undefined, notes: "HTTP 402 on everything (bot blocking)" }));
  assert.match(blocked!.message, /^Not available\. The site is blocking automated access/);
  assert.equal(blocked!.detail, "HTTP 402 on everything (bot blocking)");

  const failed = (error: string) => sourceProblem(fine, { sourceId: "s", ok: false, error } as SourceStatus)!.message;
  assert.match(failed("getaddrinfo ENOTFOUND s.test"), /could not be reached; its address/);
  assert.match(failed("HTTP 429"), /limiting requests/);
  assert.match(failed("HTTP 503"), /having problems/);
  assert.match(failed("Timed out after 15000ms"), /too long/);
  assert.match(failed("something odd"), /^Couldn't load headlines\. The site returned an unexpected response\.$/);
});

test("timeAgo: past, future and missing times", () => {
  const now = Date.parse("2026-10-05T12:00:00Z");
  const ago = (s: number) => timeAgo(new Date(now - s * 1000).toISOString(), now);
  assert.equal(timeAgo(undefined, now), "");
  assert.equal(ago(30), "just now");
  assert.equal(ago(-30), "just now");
  assert.equal(ago(5 * 60), "5 minutes ago");
  assert.equal(ago(3 * 3600), "3 hours ago");
  assert.equal(ago(26 * 3600), "yesterday");
  assert.equal(ago(-2 * 3600), "in 2 hours");
  assert.equal(fullTime("2026-10-05T12:00:00Z"), "5 Oct 2026, 18:00");
});

test("utils: titles, URLs and dedupe", () => {
  assert.equal(cleanTitle("<![CDATA[ <b>Rain</b>&nbsp;&amp; floods&#39; toll ]]>"), "Rain & floods' toll");
  assert.equal(cleanTitle({ "#text": "  a\n b " }), "a b");
  assert.equal(resolveUrl("/news/1#top", "https://site.test/home"), "https://site.test/news/1");
  assert.equal(resolveUrl("javascript:alert(1)", "https://site.test"), undefined);
  assert.equal(resolveUrl("mailto:a@b.test", "https://site.test"), undefined);

  const deduped = dedupeByLink([
    { link: "https://www.tbsnews.net/bangla/x-1", sourceId: "tbs" },
    { link: "http://tbsnews.net/bangla/x-1/", sourceId: "tbs-bn" },
    { link: "https://www.tbsnews.net/bangla/x-2", sourceId: "tbs-bn" },
  ]);
  assert.deepEqual(
    deduped.map((d) => d.sourceId),
    ["tbs", "tbs-bn"],
  );
});

test("YouTube feed: videos with views, Shorts left out", () => {
  const entry = (id: string, title: string, path: string, views: string) => `
    <entry><id>yt:video:${id}</id><yt:videoId>${id}</yt:videoId><title>${title}</title>
      <link rel="alternate" href="https://www.youtube.com/${path}"/>
      <published>2026-10-07T10:16:50+00:00</published>
      <media:group><media:community><media:statistics views="${views}"/></media:community></media:group></entry>`;
  const xml = `<?xml version="1.0"?><feed xmlns:yt="http://www.youtube.com/xml/schemas/2015"
    xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom"><title>Jamuna TV</title>
    ${entry("a1", "ডেঙ্গু পরিস্থিতি | Health | Jamuna TV", "watch?v=a1", "1520")}
    ${entry("s1", "শর্টস ভিডিও", "shorts/s1", "90")}
    ${entry("s2", "রেকর্ড ডাইভ #cyprusdive #shorts", "watch?v=s2", "90")}
    ${entry("b2", "Live bulletin", "watch?v=b2", "0")}
  </feed>`;
  assert.deepEqual(parseYouTubeFeed(xml), [
    { id: "a1", title: "ডেঙ্গু পরিস্থিতি", publishedAt: "2026-10-07T10:16:50.000Z", views: 1520 },
    { id: "b2", title: "bulletin", publishedAt: "2026-10-07T10:16:50.000Z" },
  ]);
  assert.throws(() => parseYouTubeFeed("<!DOCTYPE html><html></html>"), /not XML/);
});

test("Video titles keep their Bangla parts", () => {
  const cases: [string, string][] = [
    ["🛑 LIVE: একনজরে বিশ্বের আলোচিত সব খবর | Jamuna i-Desk | 07 October 2026 | Jamuna TV", "একনজরে বিশ্বের আলোচিত সব খবর"],
    ["প্রকাশ্যে চাঞ্চল্যকর তথ্য, মাটিতে মিশে গেছে যুক্তরাষ্ট্রের অহংকার। American Aircraft। ATN News", "প্রকাশ্যে চাঞ্চল্যকর তথ্য, মাটিতে মিশে গেছে যুক্তরাষ্ট্রের অহংকার"],
    ["Deepto News l দীপ্ত দুপুরের সংবাদ l ৭ অক্টোবর ২০২৬ | Deepto News Today", "দীপ্ত দুপুরের সংবাদ · ৭ অক্টোবর ২০২৬"],
    ["#Live |  দীপ্ত দুপুরের সংবাদ ( ৭ অক্টোবর ২০২৬ )", "দীপ্ত দুপুরের সংবাদ ( ৭ অক্টোবর ২০২৬ )"],
    ["Live। সংবাদ সারাদেশ। Sangbad Saradesh। News Bulletin। Global TV News", "সংবাদ সারাদেশ"],
    ["‘দুর্ভাগ্যজনকভাবে জন্মহার আগের চেয়ে বেড়েছে’ #ekattortv  #healthminister", "‘দুর্ভাগ্যজনকভাবে জন্মহার আগের চেয়ে বেড়েছে’"],
    ["শারদীয় দুর্গোৎসবে ষড়যন্ত্র করছে: রাশেদ খাঁন |Channel 24", "শারদীয় দুর্গোৎসবে ষড়যন্ত্র করছে: রাশেদ খাঁন"],
    ["ফ্যাক্টচেক: সত্য জানুন", "ফ্যাক্টচেক: সত্য জানুন"],
    ["DW News | Germany", "DW News"],
  ];
  for (const [raw, clean] of cases) assert.equal(cleanVideoTitle(raw), clean);
});

test("Videos build up across runs: the last day, at most 30 per channel", () => {
  const now = Date.parse("2026-10-07T12:00:00Z");
  const v = (id: string, hoursAgo: number, title = id): Video => ({
    id,
    channel: "jamuna",
    title,
    publishedAt: new Date(now - hoursAgo * 3600_000).toISOString(),
  });
  const kept = [v("old", 30), v("b", 2, "old title"), v("c", 3)];
  assert.deepEqual(
    mergeVideos([v("a", 1), v("b", 2, "new title")], kept, now).map((x) => `${x.id}:${x.title}`),
    ["a:a", "b:new title", "c:c"],
  );
  const many = Array.from({ length: 40 }, (_, i) => v(`m${i}`, i / 10));
  assert.equal(mergeVideos(many, [], now).length, 30);
  assert.equal(mergeVideos(many, [], now)[0].id, "m0");
});

test("Google News: one site's last day, in its language's edition", () => {
  assert.equal(siteHost("https://www.thedailystar.net"), "thedailystar.net");
  assert.equal(siteHost("https://bangla.thedailystar.net/"), "bangla.thedailystar.net");
  assert.equal(
    googleNewsFeedUrl("https://bangla.thedailystar.net", "bn"),
    "https://news.google.com/rss/search?q=site%3Abangla.thedailystar.net%20when%3A1d&hl=bn&gl=BD&ceid=BD:bn",
  );
  assert.match(googleNewsFeedUrl("https://www.bssnews.net", "en"), /q=site%3Abssnews\.net%20when%3A1d&hl=en-US&gl=US&ceid=US:en$/);
});

test("Google News feed: the site's own articles, without the publisher suffix", () => {
  const item = (id: string, title: string, publisher: string, url: string, date = "Wed, 07 Oct 2026 08:31:19 GMT") =>
    `<item><title>${title}</title><link>https://news.google.com/rss/articles/${id}?oc=5</link>
     <pubDate>${date}</pubDate><source url="${url}">${publisher}</source></item>`;
  const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>site:kalbela.com</title>
    ${item("CBMiAAA", "ম্যাজিস্ট্রেট নওশাদ বিমানবন্দরেই আছেন - কালবেলা", "কালবেলা", "https://www.kalbela.com")}
    ${item("CBMiBBB", "ই-পেপার - কালবেলা", "কালবেলা", "https://epaper.kalbela.com")}
    ${item("CBMiCCC", "A title - with a dash", "Other", "https://kalbela.com")}
  </channel></rss>`;
  assert.deepEqual(parseGoogleNewsFeed(xml, "kalbela.com"), [
    { id: "CBMiAAA", title: "ম্যাজিস্ট্রেট নওশাদ বিমানবন্দরেই আছেন", publishedAt: "2026-10-07T08:31:19.000Z" },
    { id: "CBMiCCC", title: "A title - with a dash", publishedAt: "2026-10-07T08:31:19.000Z" },
  ]);
  assert.throws(() => parseGoogleNewsFeed("<!doctype html><html></html>", "kalbela.com"), /web page/);
});

test("Google News feed: pages that aren't articles are left out", () => {
  const item = (id: string, title: string) =>
    `<item><title>${title} - দৈনিক ইনকিলাব</title><link>https://news.google.com/rss/articles/${id}</link>
     <pubDate>Wed, 07 Oct 2026 08:31:19 GMT</pubDate><source url="https://dailyinqilab.com">দৈনিক ইনকিলাব</source></item>`;
  const xml = `<?xml version="1.0"?><rss version="2.0"><channel>
    ${item("a", "Photo Card Details")}${item("b", "Photo Card Details")}${item("c", "Photo Card Details")}
    ${item("d", "বাংলাদেশ")}
    ${item("e", "আন্তর্জাতিক । দৈনিক ইনকিলাব")}
    ${item("f", "রুফটপ সৌরবিদ্যুৎ প্রকল্পের আওতায় আসতে পারে সব মসজিদ")}
    ${item("h", "আগামী বছর পাঠ্যক্রমে যুক্ত হবে নতুন ৪ বিষয় - দৈনিক ইনকিলাব")}
    ${item("g", "রুফটপ সৌরবিদ্যুৎ প্রকল্পের আওতায় আসতে পারে সব মসজিদ")}
  </channel></rss>`;
  assert.deepEqual(
    parseGoogleNewsFeed(xml, "dailyinqilab.com").map((e) => e.title),
    ["রুফটপ সৌরবিদ্যুৎ প্রকল্পের আওতায় আসতে পারে সব মসজিদ", "আগামী বছর পাঠ্যক্রমে যুক্ত হবে নতুন ৪ বিষয়"],
  );
  assert.equal(looksLikeArticle("https://dailyinqilab.com/national/article/812345"), true);
  assert.equal(looksLikeArticle("https://sangbad.net/news/19926/"), true);
  assert.equal(looksLikeArticle("https://www.newagebd.net/post/country/279134"), true);
  assert.equal(looksLikeArticle("https://www.bd-pratidin.com/national/2026/10/07/1182345"), true);
  assert.equal(looksLikeArticle("https://dailyinqilab.com/"), false);
  assert.equal(looksLikeArticle("https://dailyinqilab.com/national"), false);
});

test("Google News article addresses: the page's signature, then the lookup's answer", () => {
  assert.deepEqual(articleSignature('<c-wiz data-n-a-sg="AZ5r3e_sig" data-n-a-ts="1791360000">'), {
    signature: "AZ5r3e_sig",
    timestamp: 1791360000,
  });
  assert.equal(articleSignature("<html>consent</html>"), undefined);
  const body = `)]}'\n\n[["wrb.fr","Fbv4je","[\\"garturlres\\",\\"https://www.kalbela.com/national/229473\\",1]",null,null,null,"generic"]]`;
  assert.equal(parseResolvedUrl(body), "https://www.kalbela.com/national/229473");
  assert.equal(parseResolvedUrl(`)]}'\n[["er",null,null,null,null,429]]`), undefined);
});

test("Fallback note: why a source's headlines come from Google News", () => {
  const base: SourceStatus = { sourceId: "kalbela", sourceName: "Kalbela", method: "html", ok: true, count: 30, durationMs: 1, fetchedAt: "" };
  assert.equal(fallbackNote(base), undefined);
  const note = fallbackNote({ ...base, via: "google-news", directError: "HTTP 403" });
  assert.equal(note?.message, "via Google News");
  assert.match(note?.detail ?? "", /blocking automated access.*Google News instead/);
  // A site read only through Google News: its notes say why.
  const jsOnly = fallbackNote({ ...base, via: "google-news", directError: "No feed/sitemap; homepage JS-rendered" });
  assert.match(jsOnly?.detail ?? "", /loads its headlines with JavaScript.*Google News instead/);
});

console.log(`\n${passed} passed${process.exitCode ? ", some failed" : ""}`);
