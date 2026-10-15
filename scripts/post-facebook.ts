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
 * FB_PAGE_ID (variable) and FB_PAGE_TOKEN (secret) are needed for review and on. The token can be the Page's own, or
 * the business's system user's (with pages_manage_posts on the Page): each run asks Facebook for the Page's token with
 * it (pageToken). FB_SLOTS (variable, optional) replaces the times of day and what goes out at each (see parseSlots):
 * "08:00, 09:15 video, 13:00 roundup, 21:30".
 *
 * What was posted is kept in .social/facebook.json (carried from run to run by the Actions cache), for the repeat,
 * per-day and outlet-rotation rules.
 *
 * Locally, with the live site's headlines and videos: npx tsx scripts/post-facebook.ts --site https://bartaboard.com
 * [--content news|video|roundup] (always a dry run, with or without FB_POSTING; it doesn't write the history either).
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
  type PostContent,
  postLink,
  postMessage,
  postRecord,
  type PostingMode,
  type PostRecord,
  recentHistory,
  shareDay,
  storySection,
} from "../src/lib/page-posts";
import {
  channelBn,
  pickRoundup,
  pickVideo,
  roundupMessage,
  roundupRecord,
  type VideoChoice,
  videoLink,
  videoMessage,
  videoRecord,
  videoStories,
  videoThumbnail,
} from "../src/lib/page-video-posts";
import { unmaskTitle } from "../src/lib/video-stories";
import { DATA_DIR, type PackedFeed, unpackFeed } from "../src/lib/packed";
import { shareKey } from "../src/lib/share";
import { datesToSearch, shardPath, type ShareShard } from "../src/lib/share-lookup";
import type { NewsItem, VideoFeed } from "../src/lib/types";

/** Facebook's Graph API (FB_GRAPH_URL replaces it, for trying the script against a stand-in). */
const GRAPH = process.env.FB_GRAPH_URL ?? "https://graph.facebook.com/v23.0";
const STATE_FILE = path.join(process.cwd(), ".social", "facebook.json");
const PUBLIC = path.join(process.cwd(), "public");
/** How far ahead of its slot a post is scheduled in review mode. */
const REVIEW_LEAD_MS = 45 * 60_000;

const args = process.argv.slice(2);
const siteArg = args.includes("--site") ? args[args.indexOf("--site") + 1] : undefined;
const local = !!siteArg;
const contentArg = args.includes("--content") ? args[args.indexOf("--content") + 1] : undefined;
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

/** The token posts are made with: FB_PAGE_TOKEN, or the Page's own token got with it (pageToken). */
let token = process.env.FB_PAGE_TOKEN?.trim() ?? "";

