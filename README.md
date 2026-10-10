# Bartaboard

Headlines + links from Bangladeshi news portals, built with **Next.js 16** (App Router) and **Tailwind CSS v4**.

Sources were verified on 5 Oct 2026 (see `docs/bd-news-sources.xlsx`): 64 portals checked, **59 active**:

| Method      | Portals | How it works                                                                             |
| ----------- | ------: | ---------------------------------------------------------------------------------------- |
| RSS         |      16 | RSS 2.0 / Atom / RDF feed                                                                |
| Sitemap     |      12 | Google News sitemap (`news:title` + `loc`), incl. one-file-per-day sitemaps              |
| HTML        |      20 | Homepage links whose path matches a per-site `articlePattern` regex                      |
| Google News |      11 | Sites that can't be read at all (blocked, JS-only, broken feeds), only via Google News   |

The other 5 (Janakantha, Somoy News, Shokaler Khobor, The Daily Messenger, Bangla Insider: stale, gone, or not on Google
News either) are kept in `src/lib/sources.ts` with method `unclear` / `unavailable` and are not fetched.

**Google News fallback.** Many of these sites sit behind Cloudflare, which refuses automated requests: some from
everywhere ("Just a moment…" checks), more from cloud servers. When a source's own feed or page fails (or straight
away, for the 11 with method `google-news`), its last day of articles is read from Google News instead (`site:`
search, Bangladesh edition for Bangla sites, US edition for English ones; only items whose publisher is the site
itself). Google's links are opaque ids, so each is turned into the article's real address (two requests to
news.google.com) before it is shown: sections, sharing and duplicate checks then work as for any other source.
Addresses are kept in memory and in `.data/google-news-links.json` for three days, and looked up within a budget (400
per ten minutes, at most 10 per source per fetch, newest first; a pause if Google answers 429), so a card fills over a
few refreshes (up to 30 headlines) and later ones only look up what's new. Google also lists pages that aren't
articles (sections, author and tag pages, page templates); titles naming the publisher, of one or two words, or
repeated three times in a feed, and addresses without an article path, are left out. Cards say "via Google News";
`/health` lists these sources separately with the site's own error and how long it has failed. Daily Sun is the
exception: Google lists its articles days late, so it stays failing.

Sources are fetched and shown in the order set by `PRIORITY` in `src/lib/sources.ts` (Prothom Alo, The Daily Star,
Daily Sun, Jugantor, …), followed by the rest in list order. On the board, sources that are not fetched or whose fetch
failed move to the end with a plain-language reason (`src/lib/problems.ts`); "Newest first" orders cards by their
latest headline instead.

## Run

```bash
npm install
npm run dev        # http://localhost:3000
npm run check      # live health check of every active source (table output)
npm test           # offline parser tests
```

`npm run check -- prothomalo jugantor` checks specific sources; add `--json` for JSON.

## API

- `GET /api/news` — `{ items, statuses, generatedAt }`
  - `?lang=bn|en`, `?source=id1,id2`, `?refresh=1` (bypass cache)
- `GET /api/news/stream` — same params, but NDJSON: one `{ "type": "source", "result" }` line per source as soon as
  it is fetched (`result` is a status plus its `items`), then `{ "type": "done", "generatedAt" }`. The UI uses this so
  each source shows up the moment it arrives.
- `GET /api/logo/:sourceId` — the source's logo image (proxied, cached 24 h). Found on its homepage (header `<img>`
  marked as the logo, JSON-LD `logo`, then touch icon / favicon); sites that block us fall back to Google's favicon
  service. Resized to what the cards need and served as WebP (`.ico` files as they are); the server prepares every
  logo when it starts and renders their sizes into the page, so cards draw them right from the first paint. 404 when
  nothing is found, and the UI shows the name as text.
- `GET /api/sources` — all 64 portals with method, URL and notes
- `GET /api/videos` — `{ generatedAt, channels, videos }`: the Videos view, 31 TV news channels' YouTube videos from
  the last day (at most 30 per channel), newest first, without Shorts. `?refresh=1` fetches the channels now; otherwise
  the cached videos come back at once, and stale ones are refreshed behind them. Each channel's feed only has its
  latest 15, so each fetch adds to what earlier ones kept (`.data/videos.json`).

