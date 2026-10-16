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
 * FB_PAGE_ID (variable) and FB_PAGE_TOKEN (secret) are needed for review and on. FB_APP_ID (variable) and
 * FB_APP_SECRET (secret), optional, let it have Facebook re-read links (rescrape). The token can be the Page's own, or
 * the business's system user's (with pages_manage_posts on the Page): each run asks Facebook for the Page's token with
 * it (pageToken). FB_SLOTS (variable, optional) replaces the times of day and what goes out at each (see parseSlots):
 * "08:00, 09:15 video, 13:00 roundup, 21:30".
 *
 * What was posted is kept in .social/facebook.json (carried from run to run by the Actions cache), for the repeat,
 * per-day and outlet-rotation rules.
 *
 * Locally, with the live site's headlines and videos: npx tsx scripts/post-facebook.ts --site https://bartaboard.com
 * [--content headlines|news|video|roundup] (always a dry run, with or without FB_POSTING; it doesn't write the history either).
 *
 * Never fails the deploy: a Facebook error is reported as a warning, and the next run tries again.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  CAROUSEL_CARDS,
  dueSlot,
  headlinesMessage,
  headlinesRecord,
  pickHeadlines,
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
  storyTitles,
  withFeedTitles,
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
import { findStories } from "../src/lib/stories";
import { datesToSearch, shardPath, type ShareShard } from "../src/lib/share-lookup";
import { sourceName } from "../src/lib/bn-names";
import {
  articleProblem,
  checkedPick,
  crawl,
  FALLBACK_TITLE,
  firstProblem,
  linkProblem,
  pictureProblem,
  PREVIEW_RETRY_MS,
  PREVIEW_TRIES,
  textProblem,
  videoProblem,
} from "../src/lib/post-checks";
import type { NewsItem, Video, VideoFeed } from "../src/lib/types";

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

const notice = (message: string) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${message}` : `i ${message}`);
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
async function picturesFor(items: NewsItem[], now: number): Promise<Map<NewsItem, string>> {
  const shards = new Map<string, Promise<ShareShard | null>>();
  const shard = (file: string) => {
    if (!shards.has(file)) shards.set(file, load<ShareShard>(file));
    return shards.get(file)!;
  };
  const withPicture = new Map<NewsItem, string>();
  await Promise.all(
    items.map(async (it) => {
      const key = shareKey(it.link);
      for (const dir of datesToSearch(shareDay(it, now))) {
        const entry = (await shard(shardPath(dir, key)))?.[key];
        if (!entry) continue;
        if (entry[7]) withPicture.set(it, entry[7]);
        return;
      }
    }),
  );
  return withPicture;
}

interface GraphError {
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
    error_user_title?: string;
    error_user_msg?: string;
    fbtrace_id?: string;
  };
}

/** The token posts are made with: FB_PAGE_TOKEN, or the Page's own token got with it (pageToken). */
let token = process.env.FB_PAGE_TOKEN?.trim() ?? "";

/**
 * A Graph API call. POST sends the parameters as a form, or with `inQuery`, in the address (as Facebook's Sharing
 * Debugger does).
 */
async function graph<T>(
  endpoint: string,
  params: Record<string, string>,
  method: "GET" | "POST" = "POST",
  inQuery = false,
): Promise<T> {
  const query = new URLSearchParams({ access_token: token, ...params });
  const res = await fetch(method === "GET" || inQuery ? `${GRAPH}${endpoint}?${query}` : `${GRAPH}${endpoint}`, {
    method,
    body: method === "POST" && !inQuery ? query : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await res.json().catch(() => ({}))) as T & GraphError;
  if (!res.ok || body.error) {
    const e = body.error;
    // Facebook's whole answer (never the token): its subcode and user message say what "Invalid parameter" means.
    const more = [
      e?.error_subcode && `subcode ${e.error_subcode}`,
      e?.error_user_title,
      e?.error_user_msg,
      e?.fbtrace_id && `trace ${e.fbtrace_id}`,
    ].filter(Boolean);
    throw new Error(
      `Facebook ${res.status}${e?.code ? ` (code ${e.code})` : ""}: ${e?.message ?? "no answer"}${more.length ? ` [${more.join("; ")}]` : ""}`,
    );
  }
  return body;
}

/**
 * The Page's own token. FB_PAGE_TOKEN can be a system user's token (Business settings → System users), which is
 * simpler to make than the Page's; posting needs the Page's, which Facebook gives for it. A Page token is used as is.
 */
let pageTokenDone = false;
async function pageToken(pageId: string): Promise<void> {
  if (pageTokenDone) return;
  pageTokenDone = true;
  try {
    const { access_token } = await graph<{ access_token?: string }>(`/${pageId}`, { fields: "access_token" }, "GET");
    if (access_token) token = access_token;
  } catch (err) {
    // A Page's own token may not be allowed to ask: it is used as it is, and posting says if it can't.
    warn(`Page token not looked up (${(err as Error).message}); using FB_PAGE_TOKEN as it is.`);
  }
}

/**
 * In a dry run with FB_PAGE_ID and FB_PAGE_TOKEN set: whether the token reaches the Page and can get its token, as a
 * note on the run (no post is made), so the setup can be checked before posting is turned on.
 */
async function checkToken(pageId: string): Promise<void> {
  try {
    const page = await graph<{ name?: string; access_token?: string }>(`/${pageId}`, { fields: "name,access_token" }, "GET");
    if (page.access_token) notice(`Facebook token works: it reaches the Page "${page.name ?? pageId}" and can post to it.`);
    else warn(`Facebook token reaches the Page "${page.name ?? pageId}" but gets no Page token: check the system user's access to the Page.`);
  } catch (err) {
    warn(`Facebook token check failed: ${(err as Error).message}`);
  }
}


