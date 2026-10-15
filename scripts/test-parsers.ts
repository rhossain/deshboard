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
import { parseVideoStats } from "../src/lib/fetchers/youtube-api";
import {
  articleSignature,
  googleNewsFeedUrl,
  looksLikeArticle,
  parseGoogleNewsFeed,
  parseResolvedUrl,
  siteHost,
} from "../src/lib/fetchers/google-news";
import { compactCount, fullTime, timeAgo } from "../src/components/time";
import { canonicalLink, cleanTitle, dedupeByLink, parseDate, resolveUrl, shiftDhakaAsUtc } from "../src/lib/fetchers/utils";
import { DEFAULT_FILTERS, filtersToSearch, parseFilters } from "../src/lib/filters";
import { stampFirstSeen } from "../src/lib/first-seen";
import { findLogoCandidates } from "../src/lib/logos";
import { forBoard, mergeNews } from "../src/lib/news";
import { applyDelta, makeDelta, packDay, packFeed, unpackDay, unpackFeed, withoutPictures } from "../src/lib/packed";
import { fallbackNote, sourceProblem } from "../src/lib/problems";
import {
  articleUrl,
  linkKey,
  SHARE_TARGETS,
  sharedId,
  sharedVideoId,
  shareKey,
  sharePath,
  shareText,
  shortSharePath,
  videoSharePath,
} from "../src/lib/share";
import { buildShareIndex } from "../src/lib/share-index";
import { datesToSearch, findShared, findSharedVideo, SHARE_DIR, type ShareLoader } from "../src/lib/share-lookup";
import { parseHead, slugTitle } from "../src/lib/outlet-head";
import { byDay, keptDates, mergeDay } from "../src/lib/archive";
import { compileSearch, installSearchTerms } from "../src/lib/search";
import { SEARCH_TERMS } from "../src/lib/search-terms";
import { findStories, keywords, type Story } from "../src/lib/stories";
import { OUTLETS } from "../src/lib/directory";
import { OUTLET_PROFILES } from "../src/lib/outlet-profiles";
import { outletDescription } from "../src/lib/site";
import {
  pickRoundup,
  pickVideo,
  roundupHeading,
  roundupMessage,
  roundupRecord,
  videoMessage,
  videoRecord,
  videoStories,
} from "../src/lib/page-video-posts";
import {
  dueSlot,
  headlinesMessage,
  headlinesRecord,
  isSensitive,
  pickHeadlines,
  parseSlots,
  pickStory,
  postMessage,
  postRecord,
  type PostRecord,
  SLOTS,
  storySection,
} from "../src/lib/page-posts";
import type { NewsFeed, NewsItem, NewsSource, SourceResult, SourceStatus, Video } from "../src/lib/types";
import { mergeVideos } from "../src/lib/videos";
import { groupVideos, tagStories, videoKeywords } from "../src/lib/video-stories";

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

test("pictures: Media RSS, enclosures, an <img> in the description, sitemap image:loc", () => {
  const rss = `<?xml version="1.0"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel>
    <item><title>Dhaka Post style</title><link>https://www.dhakapost.com/a/1</link>
      <media:content medium="image" width="1200" url="https://assets.dhakapost.com/og/a.jpg?cid=1"/></item>
    <item><title>Khola Kagoj style</title><link>https://kholakagojbd.com/news/2</link>
      <enclosure url="https://kholakagojbd.com/2026/10/14/kk_2.jpg" length="0" type="image/jpeg"/></item>
    <item><title>Audio is not a picture</title><link>https://x.test/3</link>
      <enclosure url="https://x.test/3.mp3" type="audio/mpeg"/></item>
    <item><title>Risingbd style</title><link>https://www.risingbd.com/news/4</link>
      <description><![CDATA[<p><img alt="" src="/media/imgAll/4.jpg?w=1&amp;h=2"/></p> Text]]></description></item>
    <item><title>Thumbnail in a group</title><link>https://x.test/5</link>
      <media:group><media:thumbnail url="https://x.test/5-thumb.jpg"/></media:group></item>
    <item><title>No picture at all</title><link>https://x.test/6</link><description>Just words</description></item>
  </channel></rss>`;
  const items = parseFeed(rss, "https://www.risingbd.com/rss/rss.xml");
  assert.deepEqual(
    items.map((it) => it.image),
    [
      "https://assets.dhakapost.com/og/a.jpg?cid=1",
      "https://kholakagojbd.com/2026/10/14/kk_2.jpg",
      undefined,
      "https://www.risingbd.com/media/imgAll/4.jpg?w=1&h=2",
      "https://x.test/5-thumb.jpg",
      undefined,
    ],
  );
  assert.equal("image" in items[5], false);

  const sitemap = `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
    xmlns:news="http://www.google.com/schemas/sitemap-news/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
    <url><loc>https://www.ittefaq.com.bd/815055/a</loc>
      <news:news><news:publication_date>2026-10-14T10:00:00+06:00</news:publication_date><news:title>Ittefaq headline</news:title></news:news>
      <image:image><image:loc>https://cdn.ittefaqbd.com/contents/cache/images/1200x0x1/a.jpg?jadewits_media_id=1</image:loc></image:image></url>
    <url><loc>https://www.ittefaq.com.bd/815056/b</loc>
      <news:news><news:publication_date>2026-10-14T09:00:00+06:00</news:publication_date><news:title>No picture here</news:title></news:news></url>
  </urlset>`;
  const sm = parseNewsSitemap(sitemap, "https://www.ittefaq.com.bd/news-sitemap.xml");
  assert.equal(sm[0].image, "https://cdn.ittefaqbd.com/contents/cache/images/1200x0x1/a.jpg?jadewits_media_id=1");
  assert.equal(sm[1].image, undefined);
});

