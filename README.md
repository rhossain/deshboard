# Deshboard

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

`npm run fetch` (`scripts/fetch-news.ts`) writes what the site serves:

- `public/data/news.json` — `{ generatedAt, results, logos, logoShapes }`: each fetched source's result (a status
  plus its `items`), each source's logo path, and each logo's size and whether it is light on transparent (so cards
  draw it at its final size and on the right plate from the first paint). The board loads it and checks it again
  every 10 minutes.
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
`publishedAt`; instead `seenAt` is when Deshboard first saw them on the homepage (`src/lib/first-seen.ts`). Headlines
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
src/lib/share.ts           share links (/s/<article address>) and the check that they point to an outlet
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
scripts/fetch-news.ts      collects public/data/news.json and logos before a build
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
- `NEWS_CACHE_SECONDS` (default `600`) — how long `npm run check` and the fetch code reuse a source's result.

## Deploy

`.github/workflows/deploy.yml` fetches the headlines, builds the site and commits `out/` to the top of the `deploy`
branch; Hostinger's Git deployment (hPanel → Advanced → GIT, connected with GitHub: branch `deploy`, auto-deployment
on) copies each new commit into the site's web folder. It runs on every push to `static-export` and every 15 minutes,
started by a cron-job.org job that calls GitHub's API (`POST
/repos/rhossain/deshboard/actions/workflows/deploy.yml/dispatches` with `{"ref":"main"}` and a fine-grained token
allowed only this repo's Actions). The copy of the file on `main` builds `static-export` too.

The workflow does nothing until the `SITE_URL` repository variable is set (GitHub → Settings → Secrets and variables
→ Actions), e.g. `https://example.com`; it is the address used in the share image link.

The headlines are as fresh as the last run. For a one-off manual upload instead, `npm run package` builds
`deshboard.zip`; extract it into `public_html` (it includes `.htaccess`).

## Features

- **Top stories** — headlines are reduced to weighted keywords (Bangla suffixes stripped, rare words count more) and
  linked when two outlets share most of them; the stories covered by the most outlets rank first. Runs in the browser.
- **New since your last visit** — headlines newer than the end of the reader's previous visit get a gold dot, with a
  "N new" filter. A visit ends after 30 minutes away (`src/components/last-visit.ts`); opened headlines turn muted.
- **Shareable filters** — view, language, source, category, search and order live in the URL
  (`/?view=latest&lang=bn&cat=sports`, see `src/lib/filters.ts`), so shared links open as they were.
- **Saved** — the bookmark beside each headline keeps it on this device (whole item, so it outlives the feed).
- **Quiet auto-refresh** — every 10 minutes the board checks for a newer build; new headlines wait behind a
  "N new headlines" button instead of moving the page (applied at once if nothing is new or the tab is hidden).
- **Keyboard shortcuts** — `/` search, `j`/`k` move between headlines, `s` save, `1`–`4` views, `r` refresh, `?` help.
- **Share image** — `src/app/opengraph-image.tsx`, rendered at build time with the site's fonts.
- **Share links** — `/s/<article address>` shows the headline with a button to the article, looked up in the browser
  (`src/components/SharedHeadline.tsx`); once it has left the board the link goes straight to the article. Links
  to sites that aren't on the board go to the board. Previews on social sites show the Deshboard card.
- **Source health** — `/health` lists every source as of the last fetch: failing ones first
  with how long they have failed, then working ones with the section names whose headlines land in "Other" (add those
  to `src/lib/categories.ts`).

## Notes

- Fetching happens wherever `npm run fetch` runs (GitHub Actions for deploys). Some portals block datacenter IPs;
  results from your own machine may differ from GitHub's servers.
- Showing headlines with links back to the source is the usual aggregator pattern; respect each site's terms and
  `robots.txt`, keep the cache on and don't poll aggressively.
