/**
 * Collect the headlines for a static build: npm run fetch
 *
 * Fetches every active source and each outlet's logo, then writes what the static site serves (the
 * headline files packed, in public/data/v2: see packed.ts):
 *   news.json   the board's headlines (see NewsFeed)
 *   delta.json  how they differ from the last run's, for a board that has those (see FeedDelta)
 *   head/<all|category>.json the newest of them for each page, read first (see NewsSeed)
 *   days/<date>.json every headline of the last 30 days, by day (see NewsDay, archive.ts)
 *   share/<date>/<shard>.json, share/meta.json the share index: those headlines by short-link key (share-lookup.ts)
 *   public/data/videos.json the Videos view: TV channels' latest YouTube videos (see VideoFeed)
 *   public/logos/<id>.<ext> logos, resized for the cards (see prepareLogo)
 * and updates `.data/` (first-seen times, source health, which `next build` reads for /health, and
 * the outlets' original logos, kept for a week between runs).
 *
 * Exits with code 1 when no source worked, so a network outage never deploys an empty board.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getLogo, prepareLogo } from "../src/lib/logos";
import { byDay, keptDates, mergeDay } from "../src/lib/archive";
import { addressKey } from "../src/lib/fetchers/utils";
import { toSeed } from "../src/lib/feed";
import { DATA_DIR, makeDelta, packDay, packFeed, type PackedDay, type PackedFeed, unpackDay, unpackFeed } from "../src/lib/packed";
import { CATEGORY_PAGES } from "../src/lib/site";
import { cachedResult, getNews } from "../src/lib/news";
import { getVideos } from "../src/lib/videos";
import { ACTIVE_SOURCES, SOURCES } from "../src/lib/sources";
import { buildShareIndex } from "../src/lib/share-index";
import { SHARE_DIR } from "../src/lib/share-lookup";
import { flushStores } from "../src/lib/store";
import type { LogoShape, NewsDay, NewsFeed, NewsItem, SourceResult, VideoFeed } from "../src/lib/types";

const PUBLIC = path.join(process.cwd(), "public");
/** The packed headline files (see packed.ts). */
const DATA = path.join(PUBLIC, DATA_DIR);
/** The logos as the outlets publish them. */
const ORIGINAL_DIR = path.join(process.cwd(), ".data", "logos");
/** The logos the site serves, made from the originals on every run. */
const LOGO_DIR = path.join(PUBLIC, "logos");
const LOGO_MAX_AGE_MS = 7 * 24 * 3600_000;
const LOGO_CONCURRENCY = 6;

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/svg+xml": "svg",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
};

/** Each source's original logo file: reused while under a week old, otherwise fetched again. */
async function updateLogos(): Promise<Record<string, string>> {
  // Originals used to be served as they were, from public/logos: start from those.
  if (!existsSync(ORIGINAL_DIR) && existsSync(LOGO_DIR)) {
    mkdirSync(path.dirname(ORIGINAL_DIR), { recursive: true });
    renameSync(LOGO_DIR, ORIGINAL_DIR);
  }
  mkdirSync(ORIGINAL_DIR, { recursive: true });
  const existing = new Map(readdirSync(ORIGINAL_DIR).map((f) => [f.replace(/\.[^.]+$/, ""), f]));
  const originals: Record<string, string> = {};
  const queue = [...SOURCES];

  const worker = async () => {
    for (let source = queue.shift(); source; source = queue.shift()) {
      const old = existing.get(source.id);
      if (old && Date.now() - statSync(path.join(ORIGINAL_DIR, old)).mtimeMs < LOGO_MAX_AGE_MS) {
        originals[source.id] = old;
        continue;
      }
      const logo = await getLogo(source);
      const ext = logo && EXTENSIONS[logo.contentType];
      if (logo && ext) {
        const file = `${source.id}.${ext}`;
        if (old && old !== file) rmSync(path.join(ORIGINAL_DIR, old));
        writeFileSync(path.join(ORIGINAL_DIR, file), Buffer.from(logo.bytes));
        originals[source.id] = file;
      } else if (old) {
        // Couldn't fetch it this time: keep the one we have.
        originals[source.id] = old;
      }
    }
  };
  await Promise.all(Array.from({ length: LOGO_CONCURRENCY }, worker));
  return originals;
}

/** Writes the served logos (see prepareLogo) into a fresh public/logos; unreadable ones are left out. */
async function publishLogos(originals: Record<string, string>): Promise<Pick<NewsFeed, "logos" | "logoShapes">> {
  rmSync(LOGO_DIR, { recursive: true, force: true });
  mkdirSync(LOGO_DIR, { recursive: true });
  const logos: Record<string, string> = {};
  const logoShapes: Record<string, LogoShape> = {};
  for (const [id, file] of Object.entries(originals)) {
    const logo = await prepareLogo(readFileSync(path.join(ORIGINAL_DIR, file)));
    if (!logo) continue;
    writeFileSync(path.join(LOGO_DIR, `${id}.${logo.ext}`), logo.bytes);
    logos[id] = `/logos/${id}.${logo.ext}`;
    logoShapes[id] = logo.shape;
  }
  return { logos, logoShapes };
}

