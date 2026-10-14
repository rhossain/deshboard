# SEO: audit and plan

> **Note for the `main` branch.** This audit was made against `static-export`, the build that serves
> bartaboard.com today (Cloudflare Pages). The SEO plan covers both branches: every page, title, heading,
> structured-data and sitemap change is ported to `main` as well. Where `main` differs:
>
> - The feed comes from `/api/news` and `/api/news/stream` (in-memory cache, refreshed in the background),
>   not from `data/news.json`; the page-weight figures in P2 #12 are for the static build.
> - Shared links are a real route, `/s/[...url]`, which sets `noindex` itself, where the static
>   build uses `404.html`.
> - Hosting items (HSTS, Crawler Hints, cache headers, `www` → apex) are Cloudflare settings. They apply
>   to `main` only once it runs behind Cloudflare, e.g. when the planned Node server takes over the domain.
> - Search Console and Bing are per domain, not per branch: nothing to repeat when `main` goes live.

Audited 11 October 2026 against the `static-export` branch and the live site at https://bartaboard.com.
Companion to `docs/services.md` (which dashboard holds what) and `README.md` (`SITE_URL`, sitemap, robots).

## Progress (12 October 2026)

Sections 1–3 are the audit as it stood on 11 October. Each issue in section 3 and each plan item in
section 4 now carries its status: ✅ done, 🟡 partly done, ⬜ open, 🔁 ongoing.

