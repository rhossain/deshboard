/**
 * Posts the next story to Bartaboard's Facebook Page: npm run post:facebook
 *
 * Run by the deploy (.github/workflows/deploy.yml) after the site is uploaded, so the short link it posts already
 * works. Which story, and when, is src/lib/page-posts.ts; how to set it up is docs/facebook-posting.md.
 *
 * FB_POSTING (repository variable) says what it does:
 *   off (or unset)  nothing
 *   dry             picks as it would, and writes the pick to the run's summary, posting nothing
 *   review          schedules each post 45 minutes ahead, so it can be checked (and deleted) in Meta Business Suite
 *   on              posts straight away
 * FB_PAGE_ID (variable) and FB_PAGE_TOKEN (secret, a Page access token with pages_manage_posts) are needed for review
 * and on. FB_SLOTS (variable, optional) replaces the times of day: "08:00, 13:00, 21:30".
 *
 * What was posted is kept in .social/facebook.json (carried from run to run by the Actions cache), for the repeat,
 * per-day and outlet-rotation rules.
 *
 * Locally, with the live site's headlines: npx tsx scripts/post-facebook.ts --site https://bartaboard.com
 * (always a dry run, with or without FB_POSTING; it doesn't write the history either).
 *
 * Never fails the deploy: a Facebook error is reported as a warning, and the next run tries again.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  dueSlot,
  MIN_SCHEDULE_MS,
  pageStories,
  parseSlots,
  pickStory,
  type PostChoice,
  postLink,
  postMessage,
  postRecord,
  type PostingMode,
  type PostRecord,
  recentHistory,
  shareDay,
} from "../src/lib/page-posts";
import { DATA_DIR, type PackedFeed, unpackFeed } from "../src/lib/packed";
import { shareKey } from "../src/lib/share";
import { datesToSearch, shardPath, type ShareShard } from "../src/lib/share-lookup";
import type { NewsItem } from "../src/lib/types";

/** Facebook's Graph API (FB_GRAPH_URL replaces it, for trying the script against a stand-in). */
const GRAPH = process.env.FB_GRAPH_URL ?? "https://graph.facebook.com/v23.0";
const STATE_FILE = path.join(process.cwd(), ".social", "facebook.json");
const PUBLIC = path.join(process.cwd(), "public");
/** How far ahead of its slot a post is scheduled in review mode. */
const REVIEW_LEAD_MS = 45 * 60_000;

const args = process.argv.slice(2);
const siteArg = args.includes("--site") ? args[args.indexOf("--site") + 1] : undefined;
const local = !!siteArg;
const SITE = (siteArg ?? process.env.SITE_URL ?? "https://bartaboard.com").replace(/\/+$/, "");

const setting = (process.env.FB_POSTING ?? "").trim().toLowerCase();
const mode: PostingMode | "off" = local ? "dry" : setting === "dry" || setting === "review" || setting === "on" ? setting : "off";

/** A file the build wrote under public/, or with --site, the live site's copy. */
async function load<T>(file: string): Promise<T | null> {
  try {
    if (local) {
      const res = await fetch(`${SITE}${file}`);
      return res.ok ? ((await res.json()) as T) : null;
    }
    const at = path.join(PUBLIC, file);
    return existsSync(at) ? (JSON.parse(readFileSync(at, "utf8")) as T) : null;
  } catch {
    return null;
  }
}

function readHistory(): PostRecord[] {
  try {
    return (JSON.parse(readFileSync(STATE_FILE, "utf8")) as { posts: PostRecord[] }).posts;
  } catch {
    return [];
  }
}

function writeHistory(posts: PostRecord[]) {
  if (local) return;
  mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, `${JSON.stringify({ posts }, null, 1)}\n`);
}

const warn = (message: string) => console.log(process.env.GITHUB_ACTIONS ? `::warning::${message}` : `! ${message}`);