/**
 * Has Facebook read the link afresh, and says what it saw: true when the preview is the link's own (its headline),
 * false when it is the site's fallback card. Facebook keeps the preview it read when a post is made, so a link read
 * at a bad moment (the upload not yet everywhere, a slow answer) would stay broken on the post. `tries` > 1 reads
 * again a little later until the preview is right. Undefined: Facebook didn't answer.
 */
async function rescrape(link: string, tries = 1): Promise<boolean | undefined> {
  // Facebook only takes this from an app token (app id|secret); a Page token gets "Invalid parameter".
  if (!APP_TOKEN) return undefined;
  let seen: string | undefined;
  for (let i = 0; i < tries; i++) {
    if (i) await new Promise((r) => setTimeout(r, PREVIEW_RETRY_MS));
    try {
      const params = { id: link, scrape: "true", access_token: APP_TOKEN };
      type Scraped = { title?: string; og_object?: { title?: string } };
      // As a form first; refused as an invalid parameter, in the address, as the Sharing Debugger sends it.
      const page = await graph<Scraped>("/", params).catch((err: Error) => {
        if (!/code 100\b/.test(err.message)) throw err;
        warn(`Link preview: ${err.message}; trying again with the parameters in the address.`);
        return graph<Scraped>("/", params, "POST", true);
      });
      seen = page.title ?? page.og_object?.title ?? "";
      if (seen && !FALLBACK_TITLE.test(seen)) return true;
    } catch (err) {
      warn(`Link preview not refreshed (${link}): ${(err as Error).message}`);
      return undefined;
    }
  }
  warn(`Link preview of ${link} is still the site's fallback card ("${seen}") after ${tries} reads.`);
  return false;
}

/**
 * Facebook's app token, for re-reading links (rescrape): FB_APP_ID and FB_APP_SECRET (App settings → Basic). Without
 * them links are only checked from here (src/lib/post-checks.ts), and posts already made can't be corrected.
 */
const APP_TOKEN =
  process.env.FB_APP_ID && process.env.FB_APP_SECRET ? `${process.env.FB_APP_ID}|${process.env.FB_APP_SECRET}` : "";

/**
 * Single posts whose preview isn't known to be right (posted before the check, or by a run that couldn't confirm it):
 * Facebook reads their links again, which also corrects the preview on the post itself. Up to a few a run.
 */
