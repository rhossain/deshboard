/**
 * Bartaboard's Instagram posts, through the admin's queue: npm run post:instagram (docs/instagram.md).
 *
 * Run by the deploy (.github/workflows/deploy.yml) after the Facebook step. Each run:
 *   1. drafts a carousel of headlines for each Instagram time coming up (settings: instagramTimes; by default the
 *      Page's headline times), `draftLeadMinutes` ahead, refreshed every run until someone touches it — or one
 *      headline, when too few stories pass for a carousel
 *   2. draws each open post's pictures (src/lib/instagram-cards.ts) whenever its cards changed, and stores them in
 *      the admin's database, from where bartaboard.com/ig/… serves them (functions/ig)
 *   3. posts what is due, as the Page's queue does (approved, or a draft whose policy lets it; missed after 45 minutes)
 * Drafts, approvals and edits are the Page's own: the admin's queue (Instagram tab) and the Telegram bot.
 *
 * IG_POSTING (repository variable) says what it does:
 *   off (or unset)  nothing
 *   dry             all of the above, but nothing is sent to Instagram: posts due are marked "trial picks"
 *   on              posts to Instagram
 * It needs the admin's database (CLOUDFLARE_ACCOUNT_ID, SOCIAL_DB_TOKEN), and for `on` FB_PAGE_ID and FB_PAGE_TOKEN:
 * the business's system user's token, with instagram_basic and instagram_content_publish, and the Instagram account
 * connected to the Page. IG_USER_ID (variable, optional) names the account instead of asking the Page.
 *
 * Locally, against the live site's headlines and a SQLite file for the queue (always dry; --pictures writes the
 * drawn cards there too): npx tsx scripts/post-instagram.ts --site https://bartaboard.com --db /tmp/ig.sqlite [--pictures out/]
 *
 * Never fails the deploy: a problem is reported as a warning, and the next run tries again.
 */
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { graphFromEnv } from "../src/lib/facebook-graph";
import { cardAssets, renderSlides, slidesKey } from "../src/lib/instagram-cards";
import { publishToInstagram } from "../src/lib/instagram-graph";
import { IG_MAX_HEADLINES, imageUrl, instagramCaption, instagramSlots, postImages, slideSetOf } from "../src/lib/instagram-post";
import { DATA_DIR, type PackedFeed, unpackFeed } from "../src/lib/packed";
import {
  HISTORY_MS,
  headlinesRecord,
  pageStories,
  pickHeadlines,
  pickStory,
  type PostChoice,
  postLink,
  postRecord,
  type PostingMode,
  type PostRecord,
  storySection,
  storyTitles,
  withFeedTitles,
} from "../src/lib/page-posts";
import { articleProblem, checkedPick, firstProblem, textProblem } from "../src/lib/post-checks";
import { shareKey } from "../src/lib/share";
import { sourceName } from "../src/lib/bn-names";
import { findStories } from "../src/lib/stories";
import { apiAccessFromEnv, type Db, fromApi, type SqlValue } from "../src/lib/social-db";
import { blockSets, MISSED_MS, queueAction, sameStories, slotsToDraft } from "../src/lib/social-queue";
import { editable, queueSettings } from "../src/lib/social-settings";
import {
  activeBlocks,
  type Card,
  hasMedia,
  insertPost,
  listPosts,
  type PostStatus,
  pruneMedia,
  putMedia,
  readSettings,
  recordRun,
  type SocialPost,
  StaleError,
  updatePost,
} from "../src/lib/social-store";
import { editMessage, sendMessage, telegramFromEnv } from "../src/lib/telegram";
import { CONTENT_LABEL, previewOf, reviewButtons, reviewText } from "../src/lib/telegram-review";
import type { NewsItem } from "../src/lib/types";

const args = process.argv.slice(2);
const arg = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const siteArg = arg("--site");
const local = !!siteArg;
const picturesDir = arg("--pictures");
const SITE = (siteArg ?? process.env.SITE_URL ?? "https://bartaboard.com").replace(/\/+$/, "");
const PUBLIC = path.join(process.cwd(), "public");

const setting = (process.env.IG_POSTING ?? "").trim().toLowerCase();
const mode: "off" | "dry" | "on" = local ? "dry" : setting === "dry" || setting === "on" ? setting : "off";

/** Pictures are drawn for posts going out within this long (and stored a few days, for the admin to show). */
const DRAW_AHEAD_MS = 6 * 3600_000;
const KEEP_MEDIA_MS = 4 * 86_400_000;

