/**
 * Collect the headlines for a static build: npm run fetch
 *
 * Fetches every active source and each outlet's logo, then writes what the static site serves:
 *   public/data/news.json   the board's headlines (see NewsFeed)
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
import { getNews } from "../src/lib/news";
import { getVideos } from "../src/lib/videos";
import { SOURCES } from "../src/lib/sources";
import { flushStores } from "../src/lib/store";
import type { LogoShape, NewsFeed, SourceResult } from "../src/lib/types";

const PUBLIC = path.join(process.cwd(), "public");
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

async function main() {
  const started = Date.now();
  const [news, originals, videos] = await Promise.all([getNews({ force: true }), updateLogos(), getVideos()]);
  const { logos, logoShapes } = await publishLogos(originals);

  const bySource = new Map<string, SourceResult>();
  for (const status of news.statuses) bySource.set(status.sourceId, { ...status, items: [] });
  for (const item of news.items) bySource.get(item.sourceId)?.items.push(item);

  const feed: NewsFeed = { generatedAt: news.generatedAt, results: [...bySource.values()], logos, logoShapes };
  mkdirSync(path.join(PUBLIC, "data"), { recursive: true });
  writeFileSync(path.join(PUBLIC, "data", "news.json"), JSON.stringify(feed));
  writeFileSync(path.join(PUBLIC, "data", "videos.json"), JSON.stringify(videos));
  flushStores();

  const ok = news.statuses.filter((s) => s.ok).length;
  console.log(
    `${ok}/${news.statuses.length} sources OK, ${news.items.length} headlines, ` +
      `${Object.keys(logos).length} logos, ` +
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