async function repairPreviews(history: PostRecord[], now: number): Promise<void> {
  const due = history
    .filter((p) => p.id && p.mode !== "dry" && !p.previewOk && (p.content ?? "news") !== "headlines" && p.content !== "roundup")
    .filter((p) => now - Date.parse(p.at) < 3 * 86_400_000 && Date.parse(p.at) <= now)
    .slice(-3);
  for (const p of due) {
    if (await rescrape(p.link)) {
      p.previewOk = true;
      notice(`Facebook: preview corrected for ${p.link} (${p.title}).`);
    }
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

  if (mode === "dry" && !local) {
    if (pageId && token) await checkToken(pageId);
    else notice(`Facebook token not checked: ${[!pageId && "FB_PAGE_ID", !token && "FB_PAGE_TOKEN"].filter(Boolean).join(" and ")} not set.`);
  }

  const now = Date.now();
  // A dry run's picks were never posted: they don't count once posting is real.
  let history = recentHistory(readHistory(), now);
  if (mode !== "dry") history = history.filter((p) => p.mode !== "dry");
  // Written every run, old posts dropped, so the cache always has a file to keep.
  writeHistory(history);
  if (mode !== "dry" && APP_TOKEN) {
    await pageToken(pageId);
    await repairPreviews(history, now);
    writeHistory(history);
  }

  const lead = mode === "review" ? REVIEW_LEAD_MS : 0;
  const slots = parseSlots(process.env.FB_SLOTS);
  // Locally, what a slot of that kind (--content; else the slot due, else headlines) would get, whatever the time.
  const asked = local ? { slot: now, at: now, content: (contentArg ?? "headlines") as PostContent } : null;
  const due = (contentArg && asked) || dueSlot(now, history, slots, lead) || asked;
  const at = due ? due.at : mode === "review" ? now + MIN_SCHEDULE_MS : now;
  const fields = {
    kind: (due ? "slot" : "breaking") as PostRecord["kind"],
    at: new Date(at).toISOString(),
    mode,
    ...(due && { slot: new Date(due.slot).toISOString() }),
  };

  // Both feeds: what is picked from, and the titles every story posted lately has now (withFeedTitles), so a story
  // told another way, as a headline or a video, is known as posted.
  const feed = await load<VideoFeed>("/data/videos.json");
  const packed = await load<PackedFeed>(`${DATA_DIR}/news.json`);
  const items = packed ? unpackFeed(packed).results.flatMap((r) => r.items) : [];
  const videoGroups = new Map<string, [string, string][]>();
  for (const v of feed?.videos ?? []) {
    const id = v.story ?? v.id;
    videoGroups.set(id, [...(videoGroups.get(id) ?? []), [v.id, unmaskTitle(v.title)]]);
  }
  const titles = storyTitles([
    ...findStories(items.filter((it) => it.lang === "bn"), { minOutlets: 1, maxAgeMs: 2 * 86_400_000, now }).map((s) =>
      s.items.map((it): [string, string] => [shareKey(it.link), it.title]),
    ),
    ...videoGroups.values(),
  ]);
  const posted = withFeedTitles(history, (key) => titles.get(key));

  let plan: Plan | null;
  if (due && (due.content === "video" || due.content === "roundup")) {
    if (!feed) {
      warn("No videos to choose from (public/data/videos.json is missing).");
      return;
    }
    const stories = videoStories(feed.videos, now);
    // Videos that failed a check are left out, and the pick made again.
    const failed = new Set<string>();
    const options = { now, at, history: posted, skip: (v: Video) => failed.has(v.id) };
    const check = (card: boolean) => (c: VideoChoice) =>
      firstProblem(
        Promise.resolve(textProblem("video title", unmaskTitle(c.video.title))),
        Promise.resolve(textProblem("channel name", channelBn(c.video.channel))),
        videoProblem(c.video),
        // A card shows the thumbnail it is given; a video post, the one its link's page names.
        linkProblem(videoLink(SITE, c.video), c.video.title, !card),
        card ? pictureProblem(videoThumbnail(c.video)) : Promise.resolve(null),
      );
    const pick = (label: string, cards: () => VideoChoice[], card: boolean) =>
      checkedPick(label, cards, (c) => c.video.id, check(card), (c) => failed.add(c.video.id), warn);
    const single = async () => {
      const [choice] = await pick("video post", () => [pickVideo(stories, options)].filter((c) => !!c), false);
      return choice ? videoPlan(choice, fields) : null;
    };
    const cards = due.content === "roundup" ? await pick("roundup", () => pickRoundup(stories, options), true) : [];
    // A roundup with too few stories that pass, or one Facebook won't take, goes out as a video post instead.
    plan = cards.length ? roundupPlan(cards, fields, single) : await single();
  } else {
    if (!packed) {
      warn("No headlines to choose from (public/data/v2/news.json is missing).");
      return;
    }
    const stories = pageStories(items, now);
    const withPicture = await picturesFor(
      stories.flatMap((s) => s.items),
      now,
    );
    // Headlines that failed a check are left out (as if they had no picture), and the pick made again.
    const failed = new Set<NewsItem>();
    const options = { now, at, history: posted, hasPicture: (it: NewsItem) => withPicture.has(it) && !failed.has(it) };
    const check = (card: boolean) => (c: PostChoice) =>
      firstProblem(
        Promise.resolve(textProblem("headline", c.item.title)),
        Promise.resolve(textProblem("outlet name", sourceName(c.item.sourceId, c.item.sourceName, "bn"))),
        articleProblem(c.item),
        // A card shows the picture it is given; a single post, the one its link's page names.
        linkProblem(postLink(SITE, c.item, now), c.item.title, !card),
        card ? pictureProblem(withPicture.get(c.item)) : Promise.resolve(null),
      );
    const pick = (label: string, cards: () => PostChoice[], card: boolean) =>
      checkedPick(label, cards, (c) => c.item, check(card), (c) => failed.add(c.item), warn);
    const single = async () => {
      // Nothing to check (no breaking story, the usual case between slots) makes no requests.
      const [choice] = await pick("headline post", () => [pickStory(stories, { ...options, breaking: !due })].filter((c) => !!c), false);
      return choice ? newsPlan(choice, fields, now) : null;
    };
    const cards = due?.content === "headlines" ? await pick("headlines carousel", () => pickHeadlines(stories, options), true) : [];
    // Too few stories that pass for five, or a carousel Facebook won't take: one headline instead.
    plan = cards.length ? headlinesPlan(cards, withPicture, fields, now, single) : await single();
    if (!plan && !due) {
      console.log(`No slot due and no breaking story (${stories.length} stories from ${items.length} headlines).`);
      return;
    }
  }
  if (!plan) {
    console.log(`Slot ${fields.slot} (${due?.content}): nothing passes the rules and checks yet; the next run looks again.`);
    return;
  }
  const problem = await planProblem(plan);
  if (problem) {
    warn(`Not posted: ${problem}; the next run tries again.`);
    return;
  }

  if (mode !== "dry") {
    const posted = await publish(plan, pageId, at, now);
    if (!posted) return;
    plan = posted;
  }
  writeHistory([...history, plan.record]);

  const when = dhakaTime(at);
  const verb = mode === "dry" ? "Would post" : at > now + 60_000 ? "Scheduled" : "Posted";
  const followUp = plan.record.followUpOf ? ` (a follow-up: the story was posted ${dhakaTime(Date.parse(plan.record.followUpOf))} Dhaka, more reports since)` : "";
  if (mode !== "dry") notice(`Facebook: ${verb.toLowerCase()} ${plan.record.content}${followUp} for ${when} Dhaka (post ${plan.record.id}): ${plan.record.title} ${plan.record.link}`);
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
      plan.note + followUp + (plan.record.id ? ` · post ${plan.record.id}` : ""),
      "",
    ].join("\n"),
  );
}