Each item: `{ title, link, publishedAt?, seenAt?, sourceId, sourceName, lang, category }`. HTML-scraped items have no
`publishedAt`; instead `seenAt` is when Bartaboard first saw them on the homepage (`src/lib/first-seen.ts`). Headlines
already there on a source's very first fetch get neither, since their age is unknown. The UI shows `seenAt` as `~12
minutes ago`.

`category` is one of `national, politics, international, business, sports, entertainment, tech, education, health,
lifestyle, crime, opinion, other`. It comes from the article URL's section path (`/details/politics/…`,
`/category/World/…`) and, failing that, RSS `<category>` / sitemap `news:keywords` (`খেলা`, `বিশ্ব সংবাদ`). Each
portal names sections differently, so `src/lib/categories.ts` maps their English slugs and Bangla names to the
main categories; add a synonym there when a section lands in `other`. Sources whose URLs are bare IDs and whose
feeds have no tags (e.g. Manab Zamin, BSS, Daily Observer) always end up in `other`.

## How it fits together

```
src/lib/sources.ts         source list (edit here to add/fix a portal)
src/lib/channels.ts        TV news channels on YouTube for the Videos view (edit here to add/fix a channel)
src/lib/videos.ts          fetches the channels' feeds, caches them, keeps the last day's videos
src/lib/fetchers/youtube.ts YouTube channel feed parser (Shorts left out, titles trimmed to their Bangla parts)
src/lib/categories.ts      section-name synonyms → main categories
src/lib/problems.ts        reader-facing explanations for unavailable / failed sources
src/lib/logos.ts           logo discovery from homepages + in-memory image cache
src/lib/news.ts            fetch orchestration, cache (10 min, 1 min for failures), concurrency 8, background refresh
src/lib/store.ts           JSON files in .data/ so the cache and first-seen times survive restarts
src/lib/first-seen.ts      first-seen times for headlines without a publish date
src/lib/stories.ts         groups headlines from different outlets about the same event ("Top stories")
src/instrumentation.ts     starts the background refresh when the server starts
src/lib/fetchers/http.ts   fetch with timeout, UA, charset decoding, soft-404 detection
src/lib/fetchers/rss.ts    RSS/Atom/RDF parser
src/lib/fetchers/sitemap.ts Google News sitemap parser
src/lib/fetchers/html.ts   homepage headline extractor (cheerio)
src/lib/fetchers/google-news.ts Google News site search feed, and turning its links into the articles' addresses
src/lib/google-news.ts     the fallback for sites that refuse us: address cache and lookup budget
src/components/NewsBoard.tsx  UI: top stories, Newsstand (cards by outlet), latest timeline, filters, search, "new" marks
src/components/VideoBoard.tsx Videos view (its own chunk, loaded with /api/videos only when Videos is opened)
```

### Fixing an HTML source

If `npm run check` reports `No headlines matched articlePattern`, open the site, copy a few article URLs and update
that source's `articlePattern` (it is tested against the URL **pathname**, e.g. `^/article/\d+`).

## Config

- `NEWS_CACHE_SECONDS` (default `600`) — how long each source's result (and the videos) is reused.
- `NEWS_BACKGROUND_REFRESH` — set to `0` to fetch only when a reader asks. Otherwise the server refreshes stale
  sources and the videos at startup and every half TTL, so readers get headlines and videos from a warm cache.
- `SITE_URL` (default `http://localhost:3000`) — the public address, used for canonical links, `sitemap.xml`,
  `robots.txt`, structured data and the share image.
- `NEWS_DATA_DIR` (default `.data/`) — where the cache and first-seen times are saved; `NEWS_PERSIST=0` keeps them in
  memory only. On serverless hosts the filesystem is throwaway and timers don't run between requests, so both features
  quietly do nothing there; run on a long-lived Node server (VPS, container) to get them.

bartaboard.com itself is served by Cloudflare Pages, which the same workflow uploads to. `docs/services.md` lists every
hosted service (Cloudflare, Supabase, Google sign-in, Resend email) and what is set in each dashboard.

## Features

- **Sections** — News, Videos and Saved. News has three views, switched at the top of the page: Newsstand (a card
  per outlet), Top stories and Latest; it reopens on the last one used. On phones the bottom bar is News · Videos ·
  Saved · Filters.
- **Top stories** — headlines are reduced to weighted keywords (Bangla suffixes stripped, rare words count more) and
  linked when two outlets share most of them; the stories covered by the most outlets rank first. Runs in the browser.
- **New since your last visit** — headlines newer than the end of the reader's previous visit get a gold dot, with a
  "N new" filter. A visit ends after 30 minutes away (`src/components/last-visit.ts`); opened headlines turn muted.
- **Shareable filters** — view, language, source, category, search and order live in the URL
  (`/?view=latest&lang=bn&cat=sports`, see `src/lib/filters.ts`); the page reads them on the server, so shared links
  open as they were.
- **Saved** — the bookmark beside each headline keeps it on this device (whole item, so it outlives the feed).
- **Quiet auto-refresh** — every 10 minutes the board refetches in the background; new headlines wait behind a
  "N new headlines" button instead of moving the page (applied at once if nothing is new or the tab is hidden).
- **Videos** — the latest videos from 31 TV news channels on YouTube, filtered by channel or search, played over the
  page. Its code and data load only when Videos is opened (started on hover or press, just before the click); a page
  opened on Videos leaves the headlines until the reader leaves it.
- **Keyboard shortcuts** — `/` search, `j`/`k` move between headlines, `s` save, `1`–`5` Newsstand, Top stories, Latest, Videos, Saved, `r` refresh, `?` help.
- **Share image** — `src/app/opengraph-image.tsx`, rendered at build time with the site's fonts.
- **Source health** — `/health` lists every source from the server cache (never triggers a fetch): failing ones first
  with how long they have failed, then working ones with the section names whose headlines land in "Other" (add those
  to `src/lib/categories.ts`).

## Notes

- Fetching happens server-side, so it needs normal internet access from wherever the app runs. Some portals block
  datacenter IPs; results from a Bangladeshi server or your own machine may differ from a cloud host.
- Showing headlines with links back to the source is the usual aggregator pattern; respect each site's terms and
  `robots.txt`, keep the cache on and don't poll aggressively.