test("pictures: kept between runs and in the day archive, left out of the board's files", () => {
  const base = { sourceId: "s", sourceName: "S", lang: "en" as const, category: "national" as const };
  const kept: NewsItem[] = [
    { ...base, title: "Found once", link: "https://s.test/a/1", publishedAt: "2026-10-14T04:00:00.000Z", image: "https://s.test/1.jpg" },
    { ...base, title: "Looked for, none", link: "https://s.test/a/2", publishedAt: "2026-10-14T03:00:00.000Z", image: null },
  ];
  // The feed names no pictures: each headline keeps what was found before (and isn't looked for again).
  const fresh: NewsItem[] = kept.map(({ image: _i, ...it }) => it); // eslint-disable-line @typescript-eslint/no-unused-vars
  const merged = mergeNews(fresh, kept, Date.parse("2026-10-14T06:00:00Z"));
  assert.equal(merged.find((it) => it.link.endsWith("/1"))?.image, "https://s.test/1.jpg");
  assert.equal(merged.find((it) => it.link.endsWith("/2"))?.image, null);
  assert.equal(mergeDay(kept, fresh).find((it) => it.link.endsWith("/1"))?.image, "https://s.test/1.jpg");

  const day = packDay({ date: "2026-10-14", items: merged });
  const back = unpackDay(day).items;
  assert.equal(back.find((it) => it.link.endsWith("/1"))?.image, "https://s.test/1.jpg");
  assert.equal(back.find((it) => it.link.endsWith("/2"))?.image, null);
  const served = withoutPictures(day);
  assert.ok(served.sources[0].items.every((it) => it.length <= 5));
  assert.equal(unpackDay(served).items[0].image, undefined);
  const feed = packFeed({ generatedAt: "", logos: {}, logoShapes: {}, results: [{ ...base, method: "rss", ok: true, count: 2, durationMs: 0, fetchedAt: "", items: merged }] } as NewsFeed);
  assert.ok(feed.results[0].items.every((it) => it.length <= 5));
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
  // A bare date has no time to order by.
  assert.equal(parseDate("2026-10-13"), undefined);
  // No zone: Dhaka time, whatever the machine's zone.
  assert.equal(parseDate("Sun, 04 Oct 2026 22:31:55"), "2026-10-04T16:31:55.000Z");
  assert.equal(parseDate("2026-10-04 10:31:55 PM"), "2026-10-04T16:31:55.000Z");
  assert.equal(parseDate("Sun, 04 Oct 2026 22:31:55 GMT"), "2026-10-04T22:31:55.000Z");
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

test("Categories from the headline when the URL and feed name no section", () => {
  const none = "https://www.mzamin.com/article/49197";
  assert.equal(categorize(none, [], "বিএনপির দুই নেতার পদ স্থগিত"), "politics");
  assert.equal(categorize(none, [], "5-phase UP elections to begin on Jan 21"), "politics");
  assert.equal(categorize(none, [], "ডিএমপির অভিযানে ২৪ ঘণ্টায় গ্রেপ্তার ৪৬৪, মামলা ৪২"), "crime");
  assert.equal(categorize(none, [], "Dengue death toll crosses 300"), "health");
  assert.equal(categorize(none, [], "বিশ্ববাজারে বাড়ল স্বর্ণের দাম"), "business");
  assert.equal(categorize(none, [], "রাঙ্গামাটির ঝুলন্ত সেতু ‘ডুবন্ত’"), "national");
  // A country in a sports headline is the opponent; an attack abroad is foreign news, not crime
  assert.equal(categorize(none, [], "রেকর্ড গড়ে শ্রীলঙ্কাকে উড়িয়ে সিরিজ জিতল পাকিস্তান"), "sports");
  assert.equal(categorize(none, [], "রিয়াদ বিমানবন্দরে আবারও ক্ষেপণাস্ত্র হামলা"), "international");
  // Whole words only: গোলাগুলি is not a goal, "us" is not the US, করে is not a tax
  assert.equal(categorize(none, [], "দুই পক্ষের গোলাগুলি"), "crime");
  assert.equal(categorize(none, [], "Tell us what you think"), "other");
  assert.equal(categorize(none, [], "তিনি কাজ করে যাচ্ছেন"), "other");
  // Filed as national: moves only on strong evidence, and never abroad
  const national = "https://www.prothomalo.com/bangladesh/district/abc";
  assert.equal(categorize(national, [], "চুয়েটের উপাচার্যকে ভবনে অবরুদ্ধ করে শিক্ষার্থীদের তালা"), "education");
  assert.equal(categorize(national, [], "এলপি গ্যাসের দোকান দুদিন বন্ধ রাখার ঘোষণা"), "national");
  assert.equal(categorize(national, [], "সৌদির বিমানবন্দরে হামলায় দুই বাংলাদেশির মৃত্যু, পরিবারে মাতম"), "national");
  // A section from the URL always wins over the headline
  assert.equal(categorize("https://barta24.com/details/politics/1", [], "ক্রিকেট ম্যাচে বাংলাদেশের জয়"), "politics");
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

installSearchTerms(SEARCH_TERMS);

test("search: every word, in any order, in other forms", () => {
  const s = compileSearch("নির্বাচনে ইসি")!;
  assert.ok(s.matches("ইসির সঙ্গে নির্বাচনের প্রস্তুতি নিয়ে বৈঠক"));
  assert.ok(!s.matches("নির্বাচনের প্রস্তুতি নিয়ে বৈঠক"));
  assert.ok(compileSearch("elections")!.matches("Election date announced"));
  assert.equal(compileSearch("   "), null);
  assert.equal(compileSearch("?!"), null);
});

test("search: Bangla and English equivalents, and other spellings", () => {
  assert.ok(compileSearch("flood")!.matches("সিলেটে বন্যায় পানিবন্দী লাখো মানুষ"));
  assert.ok(compileSearch("বন্যা")!.matches("Floods hit Sylhet"));
  assert.ok(compileSearch("Chittagong")!.matches("চট্টগ্রামে সার জব্দ"));
  assert.ok(compileSearch("chittagong")!.matches("Chattogram port busy"));
  assert.ok(compileSearch("awami league")!.matches("আওয়ামী লীগ নেত্রী গ্রেপ্তার"));
  assert.ok(compileSearch("dhaka rain")!.matches("ঢাকায় মেঘলা আকাশ, সঙ্গে হালকা বৃষ্টির সম্ভাবনা"));
  // Each word in a group finds every other: no stemming cuts into them.
  for (const group of SEARCH_TERMS) {
    for (const a of group) for (const b of group) assert.ok(compileSearch(a)!.matches(b), `${a} → ${b}`);
  }
  // No word belongs to two groups, or a search for it would only ever find one group's.
  const owner = new Map<string, string>();
  for (const group of SEARCH_TERMS) {
    for (const word of group) {
      const key = word.normalize("NFC").toLowerCase();
      assert.ok(!owner.has(key), `"${word}" is in "${owner.get(key)}" and "${group[0]}"`);
      owner.set(key, group[0]);
    }
  }
});

test("search: English and equivalents start a word; typed Bangla can sit inside one", () => {
  assert.ok(!compileSearch("rain")!.matches("Train services resume"));
  assert.ok(compileSearch("rain")!.matches("Heavy rains likely"));
  // "train" → "রেলওয়ে", which must not find "জেনারেল".
  assert.ok(!compileSearch("train")!.matches("অবসরপ্রাপ্ত মেজর জেনারেল"));
  assert.ok(compileSearch("ভোট")!.matches("সংবিধানে ফিরছে গণভোটের বিধান"));
  // An English equivalent is a whole word: "বন্যা" finds "Floods", not "floodlit".
  assert.ok(!compileSearch("বন্যা")!.matches("Cup set for floodlit debut"));
  assert.ok(compileSearch("বন্যা")!.matches("Flooding in Sylhet"));
  // ি/ী forgiven in what's typed, not in the word list: "china" mustn't find চিনি (sugar).
  assert.ok(compileSearch("চিন")!.matches("চীনের সঙ্গে চুক্তি"));
  assert.ok(!compileSearch("china")!.matches("চিনি কলকে লাভজনক করতে"));
  // A short stem doesn't go anywhere: "শহর" → "শহ" mustn't find "শহীদ", "নগর" → "নগ" "জনগণ", "খবর" → "খব" "রাখবে".
  assert.ok(!compileSearch("শহর")!.matches("শহীদ পরিবারের পাশে"));
  assert.ok(!compileSearch("নগর")!.matches("জনগণের রায় মেনে নিন"));
  assert.ok(!compileSearch("খবর")!.matches("নজর রাখবে সরকার"));
  // ...but the typed word still sits inside one, and the stem starts one with its endings.
  assert.ok(compileSearch("নগর")!.matches("মুরাদনগরে সংঘর্ষ"));
  assert.ok(compileSearch("শহর")!.matches("শহরে যানজট"));
  assert.ok(compileSearch("নগরের")!.matches("নগরে পানি"));
  // A short word being typed finds the words it starts.
  assert.ok(compileSearch("ঢা")!.matches("ঢাকায় বৃষ্টি"));
  // A longer stem goes on into compounds.
  assert.ok(compileSearch("বৃষ্টির")!.matches("বজ্রবৃষ্টিপাতের সম্ভাবনা"));
});

test("search: however the Bangla was written", () => {
  const ch = (...codes: number[]) => String.fromCharCode(...codes);
  // য় precomposed in the headline, decomposed in the query (and the other way round).
  assert.ok(compileSearch("বিয়ে")!.matches(`বি${ch(0x09df)}ে`));
  assert.ok(compileSearch(`বি${ch(0x09df)}ে`)!.matches("বিয়ে"));
  // ো as two marks; a zero-width joiner inside the word; Bangla digits.
  assert.ok(compileSearch("ভোট")!.matches(`ভ${ch(0x09c7, 0x09be)}ট`));
  assert.ok(compileSearch("র্যাব")!.matches(`র${ch(0x200d)}্যাব`));
  assert.ok(compileSearch("2026")!.matches("২০২৬ সালের ১৩ নভেম্বর"));
  assert.ok(compileSearch("২০২৬")!.matches("Budget 2026"));
});

test("search: small words left out, unless they are the whole query", () => {
  assert.ok(compileSearch("rain in dhaka")!.matches("Rain lashes Dhaka"));
  assert.ok(compileSearch("in")!.matches("Rain in Dhaka"));
});

test("search: ranges mark whole words, merged and in order", () => {
  const text = "ঢাকায় মেঘলা আকাশ, সঙ্গে হালকা বৃষ্টির সম্ভাবনা";
  const marked = compileSearch("rain dhaka")!.ranges(text).map(([a, b]) => text.slice(a, b));
  assert.deepEqual(marked, ["ঢাকায়", "বৃষ্টির"]);
  assert.deepEqual(compileSearch("ভোট")!.ranges("গণভোটের বিধান"), [[2, 7]]);
});

test("archive: 30 Dhaka days kept, merged with what was kept before", () => {
  const dates = keptDates(Date.parse("2026-10-12T20:00:00Z")); // 02:00 on the 13th in Dhaka
  assert.equal(dates.length, 30);
  assert.equal(dates[0], "2026-10-13");
  assert.equal(dates[29], "2026-09-14");
  const days = byDay([
    item("a", "Late", { publishedAt: "2026-10-12T19:00:00Z" }), // 01:00 on the 13th in Dhaka
    item("a", "Early", { publishedAt: "2026-10-12T05:00:00Z" }),
    item("a", "Undated"),
  ]);
  assert.deepEqual([...days.keys()], ["2026-10-13", "2026-10-12"]);
  // The cache has lost the day's first headline; the archive still has it. A fresh copy wins.
  const kept = [
    item("a", "Gone from the cache", { link: "https://a.test/1", publishedAt: "2026-10-12T01:00:00Z" }),
    item("a", "Old title", { link: "https://a.test/2", publishedAt: "2026-10-12T03:00:00Z" }),
  ];
  const fresh = [
    item("a", "New title", { link: "https://a.test/2", publishedAt: "2026-10-12T03:00:00Z" }),
    item("a", "Newest", { link: "https://a.test/3", publishedAt: "2026-10-12T09:00:00Z" }),
  ];
  assert.deepEqual(mergeDay(kept, fresh).map((it) => it.title), ["Newest", "New title", "Gone from the cache"]);
});

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

test("first seen: an old article resurfacing on the page gets no time", () => {
  const link = (n: number) => `https://paper.test/news/${n}`;
  const page = (ns: number[]) => ns.map((n) => item("paper", `Headline ${n}`, { link: link(n) }));
  const t0 = Date.parse("2026-10-05T10:00:00Z");
  stampFirstSeen("paper", page([1000]), t0); // first fetch
  // A day's new articles, 5001-5012, then an old one (1200, from "most read") and a new one (5013).
  stampFirstSeen("paper", page(Array.from({ length: 12 }, (_, i) => 5001 + i)), t0 + 600_000);
  const later = page([...Array.from({ length: 12 }, (_, i) => 5001 + i), 1200, 5013]);
  stampFirstSeen("paper", later, t0 + 1_200_000);
  assert.equal(later.find((it) => it.link === link(1200))?.seenAt, undefined);
  assert.equal(later.find((it) => it.link === link(5013))?.seenAt, new Date(t0 + 1_200_000).toISOString());
});

test("compactCount: each unit while it rounds under 100 of it", () => {
  assert.equal(compactCount(48_000, "bn"), "৪৮ হাজার");
  assert.equal(compactCount(99_960, "bn"), "১ লাখ");
  assert.equal(compactCount(9_999_000, "bn"), "১ কোটি");
  assert.equal(compactCount(1_234), "1.2K");
});

test("canonicalLink: AMP, index.php and tracking parameters", () => {
  assert.equal(canonicalLink("https://www.dhakatribune.com/amp/bangladesh/421896/x"), "https://www.dhakatribune.com/bangladesh/421896/x");
  assert.equal(canonicalLink("https://example.com/news/123/amp"), "https://example.com/news/123");
  assert.equal(canonicalLink("https://www.daily-sun.com/index.php/world/903200/x"), "https://www.daily-sun.com/world/903200/x");
  assert.equal(canonicalLink("https://Example.com/a?id=5&utm_source=fb&fbclid=1"), "https://example.com/a?id=5");
  assert.equal(canonicalLink("https://example.com/amp"), "https://example.com/amp");
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

  // After a long gap, what turned up meanwhile could be hours old: no time, as on the first fetch.
  const later = [item("home", "Fresh headline"), item("home", "Turned up during the gap")];
  stampFirstSeen("home", later, Date.parse("2026-10-05T15:00:00Z"));
  assert.equal(later[0].seenAt, "2026-10-05T10:10:00.000Z");
  assert.equal(later[1].seenAt, undefined);
  const next = [item("home", "Turned up during the gap"), item("home", "Newest")];
  stampFirstSeen("home", next, Date.parse("2026-10-05T15:15:00Z"));
  assert.equal(next[0].seenAt, undefined);
  assert.equal(next[1].seenAt, "2026-10-05T15:15:00.000Z");
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

test("share: a shared link finds its headline despite scheme, www, slash or encoding", () => {
  const key = linkKey("https://www.dhakatribune.com/bangladesh/421356/woman%E2%80%99s-body/");
  assert.equal(linkKey("http://dhakatribune.com/bangladesh/421356/woman’s-body"), key);
  assert.equal(linkKey(articleUrl("www.dhakatribune.com/bangladesh/421356/woman’s-body".split("/"))!.url.href), key);
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

test("share: videos go out as /s/youtu.be/<id>, and only video IDs are read back", () => {
  assert.equal(videoSharePath("SX-I-Mx_a1b"), "/s/youtu.be/SX-I-Mx_a1b");
  assert.equal(sharedVideoId(videoSharePath("SX-I-Mx_a1b").slice("/s/".length).split("/")), "SX-I-Mx_a1b");
  for (const path of ["youtu.be", "youtu.be/short", "youtu.be/SX-I-Mx_a1b/x", "youtu.be/SX-I-Mx_a1!", "evil.test/SX-I-Mx_a1b"]) {
    assert.equal(sharedVideoId(path.split("/")), null, path);
  }
});

test("share targets put the link and its text in the URL", () => {
  const url = "https://bartaboard.test/s/261014-k3x9pq2m";
  const text = shareText("শিরোনাম & title", "Prothom Alo");
  assert.equal(text, "“শিরোনাম & title” — Prothom Alo · Bartaboard");
  for (const t of SHARE_TARGETS) {
    const href = t.href(url, text);
    assert.ok(href.startsWith("https://"), t.id);
    assert.ok(href.includes(encodeURIComponent(url)), t.id);
  }
  const wa = SHARE_TARGETS.find((t) => t.id === "whatsapp")!;
  assert.equal(new URL(wa.href(url, text)).searchParams.get("text"), `${text}\n${url}`);
});

test("share: short links carry the day and a key that ignores scheme, www and slash", () => {
  const key = shareKey("https://www.prothomalo.com/bangladesh/abc");
  assert.match(key, /^[0-9a-z]{8}$/);
  assert.equal(shareKey("http://prothomalo.com/bangladesh/abc/"), key);
  assert.notEqual(shareKey("https://www.prothomalo.com/bangladesh/abd"), key);
  const path = shortSharePath("https://www.prothomalo.com/bangladesh/abc", "2026-10-14");
  assert.equal(path, `/s/261014-${key}`);
  assert.deepEqual(sharedId(path.slice(3).split("/")), { date: "2026-10-14", key });
  for (const bad of ["261014", "261014-abc", "261014-ABCDEFGH", "2610145-abcdefgh", "261014-abcdefgh/x", "www.prothomalo.com"]) {
    assert.equal(sharedId(bad.split("/")), null, bad);
  }
  assert.deepEqual(datesToSearch("2026-10-01"), ["2026-10-01", "board", "2026-09-30", "2026-10-02"]);
  // A mistyped day is looked for as it is, not thrown on.
  assert.deepEqual(datesToSearch("2026-13-99"), ["2026-13-99", "board", "2026-13-99", "2026-13-99"]);
});

test("share index: a short link finds its headline, its story and its outlet's logo; a video its channel", async () => {
  const item = (title: string, link: string, sourceId: string, sourceName: string, publishedAt?: string): NewsItem => ({
    title,
    link,
    sourceId,
    sourceName,
    lang: "bn",
    category: "politics",
    publishedAt,
  });
  const a = item("ঢাকায় সংসদ নির্বাচনের তফসিল ঘোষণা করল নির্বাচন কমিশন", "https://www.prothomalo.com/politics/a1", "prothomalo", "Prothom Alo", "2026-10-14T04:00:00Z");
  const b = item("সংসদ নির্বাচনের তফসিল ঘোষণা করল নির্বাচন কমিশন ঢাকায়", "https://www.jugantor.com/politics/1168001", "jugantor", "Jugantor", "2026-10-14T04:30:00Z");
  b.image = "https://cdn.jugantor.com/og/1168001.jpg";
  const undated = item("হোমপেজের শিরোনাম", "https://www.samakal.com/x/123", "samakal", "Samakal");
  const files = buildShareIndex(
    new Map([["2026-10-14", [a, b]]]),
    [a, b, undated],
    { logos: { prothomalo: "/logos/prothomalo.png" }, logoShapes: {} },
    { generatedAt: "", channels: [{ id: "somoy", name: "Somoy TV", ok: true }], videos: [{ id: "2_G1z7wpfSE", channel: "somoy", title: "ভিডিও", publishedAt: "2026-10-14T05:00:00Z" }] },
    Date.parse("2026-10-14T06:00:00Z"),
  );
  const store = new Map<string, unknown>([...files.files].map(([name, f]) => [`${SHARE_DIR}/${name}.json`, f]));
  store.set(`${SHARE_DIR}/meta.json`, files.meta);
  const load: ShareLoader = async (p) => (store.get(p) ?? null) as never;

  const id = sharedId(shortSharePath(a.link, "2026-10-14").slice(3).split("/"))!;
  const found = await findShared(id.key, datesToSearch(id.date), load);
  assert.equal(found?.item.title, a.title);
  assert.equal(found?.item.publishedAt, "2026-10-14T04:00:00.000Z");
  assert.deepEqual(found?.related.map((r) => r.sourceId), ["jugantor"]);
  assert.equal(found?.logos.logos.prothomalo, "/logos/prothomalo.png");
  // A picture only where the fetch found one; the share function looks for the rest.
  assert.equal(found?.image, undefined);
  const withImage = await findShared(shareKey(b.link), datesToSearch("2026-10-14"), load);
  assert.equal(withImage?.image, "https://cdn.jugantor.com/og/1168001.jpg");
  assert.equal(withImage?.related[0].sourceId, "prothomalo");
  // Filed a day off (its time was corrected): still found.
  assert.equal((await findShared(id.key, datesToSearch("2026-10-15"), load))?.item.link, a.link);
  // Undated homepage headlines are kept with the board's.
  assert.equal((await findShared(shareKey(undated.link), datesToSearch("2026-10-14"), load))?.item.title, undated.title);
  assert.equal(await findShared("zzzzzzzz", datesToSearch("2026-10-14"), load), null);

  // A big story keeps six of the other outlets' headlines, and counts them all. (Filler, so its words are
  // rare enough to link headlines.)
  const many = Array.from({ length: 7 }, (_, i) =>
    item("ঢাকায় সংসদ নির্বাচনের তফসিল ঘোষণা করল নির্বাচন কমিশন", `https://o${i}.test/a`, `o${i}`, `O${i}`, "2026-10-14T05:00:00Z"),
  );
  const filler = Array.from({ length: 400 }, (_, i) =>
    item(`filler story number ${i} about topic ${i}`, `https://f.test/${i}`, `f${i % 9}`, "F", "2026-10-14T03:00:00Z"),
  );
  const big = buildShareIndex(new Map([["2026-10-14", [a, ...many, ...filler]]]), [], { logos: {}, logoShapes: {} }, { generatedAt: "", channels: [], videos: [] }, Date.parse("2026-10-14T06:00:00Z"));
  const bigLoad: ShareLoader = async (p) => (big.files.get(p.slice(SHARE_DIR.length + 1, -5)) ?? null) as never;
  const crowded = await findShared(shareKey(a.link), ["2026-10-14"], bigLoad);
  assert.equal(crowded?.related.length, 6);
  assert.equal(crowded?.others, 7);
  assert.equal(found?.others, undefined, "no count when every one is listed");

  const video = await findSharedVideo("2_G1z7wpfSE", load);
  assert.equal(video?.channelName, "Somoy TV");
  assert.equal(video?.video.channel, "somoy");
});

test("outlet pages: title, picture and date from the head; a title from the address otherwise", () => {
  const head = parseHead(
    `<html><head><title>Ignored | Outlet</title>
     <meta property="og:title" content="Padma &amp; Jamuna: &#x09AC;&#2476; rivers rise"/>
     <meta name='twitter:image' content='https://cdn.test/t.jpg'>
     <meta content="/img/a.jpg?w=1200&amp;h=630" property="og:image">
     <script type="application/ld+json">{"datePublished": "2026-10-12T18:11:32+06:00"}</script>
     </head><body><meta property="og:image" content="/not-this.jpg"></body>`,
    "https://www.outlet.test/news/a",
  );
  assert.equal(head.title, "Padma & Jamuna: বব rivers rise");
  assert.equal(head.image, "https://www.outlet.test/img/a.jpg?w=1200&h=630");
  assert.equal(head.published, "2026-10-12T12:11:32.000Z");
  assert.equal(parseHead("<head><meta property='og:image' content='javascript:alert(1)'></head>", "https://x.test/").image, undefined);
  // Next.js streams its metadata into the body: used when the head has none.
  const streamed = parseHead(
    `<head><title>Naya Diganta</title><meta name="next-size-adjust" content=""/></head><body><div>…</div>
     <title>Story | Naya Diganta</title><meta property="og:title" content="Story"/>
     <meta property="og:image" content="https://file.test/og.webp"/><meta property="og:image:width" content="700"/></body>`,
    "https://dailynayadiganta.com/post/x/1",
  );
  assert.equal(streamed.image, "https://file.test/og.webp");
  assert.equal(streamed.title, "Story");

  assert.equal(slugTitle(new URL("https://www.thedailystar.net/news/news/german-tourists-stolen-laptop-recovered-natore-4296596")), "German tourists stolen laptop recovered natore");
  assert.equal(slugTitle(new URL("https://bangla.bdnews24.com/bangladesh/f2sv381a14")), null);
  assert.equal(slugTitle(new URL("https://www.jugantor.com/country-news/1168824")), null);
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

test("YouTube Data API: current views, hidden counts left out", () => {
  const json = JSON.stringify({
    items: [
      { id: "a1", statistics: { viewCount: "152340", likeCount: "900" } },
      { id: "b2", statistics: { likeCount: "3" } },
      { id: "c3", statistics: { viewCount: "0" } },
    ],
  });
  assert.deepEqual([...parseVideoStats(json)], [["a1", 152340]]);
  assert.deepEqual([...parseVideoStats("{}")], []);
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

test("Videos build up across runs: the whole last day, up to 200 per channel", () => {
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
  // A busy channel's day (a video every 10 minutes) is all kept; beyond the limit, the newest.
  const day = Array.from({ length: 140 }, (_, i) => v(`d${i}`, i / 6));
  assert.equal(mergeVideos(day, [], now).length, 140);
  const many = Array.from({ length: 250 }, (_, i) => v(`m${i}`, i / 20));
  assert.equal(mergeVideos(many, [], now).length, 200);
  assert.equal(mergeVideos(many, [], now)[0].id, "m0");
});

test("Video titles: masked words made whole, bulletins and dates leave nothing to match", () => {
  assert.deepEqual(videoKeywords("সাবেক দুই সেনা কর্মকর্তা গ্রে/প্তা/র"), videoKeywords("সাবেক দুই সেনা কর্মকর্তা গ্রেপ্তার"));
  assert.deepEqual(videoKeywords("বি*স্ফো*রক অ'ভি'যোগ"), videoKeywords("বিস্ফোরক অভিযোগ"));
  assert.deepEqual(videoKeywords("চকবাজারে আ~গু~ন"), videoKeywords("চকবাজারে আগুন"));
  assert.deepEqual(videoKeywords("চকবাজারে আ গু ন"), videoKeywords("চকবাজারে আগুন"));
  // Two spellings of one thing.
  assert.deepEqual(videoKeywords("চুয়েটের নতুন ভিসি"), videoKeywords("চুয়েটের নতুন উপাচার্য"));
  assert.deepEqual(videoKeywords("দুই সদস্য গ্রেফতার"), videoKeywords("দুই সদস্য গ্রেপ্তার"));
  for (const bulletin of [
    "এটিএন বাংলার সন্ধ্যা ৬ টার সংবাদ",
    "সন্ধ্যার বাংলাভিশন সংবাদ",
    "বাংলাভিশন নিউজ টপ টেন · বিকেল ৫টা · ১২ অক্টোবর ২০২৬",
    "মোহনা সংবাদ · তারিখ: ১২ অক্টোবরর ২০২৬",
    "এটিএন বাংলার সংবাদ শিরোনাম । সন্ধ্যা ৬ টা । ১২.১০.২০২৬",
  ]) {
    assert.deepEqual(videoKeywords(bulletin), [], bulletin);
  }
  // Numbers that are news stay.
  assert.ok(videoKeywords("কুমিল্লায় অভিযান, আটক ৩৫৩").includes("353"));
  // A word and its inflections, and two spellings of a name, are one word; small numbers in words go.
  assert.deepEqual(videoKeywords("চকবাজার মার্কেটে ছয় ঘন্টা"), videoKeywords("চকবাজারের মার্কেট ৬ ঘণ্টার"));
  assert.deepEqual(videoKeywords("বগুড়ার শাহেদ"), videoKeywords("বগুড়ার সাহেদ"));
  assert.deepEqual(videoKeywords("গু-ন্ডা, বি-স্ফোরক"), videoKeywords("গুন্ডা, বিস্ফোরক"));
  // Stripped further, "মেয়ে" would be "মে" (May), which is ignored: it stays.
  assert.equal(videoKeywords("এমপির মেয়ে").length, 2);
});

test("A fire told from every angle all day is one story; another fire and other news aren't", () => {
  const now = Date.parse("2026-10-13T02:30:00Z");
  let n = 0;
  const v = (channel: string, title: string, hoursAgo: number): Video => ({
    id: `f${n++}`,
    channel,
    title,
    publishedAt: new Date(now - hoursAgo * 3600_000).toISOString(),
  });
  const fire = [
    v("deepto", "তিন ঘণ্টা পরও নিয়ন্ত্রণ আসেনি চকবাজারের আ'গু'ন‌, সরাসরি", 12.7),
    v("itv", "পুরান ঢাকার চকবাজারে বহুতল ভবনে আগুন, নিয়ন্ত্রণে সার্ভিসের ৫ ইউনিট", 11.8),
    v("ekhon", "চকবাজারে দোকানে অগ্নিকাণ্ড, ছড়িয়েছে পাশেও", 11),
    v("itv", "চকবাজারে আগুন: ৫ ঘণ্টাতেও আগুন নিয়ন্ত্রণে আসেনি, কিসের সংকট?", 9.9),
    v("somoy", "চকবাজারে আগুন: সরু রাস্তা ও পানি সংকটে আগুন নেভাতে ভোগান্তি", 9.3),
    v("globaltv", "চকবাজারের আ/গু/ন নিয়ন্ত্রণে, পরিদর্শনে আসলেন প্রশাসক আব্দুস সালাম", 9.4),
    v("jamuna", "দীর্ঘ ছয় ঘণ্টার চেষ্টায় নিয়ন্ত্রণে চকবাজারের আগুন; নেই হতাহতের ঘটনা", 8),
    v("ntv", "৬ ঘন্টা চেষ্টায় নিয়ন্ত্রণে চকবাজারের আ/গু/ন", 6),
    v("jamuna", "চকবাজারে আগুন: ছয় ঘণ্টা পর নিয়ন্ত্রণে এলেও গভীর রাতেও জ্বলছিল আগুন", 0.9),
    v("atn-bangla", "সাড়ে ৫ ঘণ্টার চেষ্টায় পুরান ঢাকার চকবাজারের আগুন নিয়ন্ত্রণে", 0.25),
  ];
  const others = [
    // Another fire the same day, elsewhere.
    v("rtv", "গাজীপুরে পোশাক কারখানায় আগুন, নিয়ন্ত্রণে ৫ ইউনিট", 5),
    v("somoy", "গাজীপুরের কারখানায় আগুন, পুড়ে ছাই কাপড়", 4.5),
    // Chawkbazar, no fire.
    v("dbc", "চকবাজারে ইফতারির বাজার জমজমাট", 3),
    // The confined CUET VC (that day's titles): the last one shares too little with any one title,
    // but has the story's core.
    v("somoy", "নিজ দপ্তরে ২২ ঘণ্টা ধরে অবরুদ্ধ চুয়েটের নবনিযুক্ত ভিসি", 0.1),
    v("dbc", "১৯ ঘণ্টা ধরে অবরুদ্ধ চুয়েটের নতুন উপাচার্য", 0.7),
    v("itv", "চুয়েট: ‘পদত্যাগ করলে খুলবে তালা’, অবরুদ্ধ উপাচার্যকে আল্টিমেটাম", 10.3),
    v("etv-news", "চুয়েটে চরম উত্তেজনা, কার্যালয়ে অবরুদ্ধ নতুন উপাচার্য", 10.4),
    v("news24", "চুয়েটে অবরুদ্ধ ভিসির জন্য খাবার পাঠিয়ে তা নিয়ে যেতে মাইকিং শিক্ষার্থীর", 11.6),
    v("somoy", "ক্যাম্পাসে অবরুদ্ধ চুয়েটের নবনিযুক্ত ভিসি", 11.7),
    v("maasranga", "অবরুদ্ধ অবস্থায় শিক্ষার্থীদের উদ্দেশ্যে চুয়েট ভিসি যা বললেন", 12.4),
    v("rtv", "ক্যাম্পাস ত্যাগের আলটিমেটাম পার হতেই অবরুদ্ধ চুয়েট উপাচার্য", 12.5),
    ...[
      "জাপানে প্রবাসী বাংলাদেশিদের নতুন উদ্যোগ, ঘরে বসেই অনলাইন ব্যবসা",
      "জ্বালানি সংকটে বিনিয়োগে অনাগ্রহ বিদেশিদের",
      "দখল-দূষণে মৃতপ্রায় খাকদোন নদী, ২০ কোটি টাকায় খননের উদ্যোগ",
      "কিলবিল করা এই মাছ খেতে এত পাগল কেন জাপানিরা?",
      "নাটোরে নজর কেড়েছে ভুট্টা সাবুদানায় তৈরি প্রতিমা",
      "শ্রীমঙ্গলে শুরু হয়েছে নবদূর্গা পূজা",
      "সৌদি আরব ও হুতিদের সামরিক শক্তির তুলনা",
      "ক্ষেপণাস্ত্র ছুড়েছে উত্তর কোরিয়া; নিন্দা দক্ষিণ কোরিয়া, জাপানের",
      "ঢাকায় ১২ নভেম্বর টেক্সটাইল ইনোভেশন এক্সপো",
      "অর্থনীতিতে নোবেল পেলেন রবার্ট ই. হল ও মাইকেল উডফোর্ড",
    ].map((title, i) => v(`filler${i}`, title, 1 + i)),
    // A day's worth of other videos, so how common a word is counts as on a real day (~750 videos).
    ...Array.from({ length: 700 }, (_, i) => v(`day${i % 30}`, `item${i} topic${i % 97}`, (i % 24) + 0.5)),
  ];
  const videos = [...fire, ...others].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
  const groups = groupVideos(videos).filter((g) => g.videos.length > 1);
  const ids = (list: Video[]) =>
    list
      .map((x) => x.id)
      .sort()
      .join();
  assert.ok(
    groups.some((g) => ids(g.videos) === ids(fire)),
    "the fire is one story",
  );
  const cuet = videos.filter((x) => /চুয়েট/.test(x.title));
  assert.ok(
    groups.some((g) => ids(g.videos) === ids(cuet)),
    groups.map((g) => g.videos.map((x) => x.title).join(" | ")).join("\n"),
  );
  assert.equal(groups.length, 2, groups.map((g) => g.videos.map((x) => x.title).join(" | ")).join("\n"));
});

test("Videos about the same news group across channels; different events don't", () => {
  const now = Date.parse("2026-10-12T19:00:00Z");
  let n = 0;
  const v = (channel: string, title: string, hoursAgo = 1): Video => ({
    id: `v${n++}`,
    channel,
    title,
    publishedAt: new Date(now - hoursAgo * 3600_000).toISOString(),
  });
  const videos = [
    v("ntv", "তালা ভে/ঙে চেয়ারে বসলেন চুয়েটের নতুন উপাচার্য, শিক্ষার্থীদের ক্ষোভ", 1),
    v("dbc", "শিক্ষার্থীদের আন্দোলনের মধ্যেই তালা ভেঙে চুয়েটে নতুন উপাচার্য", 1.2),
    v("mytv", "চুয়েটে শাটডাউনের মধ্যেই তালা ভেঙে নিজ দপ্তরে প্রবেশ করলেন নতুন উপাচার্য", 2),
    v("dbc", "অর্থনীতিতে নোবেল পেলেন যুক্তরাষ্ট্রের রবার্ট ই হল ও মাইকেল উডফোর্ড", 3),
    v("itv", "অর্থনীতিতে নোবেল পেলেন রবার্ট ই. হল ও মাইকেল উডফোর্ড", 2.5),
    // Same people, different outcomes: two events.
    v("ekushey", "নারায়ণগঞ্জে গো/লা/গু/লি/তে 'শীর্ষ স/ন্ত্রা/সী' নি/হ/ত", 1),
    v("jamuna", "নারায়ণগঞ্জের শীর্ষ সন্ত্রাসী কোবরা গ্রুপের প্রধান সোহেল গ্রেফতার", 1.5),
    // Same person, different stories.
    v("mohona", "নারী-শিশু ধ/র্ষ/ণ ও সহিংসতায় আইনের কঠোর প্রয়োগ জরুরী: রাষ্ট্রপতি মির্জা ফখরুল ইসলাম আলমগীর", 1),
    v("ntv", "রাষ্ট্রপতি মির্জা ফখরুলের আসনে বিএনপি-জামায়াত দ্বিমুখী লড়াইয়ের আভাস", 1.1),
    // Bulletins from different channels.
    v("atn-bangla", "এটিএন বাংলার সন্ধ্যা ৬ টার সংবাদ", 0.5),
    v("banglavision", "সন্ধ্যার বাংলাভিশন সংবাদ", 0.6),
    v("deepto", "দীপ্ত দুপুরের সংবাদ · ১২ অক্টোবর ২০২৬", 4),
    v("mohona", "মোহনা সংবাদ · তারিখ: ১২ অক্টোবরর ২০২৬", 4.2),
    // Same day, unrelated dates.
    v("boishakhi", "ঢাকায় ১২ নভেম্বর টেক্সটাইল ইনোভেশন এক্সপো", 6),
    v("somoy", "ফেরদৌসী আহমেদ মিষ্টির শূন্য আসনে উপনির্বাচন ১২ নভেম্বর", 6.5),
    // A story told twice, more than 12 hours apart.
    v("somoy", "ইউরোপে বাংলাদেশি শ্রমিক নিয়োগে নতুন চুক্তি সই", 1),
    v("rtv", "ইউরোপে বাংলাদেশি শ্রমিক নিয়োগে নতুন চুক্তি সই", 20),
    // Filler, so word weights are like a real day's.
    ...[
      "জাপানে প্রবাসী বাংলাদেশিদের নতুন উদ্যোগ, ঘরে বসেই অনলাইন ব্যবসা",
      "জ্বালানি সংকটে বিনিয়োগে অনাগ্রহ বিদেশিদের",
      "দখল-দূষণে মৃতপ্রায় খাকদোন নদী, ২০ কোটি টাকায় খননের উদ্যোগ",
      "কিলবিল করা এই মাছ খেতে এত পাগল কেন জাপানিরা?",
      "নাটোরে নজর কেড়েছে ভুট্টা সাবুদানায় তৈরি প্রতিমা",
      "শ্রীমঙ্গলে শুরু হয়েছে নবদূর্গা পূজা",
      "সৌদি আরব ও হুতিদের সামরিক শক্তির তুলনা",
      "ক্ষেপণাস্ত্র ছুড়েছে উত্তর কোরিয়া; নিন্দা দক্ষিণ কোরিয়া, জাপানের",
    ].map((title, i) => v(`filler${i}`, title, 2 + i)),
  ].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));

  const titles = (ids: string[]) => ids.map((id) => videos.find((x) => x.id === id)!.channel).sort().join(",");
  const groups = groupVideos(videos)
    .filter((g) => g.videos.length > 1)
    .map((g) => titles(g.videos.map((x) => x.id)));
  assert.deepEqual(groups.sort(), ["dbc,itv", "dbc,mytv,ntv"]);

  // Tagged with the newest video's id, in the feed's order; everything else untouched.
  const tagged = tagStories(videos);
  assert.equal(tagged.length, videos.length);
  const cuet = tagged.filter((x) => x.title.includes("চুয়েট"));
  assert.ok(cuet.every((x) => x.story === cuet[0].id));
  assert.equal(tagged.filter((x) => x.story).length, 5);
  assert.deepEqual(
    tagged.map((x) => x.id),
    videos.map((x) => x.id),
  );
});

test("Headlines build up across runs: the last 72 hours kept, the newest 300 of 48 hours on the board", () => {
  const now = Date.parse("2026-10-07T12:00:00Z");
  const at = (hoursAgo: number) => new Date(now - hoursAgo * 3600_000).toISOString();
  const it = (link: string, hoursAgo?: number, title = link, seen = false): NewsItem => ({
    title,
    link: `https://example.com/${link}`,
    ...(hoursAgo === undefined ? {} : seen ? { seenAt: at(hoursAgo) } : { publishedAt: at(hoursAgo) }),
    sourceId: "x",
    sourceName: "X",
    lang: "en",
    category: "national",
  });
  const kept = [it("old", 80), it("b", 2, "old title"), it("c", 50), it("d", 5, "d", true), it("undated")];
  assert.deepEqual(
    mergeNews([it("a", 1), it("b", 2, "new title"), it("stale", 100), it("e")], kept, now).map(
      (x) => `${x.link.slice(20)}:${x.title}`,
    ),
    // Undated ones last, and only while this fetch still has them.
    ["a:a", "b:new title", "d:d", "c:c", "e:e"],
  );
  assert.deepEqual(mergeNews([], kept, now).map((x) => x.title), ["old title", "d", "c"]);
  // Re-dated (Google News, after an edit): the first time stays. The same headline at another address: once.
  const redated = mergeNews([it("c", 1), it("c2", 0.5, "c")], kept, now);
  assert.equal(redated.find((x) => x.title === "c")?.publishedAt, at(50));
  assert.equal(redated.filter((x) => x.title === "c").length, 1);
  const many = mergeNews(Array.from({ length: 700 }, (_, i) => it(`m${i}`, i / 10)), [], now);
  assert.equal(many.length, 700);
  const result: SourceResult = {
    sourceId: "x",
    sourceName: "X",
    method: "sitemap",
    fetchedAt: new Date(now).toISOString(),
    ok: true,
    count: 700,
    durationMs: 0,
    items: many,
  };
  assert.deepEqual(forBoard(result, now).items, many.slice(0, 300));
  assert.equal(forBoard({ ...result, items: many.slice(0, 5) }, now).items.length, 5);
  // Older than 48 hours: kept for the day files, not on the board. Undated: on the outlet's page now.
  const aged = { ...result, items: [it("new", 1), it("two-days", 47), it("three-days", 60), it("undated")] };
  assert.deepEqual(forBoard(aged, now).items.map((x) => x.title), ["new", "two-days", "undated"]);
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
  // The site's own addition, on most of its titles, goes; a headline naming the paper in passing stays.
  const bss = (id: string, title: string) => item(id, `${title} | আন্তর্জাতিক | বাংলাদেশ সংবাদ সংস্থা (বাসস)`, "বাসস", "https://bssnews.net");
  const suffixed = `<?xml version="1.0"?><rss version="2.0"><channel>
    ${bss("a", "গাজায় ত্রাণ পৌঁছাল আজ সকালে")}${bss("b", "জাপানে ভূমিকম্পে নিহত তিন")}${bss("c", "ইউরোপে তাপপ্রবাহ চলছেই")}
    ${item("d", "কর্মীদের বেতন বাড়াল বাসস কর্তৃপক্ষ", "বাসস", "https://bssnews.net")}
  </channel></rss>`;
  assert.deepEqual(parseGoogleNewsFeed(suffixed, "bssnews.net").map((e) => e.title), [
    "গাজায় ত্রাণ পৌঁছাল আজ সকালে",
    "জাপানে ভূমিকম্পে নিহত তিন",
    "ইউরোপে তাপপ্রবাহ চলছেই",
    "কর্মীদের বেতন বাড়াল বাসস কর্তৃপক্ষ",
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
  assert.equal(looksLikeArticle("https://www.kalerkantho.com/topic/770"), false);
  assert.equal(looksLikeArticle("https://www.kalerkantho.com/archive/2026-10-13"), false);
  assert.equal(looksLikeArticle("https://www.kalbela.com/video-gallery/123"), false);
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

test("Packed files: the same headlines back, and a delta that turns one build into the next", () => {
  const item = (source: string, n: number, extra: Partial<NewsItem> = {}): NewsItem => ({
    title: `${source} ${n}`,
    link: `https://${source}.com/${n}`,
    publishedAt: new Date(Date.UTC(2026, 9, 13, 10, 0, n)).toISOString(),
    sourceId: source,
    sourceName: source.toUpperCase(),
    lang: source === "a" ? "bn" : "en",
    category: "national",
    ...extra,
  });
  const result = (source: string, items: NewsItem[]): SourceResult => ({
    sourceId: source,
    sourceName: source.toUpperCase(),
    method: "rss",
    ok: true,
    count: items.length,
    durationMs: 1,
    fetchedAt: "2026-10-13T10:00:00.000Z",
    items,
  });
  // (As the files would have them: no keys set to undefined.)
  const feed = (at: string, results: SourceResult[]): NewsFeed =>
    JSON.parse(JSON.stringify({ generatedAt: at, results, logos: {}, logoShapes: {} }));
  // Undated, first seen (with milliseconds), dated: all as they were.
  const undated = item("a", 9, { publishedAt: undefined });
  const seen = item("a", 8, { publishedAt: undefined, seenAt: "2026-10-13T09:59:58.123Z" });
  const one = feed("2026-10-13T10:00:00.000Z", [result("a", [item("a", 3), seen, undated]), result("b", [item("b", 1)]), result("c", [])]);
  assert.deepEqual(unpackFeed(JSON.parse(JSON.stringify(packFeed(one)))), one);

  // The next build: new headlines on top, one gone, one retitled, one source new, one source gone.
  const two = feed("2026-10-13T10:15:00.000Z", [
    result("a", [item("a", 5), item("a", 4), item("a", 3), undated]),
    result("b", [item("b", 1, { title: "b one, corrected" })]),
    result("d", [item("d", 1)]),
  ]);
  const delta = JSON.parse(JSON.stringify(makeDelta(one, two)));
  assert.deepEqual(delta.results[0].items.slice(2), [[0, 1], [2, 1]]);
  const applied = applyDelta(one, delta);
  assert.deepEqual(applied, two);
  // Headlines the board had are the same objects, so their cards don't redraw.
  assert.equal(applied?.results[0].items[2], one.results[0].items[0]);
  // A board on another build, or whose headlines don't fit the runs, loads the whole feed instead.
  assert.equal(applyDelta({ ...one, generatedAt: "2026-10-13T09:45:00.000Z" }, delta), null);
  assert.equal(applyDelta({ ...one, results: [result("a", [])] }, delta), null);

  // Day files by outlet, newest first again; ones written before packing still read.
  const day = { date: "2026-10-13", items: [item("b", 7), item("a", 6), item("b", 5), item("a", 4)] };
  assert.deepEqual(unpackDay(JSON.parse(JSON.stringify(packDay(day)))), day);
  assert.equal(unpackDay(day), day);
});

test("page posts: slots are due once, in their window, scheduled ahead in review", () => {
  const slots = parseSlots("08:00, 13:00 video");
  const at = (hhmm: string) => Date.parse(`2026-10-15T${hhmm}:00+06:00`);
  assert.equal(dueSlot(at("07:59"), [], slots, 0), null);
  assert.deepEqual(dueSlot(at("08:10"), [], slots, 0), { slot: at("08:00"), at: at("08:10"), content: "headlines" });
  assert.equal(dueSlot(at("09:05"), [], slots, 0), null, "a run more than an hour late leaves the slot");
  const posted = [{ slot: new Date(at("08:00")).toISOString() } as PostRecord];
  assert.equal(dueSlot(at("08:20"), posted, slots, 0), null, "one post per slot");
  // Review: 45 minutes ahead, never less than 15 minutes from now.
  const lead = 45 * 60_000;
  assert.deepEqual(dueSlot(at("12:15"), [], slots, lead), { slot: at("13:00"), at: at("13:00"), content: "video" });
  assert.deepEqual(dueSlot(at("12:50"), [], slots, lead), { slot: at("13:00"), at: at("13:05"), content: "video" });
  // Just after midnight in Dhaka, the night before's slots are still the night before's.
  assert.deepEqual(dueSlot(Date.parse("2026-10-15T23:30:00+06:00"), [], parseSlots("23:00"), 0)?.slot, Date.parse("2026-10-15T23:00:00+06:00"));
  assert.deepEqual(parseSlots("21:30 Roundup, 8:00, bad, 25:00, 9:15 video, 7:00 news"), [
    { time: "07:00", content: "news" },
    { time: "08:00", content: "headlines" },
    { time: "09:15", content: "video" },
    { time: "21:30", content: "roundup" },
  ]);
  assert.equal(parseSlots(""), SLOTS);
  assert.deepEqual(
    [...new Set(SLOTS.map((s) => s.content))].map((c) => SLOTS.filter((s) => s.content === c).length),
    [5, 3, 2],
    "five headlines, three videos, two roundups",
  );
});

test("page posts: sensitive headlines", () => {
  assert.ok(isSensitive("কিশোরীকে ধর্ষণের অভিযোগে গ্রেপ্তার"));
  assert.ok(isSensitive("Student commits suicide in Rajshahi"));
  assert.ok(!isSensitive("প্রশ্নপত্র ফাঁসের অভিযোগে পরীক্ষা স্থগিত"));
  assert.ok(!isSensitive("Grape exports rise"));
});

test("page posts: the most covered fresh story, an outlet in turn, no repeats", () => {
  const now = Date.parse("2026-10-15T07:00:00Z");
  const ago = (min: number) => new Date(now - min * 60_000).toISOString();
  const story = (title: string, sources: string[], extra: Partial<NewsItem> = {}, heat = sources.length): Story => {
    const items = sources.map((s) => item(s, title, { publishedAt: ago(30), category: "national", ...extra }));
    return { id: items[0].link, lead: items[0], items, outlets: sources.length, latest: ago(30), heat };
  };
  const big = story("সেতুর উদ্বোধন আজ পদ্মায়", ["a", "b", "c", "d"]);
  const small = story("নতুন বাজেট সংসদে পেশ", ["a", "b", "c"], { category: "business" });
  const stale = story("পুরোনো খবর অনেক আগের", ["a", "b", "c", "d", "e"]);
  stale.latest = ago(300);
  const two = story("দুটি পত্রিকার খবর এখানে", ["a", "b"]);
  const grim = story("নদীতে ঝুলন্ত মরদেহ উদ্ধার", ["a", "b", "c", "d", "e", "f"]);
  const stories = [grim, stale, two, big, small];
  const options = { now, at: now, history: [] as PostRecord[], hasPicture: () => true };

  const first = pickStory(stories, options)!;
  assert.equal(first.story, big);
  assert.equal(first.item.sourceId, "a", "the lead's outlet among equals");
  assert.equal(postMessage(first), "সেতুর উদ্বোধন আজ পদ্মায়\n\na · আরও ৩টি সংবাদমাধ্যমেও এই খবর");

  // Posted: not again, and the next post credits an outlet not credited yet.
  const history = [postRecord(first, { kind: "slot", at: new Date(now - 3600_000).toISOString(), link: "", mode: "on" })];
  const second = pickStory(stories, { ...options, history })!;
  assert.equal(second.story, small);
  assert.equal(second.item.sourceId, "b");
  // Too close to the last post.
  assert.equal(pickStory(stories, { ...options, history, at: now - 3600_000 + 10 * 60_000 }), null);
  // No picture, no post.
  assert.equal(pickStory([big], { ...options, hasPicture: () => false }), null);
  assert.equal(pickStory([big], { ...options, hasPicture: (it) => it.sourceId === "c" })?.item.sourceId, "c");
  // The same subject from another cluster isn't posted again either.
  const again = story("পদ্মায় সেতুর উদ্বোধন আজ বিকেলে", ["e", "f", "g"]);
  assert.equal(pickStory([again], { ...options, history }), null);
  // Breaking: only big, new stories.
  assert.equal(pickStory([big], { ...options, breaking: true }), null);
  const breaking = story("বড় খবর এইমাত্র", ["a", "b", "c", "d", "e", "f", "g", "h"]);
  assert.equal(pickStory([breaking], { ...options, breaking: true })?.story, breaking);
});

test("page posts: sections take turns and keep to their daily caps", () => {
  const now = Date.parse("2026-10-15T07:00:00Z");
  const items = ["a", "b", "c"].map((s, i) => item(s, "খবর", { category: i ? "politics" : "other" }));
  const story: Story = { id: "x", lead: items[0], items, outlets: 3, latest: new Date(now).toISOString(), heat: 3 };
  assert.equal(storySection(story), "politics");
  const posted = (h: number, category: PostRecord["category"]): PostRecord => ({
    kind: "slot", at: new Date(now - h * 3600_000).toISOString(), title: "", link: "", sourceId: "z", category, keys: [], words: [], mode: "on",
  });
  const options = { now, at: now, hasPicture: () => true };
  assert.equal(pickStory([story], { ...options, history: [posted(2, "politics"), posted(4, "politics")] }), null);
  assert.equal(pickStory([story], { ...options, history: [posted(2, "politics")] })?.story, story);
});

test("page posts: videos two or more channels have, a channel in turn, no repeats across headlines", () => {
  const now = Date.parse("2026-10-15T08:00:00Z");
  const ago = (min: number) => new Date(now - min * 60_000).toISOString();
  let n = 0;
  const video = (channel: string, title: string, min: number, extra: Partial<Video> = {}): Video => ({
    id: `vid${String(++n).padStart(8, "0")}`, channel, title, publishedAt: ago(min), ...extra,
  });
  const fire = [video("somoy", "চকবাজারে কারখানায় আ/গু/ন, নিয়ন্ত্রণে ১০ ইউনিট", 30, { story: "f", views: 9000 }), video("jamuna", "চকবাজারে কারখানায় আগুন নিয়ন্ত্রণে", 60, { story: "f" }), video("ntv", "চকবাজারের আগুন নিয়ন্ত্রণে ১০ ইউনিট", 90, { story: "f" })];
  const bank = [video("channel24", "ন্যাশনাল ব্যাংক আমানতকারীদের টাকা ফেরত দিচ্ছে", 40, { story: "b" }), video("ekhon", "আমানতকারীদের টাকা ফেরত দিচ্ছে ন্যাশনাল ব্যাংক", 50, { story: "b" })];
  const grim = [video("rtv", "কিশোরীকে ধ/র্ষ/ণ, গ্রেপ্তার ১", 20, { story: "g" }), video("itv", "কিশোরীকে ধর্ষণের অভিযোগ", 25, { story: "g" })];
  const alone = video("dbc", "একটি চ্যানেলের ভিডিও খবর একা", 10, { views: 50_000 });
  const old = [video("somoy", "পুরোনো ভিডিও খবর গতকালের", 600, { story: "o" }), video("ntv", "পুরোনো ভিডিও খবর গতকালের", 610, { story: "o" })];
  const stories = videoStories([...grim, alone, ...fire, ...bank, ...old], now);
  assert.equal(stories.find((s) => s.id === "f")?.channels, 3);
  const options = { now, at: now, history: [] as PostRecord[] };

  const first = pickVideo(stories, options)!;
  assert.equal(first.story.id, "f", "most channels; the sensitive one (masked) and the single-channel one left out");
  assert.equal(first.video.channel, "somoy", "most watched among channels never credited");
  assert.equal(videoMessage(first), "চকবাজারে কারখানায় আগুন, নিয়ন্ত্রণে ১০ ইউনিট\n\nসময় টিভি · আরও ২টি চ্যানেলেও এই খবর");

  const history = [videoRecord(first, { kind: "slot", at: ago(60), link: "", mode: "on" })];
  assert.equal(pickVideo(stories, { ...options, history })?.story.id, "b");
  // A headline already posted on the same subject: its videos wait.
  const headline: PostRecord = { kind: "slot", content: "news", at: ago(120), title: "", link: "", sourceId: "x", category: "national", keys: [], words: keywords("আমানতকারীদের টাকা ফেরত দিচ্ছে ন্যাশনাল ব্যাংক"), mode: "on" };
  assert.equal(pickVideo(stories, { ...options, history: [...history, headline] }), null);

  // A roundup: one card per story, each from another channel; a much-watched single-channel video fills in.
  const cards = pickRoundup(stories, options);
  assert.deepEqual(cards.map((c) => c.story.id), ["f", "b", alone.id]);
  assert.equal(new Set(cards.map((c) => c.video.channel)).size, 3);
  assert.equal(roundupHeading(Date.parse("2026-10-15T21:00:00+06:00"), 5), "রাতের শীর্ষ ৫ ভিডিও খবর");
  assert.match(roundupMessage(cards, now), /^দুপুরের শীর্ষ ৩ ভিডিও খবর\n\n১\. চকবাজারে.*— সময় টিভি\n২\. /);
  const roundup = roundupRecord(cards, { kind: "slot", at: ago(60), link: "", mode: "on" });
  // Its stories aren't posted again as videos; too few left for another roundup.
  assert.equal(pickVideo(stories, { ...options, history: [roundup] }), null);
  assert.deepEqual(pickRoundup(stories, { ...options, history: [roundup] }), []);
});

test("outlet profiles: every outlet page has one in each language, and a description that fits", () => {
  const bangla = /[ঀ-৿]/;
  for (const o of OUTLETS) {
    const p = OUTLET_PROFILES[o.id];
    assert.ok(p, `${o.id} has no profile`);
    assert.ok(!bangla.test(p.en), `${o.id}: the English profile has Bangla letters`);
    assert.ok(bangla.test(p.bn), `${o.id}: the Bangla profile is not in Bangla`);
    for (const text of [p.en, p.bn]) assert.ok(text.length >= 60 && text.length <= 700, `${o.id}: profile length ${text.length}`);
    if (p.since) assert.ok(p.since > 1900 && p.since <= 2026, `${o.id}: since ${p.since}`);
    for (const locale of ["en", "bn"] as const) {
      const d = outletDescription(o, locale);
      assert.ok(d.length <= 170, `${o.id} (${locale}) description is ${d.length} characters: ${d}`);
    }
  }
  assert.deepEqual(Object.keys(OUTLET_PROFILES).filter((id) => !OUTLETS.some((o) => o.id === id)), [], "profiles of no outlet");
});

test("page posts: five headlines in a carousel, each outlet once, two a section at most", () => {
  const now = Date.parse("2026-10-15T07:00:00Z");
  const ago = (min: number) => new Date(now - min * 60_000).toISOString();
  const story = (title: string, sources: string[], category: NewsItem["category"], heat: number): Story => {
    const items = sources.map((s) => item(s, title, { publishedAt: ago(20), category }));
    return { id: items[0].link, lead: items[0], items, outlets: sources.length, latest: ago(20), heat };
  };
  const stories = [
    story("প্রথম খবর সেতু উদ্বোধন", ["a", "b", "c"], "national", 9),
    story("দ্বিতীয় খবর বন্যা পরিস্থিতি", ["a", "b", "c"], "national", 8),
    story("তৃতীয় খবর ট্রেন দুর্ঘটনা", ["a", "b", "d"], "national", 7),
    story("চতুর্থ খবর ক্রিকেট জয়", ["a", "e", "f"], "sports", 6),
    story("পঞ্চম খবর বাজেট ঘোষণা", ["b", "g", "h"], "business", 5),
    story("ষষ্ঠ খবর নির্বাচন কমিশন", ["c", "i", "j"], "politics", 4),
  ];
  const options = { now, at: now, history: [] as PostRecord[], hasPicture: () => true };
  const cards = pickHeadlines(stories, options);
  assert.equal(cards.length, 5);
  assert.deepEqual(cards.map((c) => c.story.lead.title.split(" ")[0]), ["প্রথম", "দ্বিতীয়", "চতুর্থ", "পঞ্চম", "ষষ্ঠ"], "a third national story waits");
  assert.equal(new Set(cards.map((c) => c.item.sourceId)).size, 5, "each outlet once");
  assert.match(headlinesMessage(cards, Date.parse("2026-10-15T22:30:00+06:00")), /^রাতের শীর্ষ ৫ খবর\n\n১\. প্রথম খবর সেতু উদ্বোধন — a\n২\. /);
  // Posted: those stories don't come back; too few left for five.
  const record = headlinesRecord(cards, { kind: "slot", at: ago(120), link: "", mode: "on" });
  assert.deepEqual(pickHeadlines(stories, { ...options, history: [record] }), []);
  // Fewer than five stories with pictures: none (a single headline goes out instead).
  assert.deepEqual(pickHeadlines(stories, { ...options, hasPicture: (it) => ["c", "d", "e"].includes(it.sourceId) }), []);
});

console.log(`\n${passed} passed${process.exitCode ? ", some failed" : ""}`);