/** A line or table in the run's summary page on GitHub (and the log). */
function summary(markdown: string) {
  console.log(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
}

/**
 * Which headlines are in the share index, and with a picture: a short link to one that isn't would show "this
 * headline has left Bartaboard", and one without a picture makes a bare preview.
 */
async function picturesFor(items: NewsItem[], now: number): Promise<Set<NewsItem>> {
  const shards = new Map<string, Promise<ShareShard | null>>();
  const shard = (file: string) => {
    if (!shards.has(file)) shards.set(file, load<ShareShard>(file));
    return shards.get(file)!;
  };
  const withPicture = new Set<NewsItem>();
  await Promise.all(
    items.map(async (it) => {
      const key = shareKey(it.link);
      for (const dir of datesToSearch(shareDay(it, now))) {
        const entry = (await shard(shardPath(dir, key)))?.[key];
        if (!entry) continue;
        if (entry[7]) withPicture.add(it);
        return;
      }
    }),
  );
  return withPicture;
}

interface GraphError {
  error?: { message?: string; code?: number; error_subcode?: number };
}

async function graph<T>(endpoint: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(`${GRAPH}${endpoint}`, {
    method: "POST",
    body: new URLSearchParams({ ...params, access_token: process.env.FB_PAGE_TOKEN ?? "" }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await res.json().catch(() => ({}))) as T & GraphError;
  if (!res.ok || body.error) {
    const e = body.error;
    throw new Error(`Facebook ${res.status}${e?.code ? ` (code ${e.code})` : ""}: ${e?.message ?? "no answer"}`);
  }
  return body;
}

/** Has Facebook read the link afresh (title, picture), so the post never shows an old or empty preview. */
async function rescrape(link: string) {
  try {
    await graph("/", { id: link, scrape: "true" });
  } catch (err) {
    // Facebook reads it anyway when the post is made.
    warn(`Link preview not refreshed: ${(err as Error).message}`);
  }
}

async function main() {
  if (mode === "off") {
    console.log("Facebook posting is off (set the FB_POSTING repository variable to dry, review or on).");
    return;
  }
  const pageId = process.env.FB_PAGE_ID ?? "";
  if (mode !== "dry" && (!pageId || !process.env.FB_PAGE_TOKEN)) {
    warn(`FB_POSTING is ${mode}, but FB_PAGE_ID or FB_PAGE_TOKEN is missing: nothing posted.`);
    return;
  }

  const now = Date.now();
  // A dry run's picks were never posted: they don't count once posting is real.
  let history = recentHistory(readHistory(), now);
  if (mode !== "dry") history = history.filter((p) => p.mode !== "dry");
  // Written every run, old posts dropped, so the cache always has a file to keep.
  writeHistory(history);

  const packed = await load<PackedFeed>(`${DATA_DIR}/news.json`);
  if (!packed) {
    warn("No headlines to choose from (public/data/v2/news.json is missing).");
    return;
  }
  const items = unpackFeed(packed).results.flatMap((r) => r.items);
  const stories = pageStories(items, now);
  const withPicture = await picturesFor(
    stories.flatMap((s) => s.items),
    now,
  );
  const hasPicture = (it: NewsItem) => withPicture.has(it);

  const lead = mode === "review" ? REVIEW_LEAD_MS : 0;
  // Locally, what the next slot would get, whatever the time.
  const due = dueSlot(now, history, parseSlots(process.env.FB_SLOTS), lead) ?? (local ? { slot: now, at: now } : null);
  let kind: PostRecord["kind"];
  let at: number;
  let choice: PostChoice | null;
  if (due) {
    kind = "slot";
    at = due.at;
    choice = pickStory(stories, { now, at, history, hasPicture });
    if (!choice) {
      console.log(`Slot ${new Date(due.slot).toISOString()}: no story passes the rules yet; the next run looks again.`);
      return;
    }
  } else {
    kind = "breaking";
    at = mode === "review" ? now + MIN_SCHEDULE_MS : now;
    choice = pickStory(stories, { now, at, history, hasPicture, breaking: true });
    if (!choice) {
      console.log(`No slot due and no breaking story (${stories.length} stories from ${items.length} headlines).`);
      return;
    }
  }

  const link = postLink(SITE, choice.item, now);
  const message = postMessage(choice);
  const record = postRecord(choice, {
    kind,
    at: new Date(at).toISOString(),
    link,
    mode,
    ...(due && { slot: new Date(due.slot).toISOString() }),
  });

  if (mode !== "dry") {
    try {
      await rescrape(link);
      const params: Record<string, string> = { message, link };
      if (at - now >= MIN_SCHEDULE_MS - 60_000) {
        params.published = "false";
        params.scheduled_publish_time = String(Math.floor(at / 1000));
      }
      const { id } = await graph<{ id: string }>(`/${pageId}/feed`, params);
      record.id = id;
    } catch (err) {
      warn(`Not posted: ${(err as Error).message}`);
      return;
    }
  }
  writeHistory([...history, record]);

  const when = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit" }).format(at);
  const verb = mode === "dry" ? "Would post" : at > now + 60_000 ? "Scheduled" : "Posted";
  const outlets = new Set(choice.story.items.map((it) => it.sourceName)).size;
  summary(
    [
      `### Facebook: ${verb} (${kind}, ${when} Dhaka)`,
      "",
      "```",
      message,
      link,
      "```",
      "",
      `Section: ${record.category} · outlets: ${outlets} · credited: ${choice.item.sourceName}` +
        (record.id ? ` · post ${record.id}` : ""),
      "",
    ].join("\n"),
  );
}

main().catch((err) => warn(`Facebook posting stopped: ${(err as Error).stack ?? err}`));
