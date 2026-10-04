# BD News Desk

Headlines + links from Bangladeshi news portals, built with **Next.js 16** (App Router) and **Tailwind CSS v4**.

Sources were verified on 5 Oct 2026 (see `docs/bd-news-sources.xlsx`): 64 portals checked, **48 active**:

| Method   | Portals | How it works                                                                 |
| -------- | ------: | ---------------------------------------------------------------------------- |
| RSS      |      16 | RSS 2.0 / Atom / RDF feed                                                    |
| Sitemap  |      12 | Google News sitemap (`news:title` + `loc`), incl. one-file-per-day sitemaps  |
| HTML     |      20 | Homepage links whose path matches a per-site `articlePattern` regex          |

The other 16 (blocked, stale or JS-only) are kept in `src/lib/sources.ts` with method `unclear` / `unavailable` and are not fetched.

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
- `GET /api/sources` — all 64 portals with method, URL and notes

Each item: `{ title, link, publishedAt?, sourceId, sourceName, lang }`. HTML-scraped items have no `publishedAt`.

## How it fits together

```
src/lib/sources.ts         source list (edit here to add/fix a portal)
src/lib/news.ts            fetch orchestration, in-memory cache (10 min, 1 min for failures), concurrency 8
src/lib/fetchers/http.ts   fetch with timeout, UA, charset decoding, soft-404 detection
src/lib/fetchers/rss.ts    RSS/Atom/RDF parser
src/lib/fetchers/sitemap.ts Google News sitemap parser
src/lib/fetchers/html.ts   homepage headline extractor (cheerio)
src/components/NewsBoard.tsx  UI: by-source cards, latest timeline, filters, search
```

### Fixing an HTML source

If `npm run check` reports `No headlines matched articlePattern`, open the site, copy a few article URLs and update
that source's `articlePattern` (it is tested against the URL **pathname**, e.g. `^/article/\d+`).

## Config

- `NEWS_CACHE_SECONDS` (default `600`) — how long each source's result is reused.

## Notes

- Fetching happens server-side, so it needs normal internet access from wherever the app runs. Some portals block
  datacenter IPs; results from a Bangladeshi server or your own machine may differ from a cloud host.
- Showing headlines with links back to the source is the usual aggregator pattern; respect each site's terms and
  `robots.txt`, keep the cache on and don't poll aggressively.
