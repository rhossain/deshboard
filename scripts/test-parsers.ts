/**
 * Offline tests for the parsers (no network needed): npm test
 */
import assert from "node:assert/strict";
import { categorize } from "../src/lib/categories";
import { extractHeadlines } from "../src/lib/fetchers/html";
import { parseFeed } from "../src/lib/fetchers/rss";
import { parseNewsSitemap } from "../src/lib/fetchers/sitemap";
import { parseDate } from "../src/lib/fetchers/utils";

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
  assert.deepEqual(items, [{ title: "Atom title here", link: "https://site.test/news/1", publishedAt: "2026-10-04T10:00:00.000Z" }]);
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

console.log(`\n${passed} passed${process.exitCode ? ", some failed" : ""}`);
