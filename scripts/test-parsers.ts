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
import { compactCount, fullTime, timeAgo } from "../src/components/time";
import { articleUrl } from "../src/lib/article";
import { canonicalLink, cleanTitle, dedupeByLink, parseDate, resolveUrl, shiftDhakaAsUtc } from "../src/lib/fetchers/utils";
import { DEFAULT_FILTERS, filtersToSearch, parseFilters } from "../src/lib/filters";
import { stampFirstSeen } from "../src/lib/first-seen";
import { findLogoCandidates } from "../src/lib/logos";
import { forBoard, mergeNews, newsQueryFrom } from "../src/lib/news";
import { fallbackNote, sourceProblem } from "../src/lib/problems";
import { SHARE_TARGETS, sharedVideoId, sharePath, videoSharePath } from "../src/lib/share";
import { byDay, keptDates, mergeDay } from "../src/lib/archive";
import { compileSearch, installSearchTerms } from "../src/lib/search";
import { SEARCH_TERMS } from "../src/lib/search-terms";
import { findStories, keywords } from "../src/lib/stories";
import type { NewsItem, NewsSource, SourceResult, SourceStatus, Video } from "../src/lib/types";
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

test("share targets put the link and title in the URL", () => {
  const url = "https://bartaboard.test/s/www.prothomalo.com/a?b=1&c";
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

test("Headlines build up across runs: the last 72 hours kept, the newest 300 on the board", () => {
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
  assert.deepEqual(forBoard(result).items, many.slice(0, 300));
  assert.equal(forBoard({ ...result, items: many.slice(0, 5) }).items.length, 5);
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

console.log(`\n${passed} passed${process.exitCode ? ", some failed" : ""}`);
