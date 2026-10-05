/**
 * Collect the headlines for a static build: npm run fetch
 *
 * Fetches every active source and each outlet's logo, then writes what the static site serves:
 *   public/data/news.json   the board's headlines (see NewsFeed)
 *   public/logos/<id>.<ext> logos, kept for a week between runs
 * and updates `.data/` (first-seen times, source health), which `next build` reads for /health.
 *
 * Exits with code 1 when no source worked, so a network outage never deploys an empty board.
 */
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getLogo } from "../src/lib/logos";
import { getNews } from "../src/lib/news";
import { SOURCES } from "../src/lib/sources";
import { flushStores } from "../src/lib/store";
import type { NewsFeed, SourceResult } from "../src/lib/types";

const PUBLIC = path.join(process.cwd(), "public");
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

/** Each source's logo file: reused while under a week old, otherwise fetched again. */
async function updateLogos(): Promise<Record<string, string>> {
  mkdirSync(LOGO_DIR, { recursive: true });
  const existing = new Map(readdirSync(LOGO_DIR).map((f) => [f.replace(/\.[^.]+$/, ""), f]));
  const logos: Record<string, string> = {};
  const queue = [...SOURCES];

  const worker = async () => {
    for (let source = queue.shift(); source; source = queue.shift()) {
      const old = existing.get(source.id);
      if (old && Date.now() - statSync(path.join(LOGO_DIR, old)).mtimeMs < LOGO_MAX_AGE_MS) {
        logos[source.id] = `/logos/${old}`;
        continue;
      }
      const logo = await getLogo(source);
      const ext = logo && EXTENSIONS[logo.contentType];
      if (logo && ext) {
        const file = `${source.id}.${ext}`;
        if (old && old !== file) rmSync(path.join(LOGO_DIR, old));
        writeFileSync(path.join(LOGO_DIR, file), Buffer.from(logo.bytes));
        logos[source.id] = `/logos/${file}`;
      } else if (old) {
        // Couldn't fetch it this time: keep the one we have.
        logos[source.id] = `/logos/${old}`;
      }
    }
  };
  await Promise.all(Array.from({ length: LOGO_CONCURRENCY }, worker));
  return logos;
}

async function main() {
  const started = Date.now();
  const [news, logos] = await Promise.all([getNews({ force: true }), updateLogos()]);

  const bySource = new Map<string, SourceResult>();
  for (const status of news.statuses) bySource.set(status.sourceId, { ...status, items: [] });
  for (const item of news.items) bySource.get(item.sourceId)?.items.push(item);

  const feed: NewsFeed = { generatedAt: news.generatedAt, results: [...bySource.values()], logos };
  mkdirSync(path.join(PUBLIC, "data"), { recursive: true });
  writeFileSync(path.join(PUBLIC, "data", "news.json"), JSON.stringify(feed));
  flushStores();

  const ok = news.statuses.filter((s) => s.ok).length;
  console.log(
    `${ok}/${news.statuses.length} sources OK, ${news.items.length} headlines, ` +
      `${Object.keys(logos).length} logos (${((Date.now() - started) / 1000).toFixed(1)} s)`,
  );
  for (const s of news.statuses.filter((s) => !s.ok)) console.log(`  ✗ ${s.sourceName}: ${s.error}`);
  process.exit(ok > 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
