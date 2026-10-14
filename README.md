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
everywhere ("Just a moment…" checks), more from cloud servers such as GitHub's. When a source's own feed or page fails
(or straight away, for the 11 with method `google-news`), its last day of articles is read from Google News instead
(`site:` search, Bangladesh edition for Bangla sites, US edition for English ones; only items whose publisher is the
site itself). Google's links are opaque ids, so each is turned into the article's real address (two requests to
news.google.com) before it is shown: sections, sharing and duplicate checks then work as for any other source.
Addresses are kept in `.data/google-news-links.json` for three days and looked up within a budget (400 per ten
minutes, at most 10 per source per fetch, newest first; a pause if Google answers 429), so a card fills over a few
fetches (up to 30 headlines) and steady-state fetches only look up what's new. Google also lists pages that aren't
articles (sections, author and tag pages, page templates); titles naming the publisher, of one or two words, or
repeated three times in a feed, and addresses without an article path, are left out. Cards say "via Google News";
`/health` lists these sources separately with the site's own error and how long it has failed. Daily Sun is the
exception: Google lists its articles days late, so it stays failing.

Sources are fetched and shown in the order set by `PRIORITY` in `src/lib/sources.ts` (Prothom Alo, The Daily Star,
Daily Sun, Jugantor, …), followed by the rest in list order. On the board, sources that are not fetched or whose fetch
failed move to the end with a plain-language reason (`src/lib/problems.ts`); "Newest first" orders cards by their
latest headline instead.

## Run

The site is static: `npm run fetch` collects the headlines into files, and `next build` exports the pages around
them to `out/`. No Node.js is needed where it is hosted.

```bash
npm install
npm run fetch      # collect headlines and logos into public/ (re-run for fresher ones)
npm run dev        # http://localhost:3000
npm run check      # live health check of every active source (table output)
npm test           # offline parser tests
```

`npm run check -- prothomalo jugantor` checks specific sources; add `--json` for JSON.

## Data

`npm run fetch` (`scripts/fetch-news.ts`) writes what the site serves. The headline files are in `public/data/v2`,
packed (`src/lib/packed.ts`): each headline is `[title, link, section, publish time, first-seen time]` under its
outlet, times in seconds, which is about a tenth smaller than spelling everything out. The folder is new with each
change of format, so a page still open on older code can't misread the files.

- `v2/news.json` — `{ generatedAt, results, logos, logoShapes }`: each fetched source's result (a status plus its
  `items`: its newest 300 at most, from the last 48 hours), each source's logo path, and each logo's size and
  whether it is light on transparent (so cards draw it at its final size and on the right plate from the first
  paint). About 700 KB compressed. The board loads it once the reader needs more than the cards show (Top stories,
  Latest, a search or filter, another section, a card's "Show all").
- `v2/delta.json` — how `news.json` differs from the run before's (`FeedDelta`): new headlines in full, the rest as
  runs of the ones the board already has. A board with the whole earlier feed downloads this, a few dozen KB,
  instead of the whole feed again; a board on any other build gets `news.json`. The fetch makes it against the
  live site's `news.json` (`SITE_URL`), or the last run's copy in `.data/board.json`.
- `v2/head/<all|section>.json` — for the board and each section page, every source's newest 8 headlines
  (a full card) with the whole feed's counts and headline ages (`NewsSeed`): about 40 KB compressed. The board
  loads this after the reader's first scroll or tap, and checks whichever file it has again every 10 minutes.
- `public/data/videos.json` — `{ generatedAt, channels, videos }`: the Videos view, 31 TV news channels' YouTube
  videos from the last day (at most 30 per channel), newest first, without Shorts. Each channel's feed only has its
  latest 15, so each run adds to what earlier runs kept in `.data/videos.json`. Thumbnails and the player come
  straight from YouTube by video ID. The page fetches this file, and the view's code, only when Videos is opened
  (or hovered or pressed, just before).
- `public/logos/<id>.webp` — each source's logo, found on its homepage (header `<img>` marked as the logo, JSON-LD
  `logo`, then touch icon / favicon); sites that block us fall back to Google's favicon service. Resized to what the
  cards need and re-encoded as WebP (`.ico` files are served as they are). Without a logo the UI shows the name as
  text.