async function graph<T>(endpoint: string, params: Record<string, string>, method: "GET" | "POST" = "POST"): Promise<T> {
  const query = new URLSearchParams({ ...params, access_token: token });
  const res = await fetch(method === "GET" ? `${GRAPH}${endpoint}?${query}` : `${GRAPH}${endpoint}`, {
    method,
    body: method === "POST" ? query : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await res.json().catch(() => ({}))) as T & GraphError;
  if (!res.ok || body.error) {
    const e = body.error;
    throw new Error(`Facebook ${res.status}${e?.code ? ` (code ${e.code})` : ""}: ${e?.message ?? "no answer"}`);
  }
  return body;
}

/**
 * The Page's own token. FB_PAGE_TOKEN can be a system user's token (Business settings → System users), which is
 * simpler to make than the Page's; posting needs the Page's, which Facebook gives for it. A Page token is used as is.
 */
async function pageToken(pageId: string): Promise<void> {
  try {
    const { access_token } = await graph<{ access_token?: string }>(`/${pageId}`, { fields: "access_token" }, "GET");
    if (access_token) token = access_token;
  } catch (err) {
    // A Page's own token may not be allowed to ask: it is used as it is, and posting says if it can't.
    warn(`Page token not looked up (${(err as Error).message}); using FB_PAGE_TOKEN as it is.`);
  }
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

  const lead = mode === "review" ? REVIEW_LEAD_MS : 0;
  const slots = parseSlots(process.env.FB_SLOTS);
  // Locally, what the next slot of that kind (--content, default news) would get, whatever the time.
  const due =
    dueSlot(now, history, slots, lead) ?? (local ? { slot: now, at: now, content: (contentArg ?? "news") as PostContent } : null);
  const at = due ? due.at : mode === "review" ? now + MIN_SCHEDULE_MS : now;
  const fields = {
    kind: (due ? "slot" : "breaking") as PostRecord["kind"],
    at: new Date(at).toISOString(),
    mode,
    ...(due && { slot: new Date(due.slot).toISOString() }),
  };

  let plan: Plan | null;
  if (due && due.content !== "news") {
    const feed = await load<VideoFeed>("/data/videos.json");
    if (!feed) {
      warn("No videos to choose from (public/data/videos.json is missing).");
      return;
    }
    const stories = videoStories(feed.videos, now);
    const single = () => {
      const choice = pickVideo(stories, { now, at, history });
      return choice && videoPlan(choice, fields);
    };
    const cards = due.content === "roundup" ? pickRoundup(stories, { now, at, history }) : [];
    // A roundup with too few stories, or one Facebook won't take, goes out as a video post instead.
    plan = cards.length ? roundupPlan(cards, fields, single) : single();
  } else {
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
    const choice = pickStory(stories, { now, at, history, hasPicture: (it) => withPicture.has(it), breaking: !due });
    plan = choice && newsPlan(choice, fields, now);
    if (!plan && !due) {
      console.log(`No slot due and no breaking story (${stories.length} stories from ${items.length} headlines).`);
      return;
    }
  }
  if (!plan) {
    console.log(`Slot ${fields.slot} (${due?.content}): nothing passes the rules yet; the next run looks again.`);
    return;
  }

  if (mode !== "dry") {
    const posted = await publish(plan, pageId, at, now);
    if (!posted) return;
    plan = posted;
  }
  writeHistory([...history, plan.record]);

  const when = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit" }).format(at);
  const verb = mode === "dry" ? "Would post" : at > now + 60_000 ? "Scheduled" : "Posted";
  summary(
    [
      `### Facebook: ${verb} ${plan.record.content} (${fields.kind}, ${when} Dhaka)`,
      "",
      "```",
      plan.params.message,
      plan.params.link,
      ...plan.cards.map((c) => `  ▸ ${c}`),
      "```",
      "",
      plan.note + (plan.record.id ? ` · post ${plan.record.id}` : ""),
      "",
    ].join("\n"),
  );
}

/** A post ready to make: what is sent to Facebook, its record, and what the summary says of it. */
interface Plan {
  params: Record<string, string> & { message: string; link: string };
  /** Links Facebook should read afresh first. */
  links: string[];
  record: PostRecord;
  /** A roundup's cards, for the summary. */
  cards: string[];
  note: string;
  /** What goes out if Facebook refuses this one (a roundup: a video post). */
  fallback?: () => Plan | null;
}

type Fields = Pick<PostRecord, "kind" | "at" | "mode"> & Partial<Pick<PostRecord, "slot">>;

function newsPlan(choice: PostChoice, fields: Fields, now: number): Plan {
  const link = postLink(SITE, choice.item, now);
  return {
    params: { message: postMessage(choice), link },
    links: [link],
    record: postRecord(choice, { ...fields, link }),
    cards: [],
    note: `Section: ${storySection(choice.story)} · outlets: ${choice.outlets} · credited: ${choice.item.sourceName}`,
  };
}

function videoPlan(choice: VideoChoice, fields: Fields): Plan {
  const link = videoLink(SITE, choice.video);
  return {
    params: { message: videoMessage(choice), link },
    links: [link],
    record: videoRecord(choice, { ...fields, link }),
    cards: [],
    note: `Channels: ${choice.story.channels} · credited: ${choice.video.channel}`,
  };
}

/** A carousel: a card per video, each linking its Bartaboard page, the post itself the Videos page. */
function roundupPlan(cards: VideoChoice[], fields: Fields, fallback: () => Plan | null): Plan {
  const link = `${SITE}/bn/videos/`;
  const links = cards.map((c) => videoLink(SITE, c.video));
  const children = cards.map((c, i) => ({
    link: links[i],
    name: unmaskTitle(c.video.title),
    description: channelBn(c.video.channel),
    picture: videoThumbnail(c.video),
  }));
  return {
    params: {
      message: roundupMessage(cards, Date.parse(fields.at)),
      link,
      child_attachments: JSON.stringify(children),
      multi_share_optimized: "false",
      multi_share_end_card: "false",
    },
    links,
    record: roundupRecord(cards, { ...fields, link }),
    cards: links,
    note: `Roundup of ${cards.length}: ${cards.map((c) => c.video.channel).join(", ")}`,
    fallback,
  };
}

/** Makes the post (scheduled for `at` when that is ahead); its fallback if Facebook refuses it. Null: not posted. */
async function publish(plan: Plan, pageId: string, at: number, now: number, fallingBack = false): Promise<Plan | null> {
  if (!fallingBack) await pageToken(pageId);
  try {
    for (const link of plan.links) await rescrape(link);
    const params: Record<string, string> = { ...plan.params };
    if (at - now >= MIN_SCHEDULE_MS - 60_000) {
      params.published = "false";
      params.scheduled_publish_time = String(Math.floor(at / 1000));
    }
    const { id } = await graph<{ id: string }>(`/${pageId}/feed`, params);
    plan.record.id = id;
    return plan;
  } catch (err) {
    const message = (err as Error).message;
    const fallback = plan.fallback?.();
    // A token or permission problem would refuse the fallback too.
    if (fallback && !/code (190|10|200)\b/.test(message)) {
      warn(`Roundup not posted (${message}); posting a video instead.`);
      return publish(fallback, pageId, at, now, true);
    }
    warn(`Not posted: ${message}`);
    return null;
  }
}

main().catch((err) => warn(`Facebook posting stopped: ${(err as Error).stack ?? err}`));