- ✅ **Done:** Search Console and Bing set up, sitemap submitted, Crawler Hints and HSTS on (#1, #2, #4–#6).
  All on-page work: H1 and headings, titles and descriptions, freshness markup, small fixes (#7–#11).
  New pages: `/videos/`, `/sources/`, `/about/`, intros and the FAQ, and 80 per-outlet pages
  (#12–#18). RSS feeds (#19). Speed (#20: the logo fix, the feed split, and a layout shift on Bangla
  section pages). The Bangla version of every indexable page (#21).
- 🟡 **Partly done:** indexing requests (#3: 10 of the 12 sections; `/news/crime/`, `/news/opinion/` and the
  new pages not yet requested).
- ⬜ **Open:** links and presence off the site (#22), and the monthly Search Console
  review (#23). `Organization.sameAs` and `twitter:site` wait for the first social profile.

## Recheck (13 October 2026, after the videos and tour work)

Lighthouse 12.8.2 run locally against the live site, simulated mid-range phone on slow 4G unless marked
desktop. "Before" is the live site that morning; the scores are the live site after the fixes below deployed
(10:30 UTC). Search Console and SEO checks on the live site.

| Page | Performance | SEO | Accessibility | Best practices | LCP | TBT | CLS |
|---|---|---|---|---|---|---|---|
| `/` (desktop) | 98 → 97 | 100 | 100 | 100 | 1.0 s | 0 ms | 0.001 → 0 |
| `/videos/` (desktop) | 74 → 98 | 100 | 100 | 100 | 2.3 → 1.1 s | 0 ms | 0.126 → 0 |
| `/` | 70 → 84 | 100 | 100 | 100 | 4.5 s | 460 → 50 ms | 0 |
| `/bn/` | 99 → 87 | 100 | 100 | 100 | 1.7 → 4.1 s | 70 → 20 ms | 0 |
| `/news/sports/` | 64 → 93 | 100 | 100 | 100 | 2.5 → 3.2 s | 2,730 → 20 ms | 0 |
| `/videos/` | 74 → 89 | 100 | 100 | 100 | 6.1 → 3.6 s | 70 → 20 ms | 0.007 → 0 |
| `/bn/videos/` | 75–76 | 100 | 100 | 100 | 5.1–5.2 s | 50 ms | 0 |
| `/sources/` | 97 → 97 | 100 | 100 | 100 | 2.6 s | 40 → 10 ms | 0 |
| `/sources/prothomalo/` | 92 → 84 | 100 | 100 | 100 | 3.3 → 4.4 s | 30 → 20 ms | 0 |
| `/about/` | 99 → 84–97 | 100 | 100 | 100 | 2.0 → 2.5–4.4 s | 30 → 60 ms | 0 |

**Read the phone scores as a range, not a number.** The same page moves 10–20 points between runs here
(`/about/`, 65 elements and no change, scored 97, 86 and 84 in three runs), so drops like `/bn/` and
`/sources/prothomalo/` above are the machine and the network, not the page. What the fixes did change shows
in every run: the Videos page's layout shift is gone, and its LCP no longer waits for a script.
`/bn/videos/` scores lower than `/videos/` in every run, but timed in Chrome (4× CPU slowdown) it paints
as fast (0.44–0.90 s against 0.38–0.74 s); the difference is Lighthouse's simulation.

**The headline feed** (deployed 11:45 UTC, measured on the live site with Cloudflare's own compression):

| Download | Before | After |
|---|---|---|
| Full feed, first load (search, Top stories, Latest, filters) | ≈ 1,000 KB, 15,265 headlines | 754 KB, 12,130 headlines |
| Each 15-minute refresh in a tab that has it | ≈ 1,000 KB, the whole feed again | 15 KB (`delta.json`) |
| Head file (plain visits) | ≈ 43 KB | 40 KB |
| A day file (search past the board) | ≈ 509 KB (gzip, measured locally) | 437 KB |

The board's feed now holds 48 hours, not 72 (the day files still hold every headline for 30 days, so search and
shared links reach as far back), headlines are packed (`src/lib/packed.ts`), and an open tab applies the build's
changes instead of downloading the feed again. Checked in a live browser across the 12:01 build: Refresh
downloaded only `delta.json` and said "Showing the latest". The old addresses (`/data/news.json`, `/data/head/`,
`/data/days/`) still answer with Cloudflare's copies from before the change, so tabs open on older code keep
their headlines until they reload.

**Blocking time swings from run to run on this machine** (80 → 890 ms on `/`, 30 → 2,730 ms on
`/news/sports/`): the long tasks in those traces have no script in them, so they are the laptop, not the page.
A CPU profile of the section page at 4× slowdown shows two long tasks, 142 and 89 ms, all hydration.

**Fixed: the Videos page prerendered as its skeleton.** The Videos view was a lazy download inside a Suspense
boundary, and React writes a large finished boundary at the end of the page with the fallback in its place
until a script swaps it in. So the first paint showed eight grey rows, the intro under them jumped down
three times as the cards arrived (CLS 0.127 on desktop), and the first thumbnail was the LCP only after the
swap (6.1 s simulated). The Videos pages now load the view with the page (`VideosPageBoard`) and render it
without a boundary; elsewhere it is still fetched only when the reader heads for it.

**Fixed, accessibility** (Lighthouse scored 100 throughout; these are what it doesn't check):
- Light theme contrast: `--gold` `#a9802f` → `#7d5c1e` (dates, step counter, rank numbers, "N new", "New":
  2.8–3.6:1 → 4.5–5.6:1) and `--muted` `#6a6d73` → `#63666c` (4.48 → 4.97:1 on `surface-2`). The ⋮ and
  pin buttons and the tab counts dropped their faded `/60` and `/80` text.
- The "Updated N min ago" line was inside a live region, so screen readers announced it every minute. Only
  loading and notices are announced now.
- A search announces what it found ("151 headlines found", "Nothing found") from one status line.
- The tour reads each step out as it changes, and focus goes to the page when the invitation that started
  it is gone. The shared-video player takes focus when Play replaces it.
- `lang="bn"` sits on the headline text, not the whole link, so the time and outlet are read in the page's
  language. The Refresh and language links' names start with their visible words; pin, New and Back to top
  are in Bangla on Bangla pages; the Filters panel is a named dialog.

**Fixed, SEO:** the tech section's title was 69 characters; titles that would pass 60 drop "| Bartaboard".
"1 views" reads "1 view".

**Checked and right:** all 196 sitemap URLs answer 200, are their own canonical, are indexable, and have one H1;
titles and descriptions are unique; hreflang pairs on every page; JSON-LD parses; robots, 404s, `www` and
`http` redirects and `X-Robots-Tag: noindex` on `/data/` as before.

**Fixed, then:** a video story's panel came right after its card in the page but was drawn below the whole
row (a dense grid), so the keyboard went into it and then back up to the rest of the row. The open panel now
goes in a row of its own after the row's last card, in the page as on screen, and moves when the columns
change; the grid is no longer dense. "Copied", the "N new headlines/videos" buttons and a search in Videos
("12 videos found", "No videos found") are now announced.

## Recheck (12 October 2026, after the search work)

Lighthouse 12.8.2 run locally (PageSpeed Insights' free quota was used up), simulated mid-range phone on slow 4G
unless marked desktop. Live site, before the search changes deployed.

| Page | Performance | SEO | Accessibility | Best practices | LCP | TBT | CLS |
|---|---|---|---|---|---|---|---|
| `/` (desktop) | 99 | 100 | 100 | 100 | 0.9 s | 0 ms | 0 |
| `/` | 90–92 | 100 | 100 | 100 | 3.2 s | 30–50 ms | 0 |
| `/bn/` | 97 | 100 | 100 | 100 | 2.5 s | 20 ms | 0 |
| `/news/sports/` | 99 | 100 | 100 | 100 | 2.1 s | 10 ms | 0 |
| `/sources/` | 94 | 100 | 96 → 100 | 100 | 3.0 s | 20 ms | 0 |
| `/sources/prothomalo/` | 97 | 100 | 96 → 100 | 100 | 2.6 s | 10 ms | 0 |
| `/videos/` | 93 | 100 | 100 | 100 | 3.2 s | 20 ms | 0.003 |

**LCP is the one number over Google's 2.5 s line, and it is the simulation's, not the phone's.** The largest
element is a headline in the prerendered HTML; a trace shows it painted at first paint (0.1–0.2 s unthrottled)
and never again. Lighthouse's simulation assumes it waits for every request that starts before it, which
includes the JavaScript (about 180 KB compressed, mostly React and Next.js). Tried and rejected: not preloading
Noto Sans Bengali made first paint slower (1.2 → 2.0 s) and LCP no better. The search adds under 6 KB; loading
it on demand would save about 0.1 s of simulated time, not worth the complexity. Real users' numbers are in
Search Console → Core Web Vitals once there is enough traffic; those, not Lighthouse, are what Google ranks on.

**Search typing:** on the full board, typing "chittagong police" produced no input event over 16 ms and no long
task over 50 ms.

**On-page SEO, checked on nine pages:** one H1 each, unique titles of 48–60 characters, descriptions under
155, canonical and `en`/`bn`/`x-default` alternates on all, valid JSON-LD, 194 URLs in the sitemap. Search
URLs (`/?q=…`) canonicalise to the page, so they can't become duplicates.

**Fixed:** the counts on `/sources/` and the outlet pages were too faint (contrast 3.85:1, needs 4.5:1), and
the day files (other sites' titles) now send `X-Robots-Tag: noindex`: `/data/*` in `_headers` on
`static-export`, the `/data/days/` route here.

**Still open, and still what moves rankings:** links and presence off the site (#22) and the monthly Search
Console review (#23).

## 1. Where things stand

### Already right (verified on the live site)

| Area | Status |
|---|---|
| Canonical URLs | `https://bartaboard.com/…` on every indexable page; `?view=` / `?cat=` views canonicalise to the page |
| robots.txt | allows everything, names the sitemap, correct host |
| sitemap.xml | 15 URLs: board, 12 sections, privacy, terms |
| Meta robots | `index, follow, max-image-preview:large, max-snippet:-1` on indexable pages; `noindex` on `/health/`, `/account/`, `404.html` (so every shared `/s/…` link stays out of search) |
| Titles / descriptions | unique per section, bilingual (`Bangladesh Sports News Today (খেলা) · Bartaboard`) |
| Open Graph / Twitter | title, description, 1200×630 image, alt, locales `en_US` + `bn_BD` |
| Structured data | `WebSite` + `Organization` on the board; `CollectionPage` + `BreadcrumbList` on sections |
| Prerendered content | real headlines in the HTML (~170 links, ~24k characters of text on the board), not an empty shell |
| Language markup | `<html lang="en">`, every Bangla headline carries `lang="bn"` |
| Images | all 65 `<img>` have `alt` |
| Hosting | HTTPS, `www` → apex 301, trailing slashes consistent, hashed assets cached a year, HTML revalidated each visit, Brotli/gzip from Cloudflare, 404s return 404 |
| Old domain | `deshboard.rshossain.me` 301s to the new address path by path |
| PWA | manifest, icons, Apple meta |

### Not right

**The site is not in Google's index.** *(Resolved 11 October: Search Console verified, sitemap
submitted, and the board turned out to be indexed already; see `docs/services.md`.)* `site:bartaboard.com` returns nothing and a search for
"Bartaboard" finds no page of ours. Nothing in the repository or `docs/services.md` mentions Google
Search Console, so Google has most likely never been told the domain exists; with no inbound links it
has no other way to find it. Everything below matters only once that is fixed.

## 2. Honest expectations

"Bangladesh news" and "বাংলা খবর" are owned by Prothom Alo, The Daily Star, bdnews24, Google News and
Wikipedia: sites with twenty years of links. A new domain with no links will not take those spots in
months, whatever the on-page work. What is winnable, in order:

1. **Brand**: "bartaboard", "barta board" — first position within weeks of indexing.
2. **Aggregator intent**: people who want *all the papers in one place*: "all bangla newspaper",
   "all bangladeshi newspaper list", "bangladesh newspapers online", "bd news all in one",
   "সকল বাংলা পত্রিকা", "সব বাংলা সংবাদপত্র". Bartaboard is exactly this and most competitors here
   are old, thin directory sites. Page 1–2 within 2–3 months is realistic.
3. **Per-portal**: "prothom alo latest news", "daily star headlines today" — once per-source pages exist.
4. **TV news videos**: "bangla news video", "bangladesh tv news today", "somoy tv news today" — once
   `/videos/` and the channel pages exist. "<channel> live" belongs to YouTube itself; we can only
   point people to the channel's live stream.
5. **Section long-tail**: "bangladesh sports news today", "খেলার খবর আজ" — months 3–6.
6. **Head terms**: top 20 at best, and only with sustained links and original content.

Search volumes above are not verified; confirm them in Google Keyword Planner (free with an Ads
account) and, after a month, in Search Console's own query report, which is the only source that matters.

## 3. Issues, ranked

### P0: nobody can find the site *(fixed 11 October, plan items 1–6)*

1. **Not verified in Google Search Console, sitemap never submitted.** This is the whole problem today.
   ✅ **Done** (plan 1–3).
2. **Not in Bing Webmaster Tools.** Bing also feeds DuckDuckGo and the AI assistants' search.
   ✅ **Done** (plan 4).
3. **No measurement.** No Search Console data, and the privacy policy promises no analytics. Search
   Console is server-side on Google's end and needs nothing on the page, so it keeps that promise;
   Cloudflare Web Analytics (cookieless, no personal data) would be the one addition worth a privacy-page
   sentence if visit counts are wanted.
   ✅ **Done**: Search Console and Bing collect the data. Cloudflare Web Analytics added 13 October,
   with the privacy page saying so.

### P1: why it would not rank well even once indexed *(all fixed)*

4. **Almost no content of our own.** The board has 274 outbound links and 17 internal ones; to a crawler
   it is a list of other sites' titles. There is no page explaining what Bartaboard is, no page listing
   the 59 portals (the single most searchable thing we have), no intro text on section pages.
   ✅ **Done** (plan 12–18): `/sources/`, `/about/`, intros, FAQ, per-outlet pages.
5. **H1 reads "Bartaboard Bartaboard: Latest news from Bangladesh".** The heading holds both the light
   and dark logo images, each with `alt="Bartaboard"`, plus screen-reader-only text. The keywords are
   invisible and the brand is doubled.
   ✅ **Done** (plan 7).
6. **Heading outline is UI chrome.** The only `<h2>`s in the HTML are "Filters", "My news", "Share
   headline", "Keyboard shortcuts" (dialogs); the source cards and the "Top stories" block have no
   headings at all. A crawler's outline of the page is four dialog titles.
   ✅ **Done** (plan 8).
7. **Title tag is 67 characters** and gets cut in results; the description is ~190 characters (cut at
   ~155). Keywords sit after the brand instead of before it.
   ✅ **Done** (plan 9).
8. **No Bangla page for Bangla searches.** Most Bangladeshi searches are typed in Bangla; the interface
   is English, and the Bangla keywords live only in `<meta name="keywords">`, which Google ignores.
   ✅ **Done** (plan 21): every indexable page has a Bangla twin.
9. **No freshness signals in the markup.** Headlines carry no `<time datetime>`, the JSON-LD has no
   `dateModified`, and every sitemap `lastmod` is the build time rather than the newest headline's.
   ✅ **Done** (plan 10).
10. **Small things**: `/health` is linked without the trailing slash (one redirect hop on every page);
    `og:url` is missing on the board; privacy/terms share the board's Open Graph title; no `twitter:site`;
    `Organization` has no `sameAs` (no social profiles exist yet).
    ✅ **Done** (plan 11). `twitter:site` and `sameAs` wait for social profiles.

11. **Videos are invisible to search.** The Videos view (31 Bangladeshi TV news channels on YouTube,
    ~640 videos a day) lives at `/?view=videos`, which canonicalises to `/`, and its list loads from
    `data/videos.json` in the browser, so no video title is in any page's HTML. The TV channels appear
    nowhere a crawler can read them, and 10 of them are also among the 59 news sites, each split in two.
    ✅ **Done** (plan 17, 18).

### P2: technical and performance *(#12 and #13 fixed)*

12. **Page weight.** Board HTML is 739 KB (68 KB compressed); `data/news.json` is 2.1 MB (346 KB
    compressed) with 4,466 items, fetched on every visit. Core Web Vitals have not been measured. On
    Bangladeshi mobile networks this is the likeliest LCP/INP problem. Measure first (PageSpeed Insights,
    mobile) and act only on what it shows: per-section JSON files already exist for days, so splitting
    the feed by section and loading the rest lazily is the obvious cut.
    ✅ **Done** (plan 20): the feed is split, and the section pages measured and fixed.
13. **HSTS** is off (Cloudflare → SSL/TLS → Edge Certificates). Not a ranking factor; one click.
    ✅ **Done** (plan 5).

### P3: off-page, which is what moves rankings *(open)*

14. **Zero inbound links and no brand presence.** No Facebook page (Facebook is where Bangladesh reads
    news), no profile on GitHub/LinkedIn pointing here, not linked from rshossain.me.
    🟡 **Started** 14 October: Facebook and Instagram pages (`bartaboard.bd`), linked from every page's footer and
    the About page, and named in the Organization's `sameAs` (`src/lib/social.ts`). Links in, from other sites,
    still to do (plan 22).

### Not worth doing

- `<meta name="keywords">`: harmless, ignored by Google and Bing. Leave it or drop it.
- Google News Publisher Center / Google Discover: need original articles; an aggregator does not qualify.
- One indexable page per headline: that is the publishers' content; it reads as scraped and risks a
  manual action. Keep `/s/…` noindex as it is.
- `changefreq` / `priority` in the sitemap: Google ignores both. Fine as they are.
- Buying links, directory spam, keyword repetition in copy.

## 4. Plan

### Week 1: get indexed, fix the markup ✅ *(all but #3)*

Dashboards (Sazzad):

1. Google Search Console → Add property → **Domain** `bartaboard.com` → verify with the DNS TXT record
   in Cloudflare (DNS only, not proxied; the TXT record type is unaffected either way).
   ✅ **Done** (11 Oct, through Cloudflare's Domain Connect).
2. Sitemaps → submit `https://bartaboard.com/sitemap.xml`.
   ✅ **Done** (11 Oct).
3. URL inspection → "Request indexing" for `/` and each of the 12 section pages (the daily quota is ~10;
   do it over two days).
   🟡 **Partly done:** sent for 10 of the 12 sections. Still to send: `/news/crime/`, `/news/opinion/`, `/videos/`, `/sources/`, `/about/`.
4. Bing Webmaster Tools → "Import from Google Search Console".
   ✅ **Done** (11 Oct; the sitemap was submitted in Bing by hand, the import missed it).
5. Cloudflare → Caching → Configuration → **Crawler Hints: on** (sends IndexNow pings to Bing/Yandex on
   every deploy). SSL/TLS → Edge Certificates → **HSTS: on**.
   ✅ **Done** (11 Oct).
6. Record the Search Console and Bing accounts in `docs/services.md`.
   ✅ **Done**.

Code (one commit each, on `static-export`):

7. H1: real text, keyword first, the logo as a link outside the heading. Board: "Latest Bangladesh news
   headlines from 59 newspapers"; sections: "Bangladesh sports news today (খেলা)". Second logo image gets
   `alt=""` + `aria-hidden`.
   ✅ **Done**: 9c658ace.
   Later the board's H1 dropped the count ("Latest Bangladesh news headlines, Bangla and English"): it
   shifts as outlets come and go, and not every source is a newspaper. Descriptions keep the number.
8. Headings: "Top stories" `h2`; each source card's name an `h2` (or `h3` under a "By newspaper" `h2`);
   dialog titles rendered only when the dialog is open, so they leave the static HTML.
   ✅ **Done**: 9c658ace.
9. Title ≤ 60 chars, description ≤ 155, keyword first:
   - Board: `Bangladesh News Today, Bangla & English | Bartaboard`
   - Description: `All Bangladesh news in one place: Bangla and English headlines from 59 newspapers (Prothom Alo, The Daily Star, bdnews24, Dhaka Tribune…) and the top stories across them.`
   - Sections keep their pattern; `Bangladesh Sports News Today (খেলা) | Bartaboard`.
   ✅ **Done**: 8e3a8cbf.
10. `<time dateTime>` on each headline's time; `dateModified` (the fetch time) on `WebSite` and
    `CollectionPage`; sitemap `lastmod` per section from its newest headline.
    ✅ **Done**: 8e3a8cbf (`dateModified`), 8eba2025 (sitemap `lastmod`); headline times were already `<time>`.
11. `/health/` with the slash; `openGraph.url` on the board; privacy and terms get their own Open
    Graph title and description.
    ✅ **Done**: 9c658ace, 8e3a8cbf.

### Week 2: give crawlers something that is ours ✅

12. **`/sources/`**: the directory page. All 59 portals grouped (Bangla dailies, English dailies, online
    portals, TV), each with one or two lines (city, language, founded, what it is known for), its logo,
    and links to its section on the board. Title: `All Bangladesh Newspapers & News Portals (59) | Bartaboard`;
    H1 in English with the Bangla phrase `সকল বাংলা পত্রিকা` in the intro. This is the page that can win
    the aggregator queries. Source data: `docs/bd-news-sources.xlsx` + `src/lib/sources.ts`.
    A last group, **TV news channels (31)**, from `src/lib/channels.ts`: each with a link to its YouTube
    channel and its live stream, and to its videos on `/videos/`. The 10 stations that are also news
    sites (Jamuna TV, Ekattor TV, Channel 24…) appear once, with both.
    ✅ **Done**: 36abdc28.
13. **`/about/`**: what Bartaboard is, how it works (headlines from 59 sites and videos from 31 TV
    channels, refreshed every 15 minutes, no account, no tracking), who makes it, how to add a portal. Carries the brand query and the `Organization` schema.
    ✅ **Done**: 24c491ca.
14. **Intro paragraph on every section page** (2–3 sentences, English + one Bangla sentence) above the
    cards, prerendered. Same on the board.
    ✅ **Done**: c54ce77b.
15. **FAQ block on the board** (visible, plain `<details>`): "Which newspapers are included?", "Is it
    free?", "Why are some portals read through Google News?", "Can I watch TV news here?". Marked up as `FAQPage` only for the AI
    assistants; Google no longer shows FAQ rich results for sites like ours.
    ✅ **Done**: c54ce77b.
16. Link the new pages from the footer and header; add them to the sitemap; `Organization.sameAs`
    once a Facebook page exists.
    ✅ **Done**: c54ce77b. `sameAs` waits for a Facebook page.

17. **`/videos/`**: the Videos view as a page of its own, prerendered like the sections: the newest ~24
    videos (title, channel, thumbnail, time) and the channel list in the HTML, the rest loading as now.
    Title `Bangla TV News Videos Today, 31 Channels | Bartaboard`; H1 "Bangladesh TV news videos today"
    with "টিভি সংবাদ" in the intro; `CollectionPage` structured data, sitemap `lastmod` from the newest
    video. The Videos tab becomes a real link to it, and `?view=videos` redirects there. No
    `VideoObject` markup: Google shows video results only for pages where one video is the main
    content, and per-video pages would be YouTube's content, so `/s/…` video links stay `noindex`.
    ✅ **Done**: 96eaf907.

### Weeks 3–4: more indexable surface, measure speed ✅

18. **Per-source pages** `/sources/prothom-alo/` etc.: that portal's newest headlines (already in the
    feed), its description, its sections. Title: `Prothom Alo Latest News Headlines Today | Bartaboard`.
    59 pages, all prerendered from the same build. Add to the sitemap with per-page `lastmod`.
    The 10 TV stations' pages show their videos under their headlines; the 21 channels with no news site
    get a page of their own (`/sources/somoy-tv/`: newest videos, "Watch live on YouTube"), title
    `Somoy TV News Today: Latest Videos | Bartaboard`. 80 pages in all.
    ✅ **Done**: 12d54819.
19. **RSS**: `/feed.xml` and `/news/<section>/feed.xml`, linked with `<link rel="alternate" type="application/rss+xml">`.
    Readers and bots discover updates through it; it costs nothing at build time.
    ✅ **Done**: 544b1001.
20. **PageSpeed Insights** on `/` and one section, mobile; fix what it names. Expected: split
    `news.json` by section, defer the rest, keep the prerendered seed as it is.
    Both theme logos downloading, fixed in 9c42e664; the feed split in 99f14534: the board loads each
    source's newest 8 (~40 KB) and the whole feed (~950 KB as served, 15,000 headlines) only when a view needs it.
    ✅ **Done** (12 October): Lighthouse 12.6 (mobile; the keyless PageSpeed API was over its daily quota) on
    `/`, `/news/sports/` and `/bn/news/sports/`. 0 ms to 50 ms blocking time, ~500 KB per page. Only one real
    fault: a 0.16 layout shift on Bangla section pages. The prerendered status line ("updated just now") fit
    beside the short Bangla heading; once the page updated it to "updated 5 minutes ago" it wrapped and pushed
    the board down 24 px. Below `md` the status now always has its own row, which is where it settled anyway:
    CLS 0. The simulated LCP (3 s to 4.3 s on slow 4G) is the headline text waiting on fonts and scripts in the
    model; the page actually painted its LCP at its first paint (0.6 s). Left as they are: the wordmark at
    120 px for a 36 px slot (right for 3× phone screens) and the logos' one-day cache (they change in place).
    Revisit with field data once Search Console shows Core Web Vitals.

### Month 2: Bangla, links, iteration 🟡 *(#21 done)*

21. **Bangla version**: `/bn/`, `/bn/news/<section>/`, `/bn/sources/`, same data, Bangla interface strings,
    `<html lang="bn">`, `hreflang` `en` / `bn` / `x-default` across every pair. This is the single
    biggest step for Bangladeshi search traffic and is a UI-strings job, not a content job.
    ✅ **Done**: c9e85b41 (board, sections, Videos), fcf0b7eb (the rest). Every indexable page has a Bangla twin
    under `/bn`: board, 12 sections, Videos, sources, every outlet page, about, privacy and terms, with
    Bangla titles, descriptions, headings, intros, FAQ and structured data; outlets by their Bangla names
    (প্রথম আলো, যমুনা টিভি) with correct case endings; hreflang between each pair and in the sitemap; a
    language switch on every page. `<html lang>` is set to bn before paint (one root layout serves both).
    Left in English: `/health` and `/account` (noindex) and shared `/s/` links (noindex).
22. **Links and presence**: Facebook page (post the section pages, not only the board), link from
    rshossain.me and the GitHub profile/README, a "Show HN"/Product Hunt post, r/bangladesh, Bangladeshi
    developer communities, and a note to two or three BD tech blogs/YouTubers. Register the
    `bartaboard` handle wherever it is free.
    ⬜ **Open.**
23. **Search Console review**: Pages report (every URL indexed?), Performance → Queries. Rewrite titles
    and intros toward the queries that actually show impressions. Repeat monthly.
    🔁 **Ongoing**, monthly.

## 5. Keyword map

| Page | Primary | Secondary |
|---|---|---|
| `/` | bangladesh news today | latest bangladesh news, bangla news, bd news, আজকের খবর, সর্বশেষ সংবাদ |
| `/sources/` | all bangla newspaper | bangladesh newspapers list, all bangladeshi newspaper, bd newspaper online, সকল বাংলা পত্রিকা |
| `/sources/<portal>/` | `<portal>` latest news | `<portal>` headlines today, `<portal>` খবর |
| `/news/national/` | bangladesh national news | জাতীয় খবর, dhaka news today |
| `/news/politics/` | bangladesh politics news | রাজনীতির খবর, bangladesh election news |
| `/news/sports/` | bangladesh sports news | bangladesh cricket news today, খেলার খবর |
| `/news/business/` | bangladesh business news | bangladesh economy news, অর্থনীতির খবর |
| `/news/international/` | international news bangla | আন্তর্জাতিক খবর |
| `/news/entertainment/` | bangla entertainment news | বিনোদন খবর, dhallywood news |
| `/news/tech/` | bangladesh tech news | প্রযুক্তি খবর |
| `/news/education/` | bangladesh education news | শিক্ষা খবর, hsc ssc result news |
| `/news/health/` | bangladesh health news | স্বাস্থ্য খবর |
| `/news/lifestyle/` | bangla lifestyle news | জীবনযাপন |
| `/news/crime/` | bangladesh crime news | আইন আদালত খবর |
| `/news/opinion/` | bangladesh opinion editorial | মতামত |
| `/videos/` | bangla news video | bangladesh tv news today, bangla tv news, টিভি সংবাদ, আজকের খবর ভিডিও |
| `/sources/<channel>/` | `<channel>` news today | `<channel>` latest news video, `<channel>` live (link to YouTube) |
| `/about/` | bartaboard | bangladesh news aggregator |
| `/bn/…` (month 2) | the Bangla side of each row above | |

Rule for every page: the primary phrase in the title (first), the H1, the first sentence of the intro,
and the description, once each; never repeated beyond that.

## 6. How to know it is working

- Week 2: Search Console shows the 15 URLs indexed; "bartaboard" query at position 1.
- Month 1: 100+ indexed pages (sources, videos, per-portal and per-channel); first impressions on
  aggregator and TV news video queries.
- Month 2–3: aggregator queries on page 1–2; section long-tail queries appearing; Bangla pages indexed.
- Month 3–6: clicks growing month on month in Search Console; section pages on page 1 for long-tail.
- Review monthly: Pages (indexing), Performance (queries, CTR by page), Core Web Vitals (Experience).