/** The day files kept between runs (the Actions cache keeps .data), so they outlast the 72-hour cache. */
const DAYS_ARCHIVE = path.join(process.cwd(), ".data", "days");
const DAY_DOWNLOAD_TIMEOUT_MS = 10_000;

/** A file from the live site (SITE_URL), parsed; null when SITE_URL isn't set or the site lacks it. */
async function download<T>(url: string): Promise<T | null> {
  const site = process.env.SITE_URL?.replace(/\/+$/, "");
  if (!site) return null;
  try {
    const res = await fetch(`${site}${url}`, { signal: AbortSignal.timeout(DAY_DOWNLOAD_TIMEOUT_MS) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/**
 * A day file from the live site, for a day the archive is missing (the Actions cache was lost or is new):
 * the site serves every kept day, so it is the backup. Before the files were packed they were in /data/days.
 */
async function downloadDay(date: string): Promise<NewsDay | null> {
  const raw =
    (await download<PackedDay | NewsDay>(`${DATA_DIR}/days/${date}.json`)) ??
    (await download<PackedDay | NewsDay>(`/data/days/${date}.json`));
  try {
    const day = raw && unpackDay(raw);
    return day?.date === date && Array.isArray(day.items) ? day : null;
  } catch {
    return null;
  }
}

/**
 * Writes one file per Dhaka day for the last KEEP_DAYS days (see archive.ts): every source's cached
 * headlines (all of the last 72 hours, not just the board's share), merged into what was kept of each
 * day before. Returns how many days were written.
 */
async function writeDays(): Promise<number> {
  const keep = keptDates();
  mkdirSync(DAYS_ARCHIVE, { recursive: true });
  const archived = (date: string) => path.join(DAYS_ARCHIVE, `${date}.json`);
  const read = (date: string): NewsItem[] => {
    try {
      return existsSync(archived(date)) ? unpackDay(JSON.parse(readFileSync(archived(date), "utf8"))).items : [];
    } catch (err) {
      // A damaged file is started over rather than stopping every run from here on.
      console.warn(`  ! ${date}.json could not be read, starting it over:`, err instanceof Error ? err.message : err);
      return [];
    }
  };
  const write = (day: NewsDay) => {
    writeFileSync(`${archived(day.date)}.tmp`, JSON.stringify(packDay(day)));
    renameSync(`${archived(day.date)}.tmp`, archived(day.date));
  };

  const missing = keep.filter((date) => !existsSync(archived(date)));
  for (const day of await Promise.all(missing.map(downloadDay))) {
    if (day) write(day);
  }

  const cached = ACTIVE_SOURCES.flatMap((s) => cachedResult(s.id)?.items ?? []);
  const days = byDay(cached);
  // Each address on one day only: the one its time now falls on (an article moves when its time is
  // corrected). By address alone: an outlet's same headline on two days can be two articles (a daily column).
  const dayOf = new Map<string, string>();
  for (const [date, items] of days) for (const it of items) dayOf.set(addressKey(it.link), date);
  for (const [date, items] of days) {
    if (!keep.includes(date)) continue;
    const kept = read(date).filter((it) => (dayOf.get(addressKey(it.link)) ?? date) === date);
    write({ date, items: mergeDay(kept, items) });
  }

  for (const file of readdirSync(DAYS_ARCHIVE)) {
    if (!keep.includes(file.replace(/\.json$/, ""))) rmSync(path.join(DAYS_ARCHIVE, file));
  }
  const dir = path.join(DATA, "days");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const files = readdirSync(DAYS_ARCHIVE);
  for (const file of files) {
    // Days the archive still has from before the files were packed are packed on the way.
    try {
      const day = JSON.parse(readFileSync(path.join(DAYS_ARCHIVE, file), "utf8")) as PackedDay | NewsDay;
      writeFileSync(path.join(dir, file), JSON.stringify("items" in day ? packDay(day) : day));
    } catch (err) {
      console.warn(`  ! ${file} could not be read, left out:`, err instanceof Error ? err.message : err);
    }
  }
  return files.length;
}

/**
 * The share index (see share-lookup.ts): the kept days' headlines and the board's, by short-link key, so a
 * shared link finds its headline in one small file. Written fresh each run, like the day files.
 */
function writeShareIndex(feed: NewsFeed, videos: VideoFeed) {
  const days = new Map<string, NewsItem[]>();
  for (const file of readdirSync(DAYS_ARCHIVE)) {
    try {
      const day = unpackDay(JSON.parse(readFileSync(path.join(DAYS_ARCHIVE, file), "utf8")) as PackedDay | NewsDay);
      days.set(day.date, day.items);
    } catch {
      // Already reported by writeDays.
    }
  }
  const board = feed.results.flatMap((r) => r.items);
  const { files, meta } = buildShareIndex(days, board, feed, videos);
  const dir = path.join(PUBLIC, SHARE_DIR);
  rmSync(dir, { recursive: true, force: true });
  for (const [name, file] of files) {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(file));
  }
  writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta));
  return [...files.values()].reduce((n, f) => n + Object.keys(f).length, 0);
}

/**
 * For the board and each section page, every source's newest headlines (a full card each): all the
 * board loads until the reader wants more than the cards show, a small part of news.json.
 */
function writeHeads(feed: NewsFeed) {
  const dir = path.join(DATA, "head");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const category of [undefined, ...CATEGORY_PAGES.map((c) => c.id)]) {
    writeFileSync(path.join(dir, `${category ?? "all"}.json`), JSON.stringify(packFeed(toSeed(feed, category, Infinity))));
  }
}