/** A time as Dhaka's clock reads it: "17:30". */
const dhakaTime = (ms: number) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit" }).format(ms);

/** A post ready to make: what is sent to Facebook, its record, and what the summary says of it. */
interface Plan {
  params: Record<string, string> & { message: string; link: string };
  /** Links Facebook should read afresh first. */
  links: string[];
  record: PostRecord;
  /** A roundup's cards, for the summary. */
  cards: string[];
  note: string;
  /** What goes out if Facebook refuses this one (a roundup: a video post), checked as this one was. */
  fallback?: () => Promise<Plan | null>;
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

/** A carousel of headlines: a card per story, each linking its Bartaboard page, the post itself the board. */
function headlinesPlan(
  cards: PostChoice[],
  pictures: Map<NewsItem, string>,
  fields: Fields,
  now: number,
  fallback: () => Promise<Plan | null>,
): Plan {
  const link = `${SITE}/bn/`;
  const links = cards.map((c) => postLink(SITE, c.item, now));
  const children = cards.map((c, i) => ({
    link: links[i],
    name: c.item.title,
    description: sourceName(c.item.sourceId, c.item.sourceName, "bn"),
    picture: pictures.get(c.item)!,
  }));
  return {
    params: {
      message: headlinesMessage(cards, Date.parse(fields.at)),
      link,
      child_attachments: JSON.stringify(children),
      multi_share_optimized: "false",
      multi_share_end_card: "false",
    },
    links,
    record: headlinesRecord(cards, { ...fields, link }),
    cards: links,
    note: `Headlines: ${cards.map((c) => `${c.item.sourceName} (${storySection(c.story)})`).join(", ")}`,
    fallback,
  };
}

/** A carousel: a card per video, each linking its Bartaboard page, the post itself the Videos page. */
function roundupPlan(cards: VideoChoice[], fields: Fields, fallback: () => Promise<Plan | null>): Plan {
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

/**
 * The last look at a post as a whole before it goes out (its cards and links were checked as they were picked): its
 * text, every card's title, outlet and picture there, and the page the post itself links to answering.
 */
async function planProblem(plan: Plan): Promise<string | null> {
  const text = textProblem("the post's text", plan.params.message);
  if (text) return text;
  if (plan.params.child_attachments) {
    const children = JSON.parse(plan.params.child_attachments) as Record<"link" | "name" | "description" | "picture", string>[];
    const least = plan.record.content === "headlines" ? CAROUSEL_CARDS : 3;
    if (children.length < least) return `the carousel has ${children.length} cards, not ${least}`;
    for (const [i, c] of children.entries()) {
      const gap = (["link", "name", "description", "picture"] as const).map((f) => textProblem(`card ${i + 1}'s ${f}`, c[f])).find(Boolean);
      if (gap) return gap;
    }
    const page = await crawl(plan.params.link);
    if (page.status !== 200) return `${plan.params.link} answers ${page.status || `nothing (${page.error})`}`;
  }
  return null;
}

/** Makes the post (scheduled for `at` when that is ahead); its fallback if Facebook refuses it. Null: not posted. */
async function publish(plan: Plan, pageId: string, at: number, now: number, fallingBack = false): Promise<Plan | null> {
  if (!fallingBack) await pageToken(pageId);
  try {
    // A carousel's cards carry their own title and picture; a single post shows only what Facebook reads at its link
    // (checked from here as it was picked), so Facebook reads it afresh, and it waits for a later run if that's wrong.
    const single = !plan.params.child_attachments;
    for (const link of plan.links) {
      const ok = await rescrape(link, single ? PREVIEW_TRIES : 1);
      if (single && ok === false) {
        warn(`Not posted: ${link} would show the site's fallback card; the next run tries again.`);
        return null;
      }
      if (single && ok) plan.record.previewOk = true;
    }
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
    // A token or permission problem would refuse the fallback too.
    if (plan.fallback && !/code (190|10|200)\b/.test(message)) {
      const fallback = await plan.fallback();
      const problem = fallback && (await planProblem(fallback));
      if (fallback && !problem) {
        warn(`Carousel not posted (${message}); posting a single ${plan.record.content === "headlines" ? "headline" : "video"} instead.`);
        return publish(fallback, pageId, at, now, true);
      }
      warn(`Carousel not posted (${message}), and no single post passes the checks${problem ? ` (${problem})` : ""}.`);
      return null;
    }
    warn(`Not posted: ${message}`);
    return null;
  }
}

main().catch((err) => warn(`Facebook posting stopped: ${(err as Error).stack ?? err}`));