- `.data/` — first-seen times, source health, Google News article addresses and the outlets' original logos (kept
  for a week), carried from run to run; `/health` is built from it.

It exits with an error when no source worked, so an outage never replaces the board with an empty one.

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
src/lib/videos.ts          fetches the channels' feeds, keeps the last day's videos between runs
src/lib/fetchers/youtube.ts YouTube channel feed parser (Shorts left out, titles trimmed to their Bangla parts)
src/lib/categories.ts      section-name synonyms → main categories
src/lib/problems.ts        reader-facing explanations for unavailable / failed sources
src/lib/logos.ts           logo discovery from homepages
src/lib/news.ts            fetch orchestration, cache (10 min, 1 min for failures), concurrency 8
src/lib/store.ts           JSON files in .data/ so first-seen times and health carry over between runs
src/lib/share.ts           share links (/s/<yymmdd>-<key>, and the older /s/<article address>), the share sheet's targets
src/lib/share-lookup.ts    the share index's format and lookup, shared by the function and the browser
src/lib/share-index.ts     builds the share index (30 days of headlines by short-link key, with their stories)
src/lib/outlet-head.ts     an article page's own title, picture and date, for link previews
src/lib/pictures.ts        reads new headlines' pictures from their pages during the fetch, when the feed has none
src/lib/first-seen.ts      first-seen times for headlines without a publish date
src/lib/stories.ts         groups headlines from different outlets about the same event ("Top stories")
src/lib/fetchers/http.ts   fetch with timeout, UA, charset decoding, soft-404 detection
src/lib/fetchers/rss.ts    RSS/Atom/RDF parser
src/lib/fetchers/sitemap.ts Google News sitemap parser
src/lib/fetchers/html.ts   homepage headline extractor (cheerio)
src/lib/fetchers/google-news.ts Google News site search feed, and turning its links into the articles' addresses
src/lib/google-news.ts     the fallback for sites that refuse us: address cache and lookup budget
src/components/NewsBoard.tsx  UI: top stories, Newsstand (cards by outlet), latest timeline, filters, search, "new" marks
src/components/VideoBoard.tsx Videos view (its own chunk, loaded with videos.json only when Videos is opened)
src/components/SharedHeadline.tsx  the page for shared headlines (and unknown addresses)
functions/s/[[path]].ts    Cloudflare Pages Function for /s/*: the shared headline's preview tags, server redirects
scripts/fetch-news.ts      collects public/data (headlines, videos, day files, share index) and logos before a build
public/.htaccess           Apache / LiteSpeed rules: share links, 404 page, headers
```

### Fixing an HTML source

If `npm run check` reports `No headlines matched articlePattern`, open the site, copy a few article URLs and update
that source's `articlePattern` (it is tested against the URL **pathname**, e.g. `^/article/\d+`).

## Config

- `SITE_URL` (default `http://localhost:3000`) — the public address, read at build time for canonical links,
  `sitemap.xml`, `robots.txt`, structured data and the share image.
- `NEWS_DATA_DIR` (default `.data/`) — where first-seen times and source health are saved; `NEWS_PERSIST=0` keeps
  them in memory only.
- `YOUTUBE_API_KEY` (optional) — a YouTube Data API v3 key; videos then show their current view counts instead of the
  channel feeds' (which stop updating once a video leaves its channel's latest 15). Server side only, about 13 units a
  fetch of the 10,000 a day; without it, or if the API fails, the feeds' counts are used.
- `NEWS_CACHE_SECONDS` (default `600`) — how long `npm run check` and the fetch code reuse a source's result.

## Deploy

`.github/workflows/deploy.yml` fetches the headlines, builds the site and uploads `out/` to Cloudflare Pages (project
`bartaboard`). It runs every 15 minutes, started by a cron-job.org job that calls GitHub's API (`POST
/repos/rhossain/deshboard/actions/workflows/deploy.yml/dispatches` with `{"ref":"main"}` and a fine-grained token
allowed only this repo's Actions), so the copy of the file on `main` is the one that runs; it builds `static-export`.
Pushes don't start it; to publish at once: `gh workflow run deploy.yml --ref main`.

The workflow does nothing until the `SITE_URL` repository variable is set (GitHub → Settings → Secrets and variables
→ Actions), e.g. `https://example.com`; it is the address used in the share image link. The optional `YOUTUBE_API_KEY` secret
gives the videos their current view counts.

The headlines are as fresh as the last run. For a one-off manual upload instead, `npm run package` builds
`bartaboard.zip`; extract it into `public_html` (it includes `.htaccess`).

bartaboard.com itself is served by Cloudflare Pages, which the same workflow uploads to. `docs/services.md` lists every
hosted service (Cloudflare, Supabase, Google sign-in, Resend email) and what is set in each dashboard.

## Features

- **Sections** — News, Videos and Saved. News has three views, switched at the top of the page: Newsstand (a card
  per outlet), Top stories and Latest; it reopens on the last one used. On phones the bottom bar is News · Videos ·
  Saved · Filters.
- **Top stories** — headlines are reduced to weighted keywords (Bangla suffixes stripped, rare words count more) and
  linked when two outlets share most of them; the stories covered by the most outlets lately rank first (each headline counts half as much after 12 hours). Runs in the browser.
- **New since your last visit** — headlines newer than the end of the reader's previous visit get a gold dot, with a
  "N new" filter. A visit ends after 30 minutes away (`src/components/last-visit.ts`); opened headlines turn muted.
- **Shareable filters** — view, language, source, category, search and order live in the URL
  (`/?view=latest&lang=bn&cat=sports`, see `src/lib/filters.ts`), so shared links open as they were.
- **Saved** — the bookmark beside each headline keeps it on this device (whole item, so it outlives the feed).
- **Quiet auto-refresh** — every 10 minutes the board checks for a newer build; new headlines wait behind a
  "N new headlines" button instead of moving the page (applied at once if nothing is new or the tab is hidden).
- **Keyboard shortcuts** — `/` search, `j`/`k` move between headlines, `s` save, `1`–`5` Newsstand, Top stories, Latest, Videos, Saved, `r` refresh, `?` help.
- **Share image** — `src/app/opengraph-image.tsx`, rendered at build time with the site's fonts.
- **Share links** — the share sheet gives `/s/<yymmdd>-<key>` (`/s/261014-k3x9pq2m`): the Dhaka day the headline is
  filed under and a hash of its address. The page shows the headline, its section and time, the same story from
  other outlets and a button to the article; videos are `/s/youtu.be/<id>`. On bartaboard.com a Cloudflare Pages
  Function answers `/s/*` (`functions/s/[[path]].ts`): it finds the headline and writes it into the page's tags, so
  Facebook, WhatsApp, X and Telegram previews show the headline, outlet, date and the article's own picture (the
  video's thumbnail), with "Bartaboard" as the site, and into the page, which then shows it without loading any
  headline files. It looks in, in order: links resolved before (the optional `SHARES` KV namespace, else the edge
  cache), the share index (`public/data/v2/share`, 30 days, written by `npm run fetch`), the outlet's page (old
  long links), and the address itself. The picture comes from the share index when the fetch found one (the feed's
  media:content, enclosure or sitemap image:loc, else read once from the article's page by `src/lib/pictures.ts`:
  many outlets refuse anything from Cloudflare's servers, but answer the fetch); otherwise the function reads the
  article's page, crawlers waiting up to 4 s and the page asking for it (`/s/…?image`) once it is showing. The
  `x-share-image` response header says how it went. Links to sites that aren't on the board go to the board. Older
  `/s/<article address>` links keep working. On hosts without the function (`public/.htaccess`, `next dev`) the
  page looks the headline up in the share index itself; previews there show the Bartaboard card.
- **Source health** — `/health` lists every source as of the last fetch: failing ones first
  with how long they have failed, then working ones with the section names whose headlines land in "Other" (add those
  to `src/lib/categories.ts`).

## Notes

- Fetching happens wherever `npm run fetch` runs (GitHub Actions for deploys). Some portals block datacenter IPs;
  results from your own machine may differ from GitHub's servers.
- Showing headlines with links back to the source is the usual aggregator pattern; respect each site's terms and
  `robots.txt`, keep the cache on and don't poll aggressively.