/** The last run's feed, kept between runs (the Actions cache keeps .data), for when the live site's can't be had. */
const LAST_FEED = path.join(process.cwd(), ".data", "board.json");

/**
 * The feed and how it differs from the one before (see FeedDelta): the live site's, which is what open
 * boards have (a run whose upload failed never reached them), else the last run's kept copy. With
 * neither, the delta fits no board, which then loads the whole feed.
 */
async function writeFeed(feed: NewsFeed) {
  let last = await download<PackedFeed>(`${DATA_DIR}/news.json`);
  if (!last?.results) {
    try {
      last = existsSync(LAST_FEED) ? (JSON.parse(readFileSync(LAST_FEED, "utf8")) as PackedFeed) : null;
    } catch {
      last = null; // A damaged copy: no delta this time.
    }
  }
  const previous: NewsFeed = last?.results ? unpackFeed(last) : { generatedAt: "", results: [], logos: {}, logoShapes: {} };

  const packed = JSON.stringify(packFeed(feed));
  writeFileSync(path.join(DATA, "news.json"), packed);
  writeFileSync(path.join(DATA, "delta.json"), JSON.stringify(makeDelta(previous, feed)));
  writeFileSync(LAST_FEED, packed);
}

async function main() {
  const started = Date.now();
  const [news, originals, videos] = await Promise.all([getNews({ force: true }), updateLogos(), getVideos()]);
  const { logos, logoShapes } = await publishLogos(originals);

  const bySource = new Map<string, SourceResult>();
  for (const status of news.statuses) bySource.set(status.sourceId, { ...status, items: [] });
  for (const item of news.items) bySource.get(item.sourceId)?.items.push(item);

  const feed: NewsFeed = { generatedAt: news.generatedAt, results: [...bySource.values()], logos, logoShapes };
  // The unpacked files from before (news.json, head/, days/) are gone from the site with this.
  for (const old of ["news.json", "head", "days"]) rmSync(path.join(PUBLIC, "data", old), { recursive: true, force: true });
  mkdirSync(DATA, { recursive: true });
  mkdirSync(path.dirname(LAST_FEED), { recursive: true });
  await writeFeed(feed);
  writeFileSync(path.join(PUBLIC, "data", "videos.json"), JSON.stringify(videos));
  writeHeads(feed);
  const days = await writeDays();
  const shared = writeShareIndex(feed, videos);
  flushStores();

  const ok = news.statuses.filter((s) => s.ok).length;
  console.log(
    `${ok}/${news.statuses.length} sources OK, ${news.items.length} headlines, ` +
      `${days} days of archive, ${shared} headlines in the share index, ${Object.keys(logos).length} logos, ` +
      `${videos.channels.filter((c) => c.ok).length}/${videos.channels.length} channels with ${videos.videos.length} videos (${((Date.now() - started) / 1000).toFixed(1)} s)`,
  );
  for (const s of news.statuses.filter((s) => s.via)) {
    console.log(`  ↻ ${s.sourceName}: ${s.count} via Google News (site: ${s.directError})`);
  }
  for (const s of news.statuses.filter((s) => !s.ok)) {
    console.log(`  ✗ ${s.sourceName}: ${s.error}${s.fallbackError ? ` (Google News: ${s.fallbackError})` : ""}`);
  }
  for (const c of videos.channels.filter((c) => !c.ok)) console.log(`  ✗ ${c.name} (YouTube): ${c.error}`);
  process.exit(ok > 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