const warn = (message: string) => console.log(process.env.GITHUB_ACTIONS ? `::warning::${message}` : `! ${message}`);

function summary(markdown: string) {
  console.log(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
}

const iso = (ms: number) => new Date(ms).toISOString();
const dhakaTime = (ms: number) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit" }).format(ms);

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

/** The admin's database: through Cloudflare's API, or locally a SQLite file (--db path). */
async function queueDb(): Promise<Db | null> {
  const file = arg("--db");
  if (file) return sqliteDb(file);
  const access = apiAccessFromEnv(process.env, existsSync("wrangler.toml") ? readFileSync("wrangler.toml", "utf8") : undefined);
  return access ? fromApi(access) : null;
}

async function sqliteDb(file: string): Promise<Db> {
  const { DatabaseSync } = (await import("node:sqlite" as string)) as {
    DatabaseSync: new (f: string) => {
      exec(sql: string): void;
      prepare(sql: string): { all(...p: SqlValue[]): unknown[]; get(...p: SqlValue[]): unknown; run(...p: SqlValue[]): { changes: number | bigint } };
    };
  };
  const fresh = !existsSync(file);
  const sqlite = new DatabaseSync(file);
  if (fresh) {
    const dir = path.join(process.cwd(), "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) sqlite.exec(readFileSync(path.join(dir, f), "utf8"));
  }
  return {
    all: async <T>(sql: string, p: SqlValue[] = []) => sqlite.prepare(sql).all(...p) as T[],
    first: async <T>(sql: string, p: SqlValue[] = []) => (sqlite.prepare(sql).get(...p) as T | undefined) ?? null,
    run: async (sql: string, p: SqlValue[] = []) => ({ changes: Number(sqlite.prepare(sql).run(...p).changes) }),
  };
}

/** Posts that count for the picking rules: out, or on their way (and, on a trial, its picks). */
const COUNTED: PostStatus[] = ["approved", "posting", "posted"];
/** A slot's post that holds it: a new draft isn't made for it (a trial pick too: that slot had its turn). */
const HOLDING: PostStatus[] = ["draft", "approved", "posting", "posted", "skipped", "dry"];
const OPEN: PostStatus[] = ["draft", "approved", "failed"];

interface Picking {
  now: number;
  items: NewsItem[];
  titles: Map<string, string[]>;
  blocks: ReturnType<typeof blockSets>;
}

type Fields = Pick<PostRecord, "kind" | "at" | "mode"> & Partial<Pick<PostRecord, "slot">>;

/** A post as the queue keeps it. */
interface Composed {
  content: "headlines" | "news";
  message: string;
  link: string;
  params: Record<string, string>;
  cards: Card[];
  record: PostRecord;
  note: string;
}

function cardOf(c: PostChoice, now: number): Card {
  return {
    link: postLink(SITE, c.item, now),
    title: c.item.title,
    source: sourceName(c.item.sourceId, c.item.sourceName, "bn"),
    sourceId: c.item.sourceId,
    section: storySection(c.story),
    key: shareKey(c.item.link),
    outlets: c.outlets,
  };
}

/**
 * The post for a slot at `at`: a carousel of headlines by the Page's own rules (page-posts.ts pickHeadlines) against
 * Instagram's own history, or one headline when too few pass. Pictures aren't needed (Instagram's are drawn), but each
 * headline's text and outlet are checked, and its article must still be there.
 */
async function compose(p: Picking, at: number, fields: Fields, history: PostRecord[]): Promise<{ post: Composed | null; why?: string }> {
  const { now, blocks } = p;
  const posted = withFeedTitles(history, (key) => p.titles.get(key));
  const items = p.items.filter((it) => !blocks.outlets.has(it.sourceId) && !blocks.hasWord(it.title));
  const stories = pageStories(items, now).filter(
    (s) => !blocks.sections.has(storySection(s)) && !s.items.some((it) => blocks.keys.has(shareKey(it.link))),
  );
  const failed = new Set<NewsItem>();
  const options = { now, at, history: posted, hasPicture: (it: NewsItem) => !failed.has(it) };
  const check = (c: PostChoice) =>
    firstProblem(
      Promise.resolve(textProblem("headline", c.item.title)),
      Promise.resolve(textProblem("outlet name", sourceName(c.item.sourceId, c.item.sourceName, "bn"))),
      articleProblem(c.item),
    );
  const pick = (label: string, cards: () => PostChoice[]) => checkedPick(label, cards, (c) => c.item, check, (c) => failed.add(c.item), warn);
  const chosen = (await pick("Instagram carousel", () => pickHeadlines(stories, options))).slice(0, IG_MAX_HEADLINES);
  if (chosen.length) {
    const cards = chosen.map((c) => cardOf(c, now));
    const link = `${SITE}/bn/`;
    return {
      post: {
        content: "headlines",
        message: instagramCaption(cards, at),
        link,
        // The cards as Facebook's carousel keeps them, so the admin's edits (order, add, remove) work the same.
        params: { message: instagramCaption(cards, at), link, child_attachments: JSON.stringify(cards.map((c) => ({ link: c.link, name: c.title, description: c.source }))) },
        cards,
        record: headlinesRecord(chosen, { ...fields, link }),
        note: `Headlines: ${chosen.map((c) => `${c.item.sourceName} (${storySection(c.story)})`).join(", ")}`,
      },
    };
  }
  const [one] = await pick("Instagram headline", () => [pickStory(stories, options)].filter((c): c is PostChoice => !!c));
  if (!one) return { post: null, why: `${stories.length} stories from ${items.length} headlines, none passes` };
  const card = cardOf(one, now);
  return {
    post: {
      content: "news",
      message: instagramCaption([card], at),
      link: card.link,
      params: { message: instagramCaption([card], at), link: card.link },
      cards: [card],
      record: postRecord(one, { ...fields, link: card.link }),
      note: `Section: ${storySection(one.story)} · outlets: ${one.outlets} · credited: ${one.item.sourceName}`,
    },
  };
}

async function loadPicking(now: number, db: Db): Promise<Picking | null> {
  const packed = await load<PackedFeed>(`${DATA_DIR}/news.json`);
  if (!packed) return null;
  const items = unpackFeed(packed).results.flatMap((r) => r.items);
  // The titles every story has now, so one told another way is known as posted (withFeedTitles).
  const titles = storyTitles(
    findStories(items.filter((it) => it.lang === "bn"), { minOutlets: 1, maxAgeMs: 2 * 86_400_000, now }).map((s) =>
      s.items.map((it): [string, string] => [shareKey(it.link), it.title]),
    ),
  );
  return { now, items, titles, blocks: blockSets(await activeBlocks(db)) };
}

async function main() {
  if (mode === "off") return;
  const found = await queueDb();
  if (!found) {
    warn("IG_POSTING is set, but the admin's database can't be reached (CLOUDFLARE_ACCOUNT_ID, SOCIAL_DB_TOKEN): nothing done for Instagram.");
    return;
  }
  const db: Db = found;
  const dryRun = mode === "dry";
  const fb = graphFromEnv(process.env);
  if (!dryRun && !fb) {
    warn("IG_POSTING is on, but FB_PAGE_ID or FB_PAGE_TOKEN is missing: nothing posted to Instagram.");
    return;
  }
  const igUserId = process.env.IG_USER_ID?.trim() || undefined;
  const now = Date.now();
  const label = dryRun ? "Instagram (trial)" : "Instagram";
  const report: string[] = [];
  const settings = queueSettings(await readSettings(db));
  const slots = instagramSlots(settings.instagramTimes);
  const tg = telegramFromEnv(process.env);
  const assets = cardAssets();
  const postMode: PostingMode = dryRun ? "dry" : "on";
  try {
    await run();
  } catch (err) {
    // Recorded, so the admin's Health page says why (the next run starts afresh).
    const message = (err as Error).message;
    warn(`Instagram posting stopped: ${(err as Error).stack ?? message}`);
    report.push(`stopped: ${message}`);
    if (!local) await recordRun(db, dryRun ? "instagram-dry" : "instagram", false, report).catch(() => undefined);
    return;
  }
  if (!local) await recordRun(db, dryRun ? "instagram-dry" : "instagram", true, report);
  summary([`### ${label}`, "", ...(report.length ? report.map((l) => `- ${l}`) : ["- nothing to do"]), ""].join("\n"));

  async function run() {

    let rows = await listPosts(db, { platform: "instagram", from: iso(now - HISTORY_MS), limit: 2000 });
    const replace = (post: SocialPost) => (rows = rows.map((r) => (r.id === post.id ? post : r)));
    const counted = () => rows.filter((r) => r.record && (COUNTED.includes(r.status) || (dryRun && r.status === "dry"))).map((r) => r.record!);

    /** The post's Telegram message, as the post now stands (sent for an open post unless `existingOnly`). */
    const show = async (post: SocialPost, o: { refreshed?: boolean; existingOnly?: boolean; silent?: boolean } = {}): Promise<SocialPost> => {
      if (!tg || local) return post;
      const opts = { site: SITE, trial: dryRun, refreshed: o.refreshed, lockMinutes: settings.editLockMinutes };
      const send = { buttons: reviewButtons(post, opts), previewUrl: previewOf(post) };
      if (post.telegramMessageId && (await editMessage(tg, post.telegramMessageId, reviewText(post, opts), send))) return post;
      if (o.existingOnly) return post;
      const id = await sendMessage(tg, reviewText(post, opts), { ...send, silent: o.silent });
      if (!id) return post;
      const kept = await updatePost(db, post.id, post.version, { telegramMessageId: id }, "deploy", "telegram");
      replace(kept);
      return kept;
    };

    /** Draws the post's pictures if its cards changed since they were last drawn; the post as it now is (null: changed meanwhile). */
    const draw = async (post: SocialPost): Promise<SocialPost | null> => {
      const set = slideSetOf(post);
      if (!set.cards.length) return post;
      const key = slidesKey(set);
      if (post.params.imagesKey === key && postImages(post).length) return post;
      const pictures = await renderSlides(set, assets);
      const keys = pictures.map((_, i) => `${key}-${i}`);
      for (const [i, picture] of pictures.entries()) {
        if (!(await hasMedia(db, keys[i]))) await putMedia(db, keys[i], picture.toString("base64"));
        if (picturesDir) {
          mkdirSync(picturesDir, { recursive: true });
          writeFileSync(path.join(picturesDir, `${keys[i]}.jpg`), picture);
        }
      }
      const images = keys.map((k) => imageUrl(SITE, k));
      try {
        const drawn = await updatePost(db, post.id, post.version, { params: { ...post.params, images: JSON.stringify(images), imagesKey: key } }, "deploy", "pictures", { images: images.length });
        replace(drawn);
        return drawn;
      } catch (err) {
        if (err instanceof StaleError) return null; // edited meanwhile: drawn again next run
        throw err;
      }
    };

    const picking = await loadPicking(now, db);
    if (!picking) {
      warn("No headlines to choose from (public/data/v2/news.json is missing): no Instagram drafts this run.");
    }

    // 1. Drafts for the times coming up.
    if (picking) {
      for (const s of slotsToDraft(now, slots, settings.draftLeadMinutes * 60_000)) {
        const slot = iso(s.at);
        const current = rows.find((r) => r.slot === slot && HOLDING.includes(r.status));
        if (current && (current.status !== "draft" || current.locked)) continue;
        // Within the edit lock the draft stays as it was last shown.
        if (current && !editable(current.scheduledAt, settings.editLockMinutes, now)) continue;
        // Other open drafts count as posted, so two drafts never pick the same story.
        const others = rows.filter((r) => r !== current && ["draft", "approved"].includes(r.status) && r.record).map((r) => r.record!);
        const fields: Fields = { kind: "slot", at: slot, mode: postMode, slot };
        const { post: values, why } = await compose(picking, s.at, fields, [...counted(), ...others]);
        if (!values) {
          report.push(`${dhakaTime(s.at)}: ${why ?? "nothing passes"}${current ? " (the draft stays)" : ""}`);
          continue;
        }
        if (!current) {
          const post = await insertPost(db, { platform: "instagram", kind: "slot", status: "draft", policy: settings.slotPolicy, slot, scheduledAt: slot, ...values });
          if (!post) continue;
          rows.push(post);
          report.push(`${dhakaTime(s.at)}: draft made, ${post.cards.length} headline${post.cards.length > 1 ? "s" : ""} (${post.id})`);
          await show((await draw(post)) ?? post);
        } else if (!sameStories(current.record, values.record) || current.message !== values.message) {
          const post = await updatePost(db, current.id, current.version, values, "deploy", "refresh");
          replace(post);
          report.push(`${dhakaTime(s.at)}: draft refreshed (${post.id})`);
          await show((await draw(post)) ?? post, { refreshed: true, silent: true });
        }
      }
    }

    // 2. Pictures for open posts whose cards changed (an edit in the admin, a post added there).
    for (const row of rows.filter((r) => OPEN.includes(r.status) && Date.parse(r.scheduledAt) < now + DRAW_AHEAD_MS && Date.parse(r.scheduledAt) > now - MISSED_MS)) {
      if (row.params.imagesKey === slidesKey(slideSetOf(row)) && postImages(row).length) continue;
      const drawn = await draw(row);
      if (drawn) {
        report.push(`${dhakaTime(Date.parse(row.scheduledAt))}: pictures drawn (${postImages(drawn).length})`);
        await show(drawn, { existingOnly: true });
      }
    }

    // 3. What is due goes out.
    const publishRow = async (row: SocialPost): Promise<void> => {
      let post: SocialPost;
      try {
        post = await updatePost(db, row.id, row.version, { status: "posting" }, "deploy", "claim");
      } catch (err) {
        if (err instanceof StaleError) return; // changed in the admin meanwhile: the next run looks again
        throw err;
      }
      replace(post);
      const at = Date.parse(post.scheduledAt);
      // The pictures as the cards now are (drawn here if a change came after the last run).
      const drawn = await draw(post);
      if (!drawn) return;
      post = drawn;
      const images = postImages(post);
      const record = post.record ? { ...post.record, at: iso(now), mode: postMode } : null;
      if (dryRun) {
        const dry = await updatePost(db, post.id, post.version, { status: "dry", record, decidedBy: post.decidedBy ?? "auto" }, "deploy", "dry");
        replace(dry);
        await show(dry, { existingOnly: true });
        report.push(`${dhakaTime(at)}: trial pick, ${images.length} picture${images.length === 1 ? "" : "s"} — ${images[0] ?? ""}`);
        return;
      }
      try {
        if (!images.length) throw new Error("it has no pictures");
        const made = await publishToInstagram(fb!, { images, caption: post.params.message ?? post.message }, { igUserId });
        const done = await updatePost(
          db,
          post.id,
          post.version,
          {
            status: "posted",
            fbPostId: made.id,
            permalink: made.permalink,
            postedAt: iso(now),
            record: record && { ...record, id: made.id },
            error: null,
            decidedBy: post.decidedBy ?? "auto",
            decidedAt: post.decidedAt ?? iso(now),
          },
          "deploy",
          "posted",
        );
        replace(done);
        await show(done, { existingOnly: true });
        report.push(`${dhakaTime(at)}: posted to Instagram (@${made.account.username ?? made.account.id}) ${made.permalink ?? made.id}`);
      } catch (err) {
        const message = (err as Error).message;
        const failed = await updatePost(db, post.id, post.version, { status: "failed", error: message }, "deploy", "failed");
        replace(failed);
        await show(failed, { existingOnly: true });
        warn(`Instagram: not posted (${dhakaTime(at)}): ${message}`);
        report.push(`${dhakaTime(at)}: not posted — ${message}`);
        if (tg && !local) {
          await sendMessage(tg, `⚠️ Instagram: not posted (${dhakaTime(at)}, ${CONTENT_LABEL[post.content] ?? post.content}): ${message}\nThe next run tries again until ${dhakaTime(at + MISSED_MS)}.\n${SITE}/admin/`);
        }
      }
    };

    for (const row of rows.filter((r) => OPEN.includes(r.status)).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))) {
      const action = queueAction(row, now, { publishLead: 0, paused: settings.paused });
      if (action === "miss") {
        const missed = await updatePost(db, row.id, row.version, { status: "skipped", note: `${row.note ?? ""} · missed: not out ${MISSED_MS / 60_000} minutes after its time${settings.paused ? " (paused)" : ""}` }, "deploy", "missed");
        replace(missed);
        await show(missed, { existingOnly: true });
        report.push(`${dhakaTime(Date.parse(row.scheduledAt))}: skipped, missed`);
      } else if (action === "hold") {
        report.push(`${dhakaTime(Date.parse(row.scheduledAt))}: held (${settings.paused ? "posting paused" : "waits for approval"})`);
      } else if (action === "publish") {
        await publishRow(row);
      }
    }

    // Pictures of posts long gone: Instagram keeps its own copy.
    const pruned = await pruneMedia(db, iso(now - KEEP_MEDIA_MS));
    if (pruned) report.push(`${pruned} old picture parts deleted`);
  }
}

main().catch((err) => warn(`Instagram posting stopped: ${(err as Error).stack ?? err}`));
