/**
 * What a person can do to a queued post, from the admin (functions/api/admin) or Telegram's buttons alike:
 * approve, reject (and leave its story, outlet or section out for a while), skip, reopen, edit, post now, take down,
 * add a post of their own. Each names the version it was made against (social-store.ts StaleError) and is audited
 * as its actor ("panel:<email>", "telegram").
 */
import type { Db } from "./social-db";
import type { PostRecord } from "./page-posts";

type PostRecordCategory = PostRecord["category"];
import { deletePost, type GraphAccess, postToFeed, rescrape } from "./facebook-graph";
import { editable, editDeadline, queueSettings } from "./social-settings";
import {
  addBlock,
  readSettings,
  canMove,
  type Card,
  getPost,
  insertPost,
  lastRuns,
  type Policy,
  type SocialPost,
  StaleError,
  updatePost,
} from "./social-store";

export class ActionError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly post?: SocialPost | null,
  ) {
    super(message);
  }
}

export interface ActionContext {
  db: Db;
  actor: string;
  fb: GraphAccess | null;
}

const nowIso = () => new Date().toISOString();
const DAY_MS = 86_400_000;

async function load(ctx: ActionContext, id: string, version: number): Promise<SocialPost> {
  const post = await getPost(ctx.db, id);
  if (!post) throw new ActionError(404, "no such post");
  if (post.version !== version) throw new ActionError(409, "this post changed meanwhile: look again", post);
  return post;
}

/** Runs a change, turning a stale version into a 409 the caller can show. */
async function change(ctx: ActionContext, post: SocialPost, changes: Parameters<typeof updatePost>[3], action: string, detail?: unknown) {
  if (changes.status && !canMove(post.status, changes.status)) throw new ActionError(409, `a ${post.status} post can't be ${action}d`, post);
  try {
    return await updatePost(ctx.db, post.id, post.version, changes, ctx.actor, action, detail);
  } catch (err) {
    if (err instanceof StaleError) throw new ActionError(409, "this post changed meanwhile: look again", err.current);
    if (/UNIQUE/i.test((err as Error).message)) throw new ActionError(409, "another post holds this slot now");
    throw err;
  }
}

/** Whether the queue posts for real: its last run wasn't a trial (FB_QUEUE=on). */
export async function queueLive(db: Db): Promise<boolean> {
  const [last] = await lastRuns(db, 1);
  return last?.step === "queue";
}

const OPEN = ["draft", "approved", "failed"];

export async function approve(ctx: ActionContext, id: string, version: number) {
  const post = await load(ctx, id, version);
  return change(ctx, post, { status: "approved", locked: true, decidedBy: ctx.actor, decidedAt: nowIso(), error: null }, "approve");
}

export type BlockScope = "story" | "outlet" | "section";

/**
 * Rejects a draft: it won't go out, and its slot gets another draft on the next run, leaving out its story (and, if
 * asked, its outlet or section) for `hours`.
 */
export async function reject(ctx: ActionContext, id: string, version: number, opts: { reason?: string; scopes?: BlockScope[]; hours?: number } = {}) {
  const post = await load(ctx, id, version);
  const done = await change(ctx, post, { status: "rejected", locked: true, decidedBy: ctx.actor, decidedAt: nowIso(), note: opts.reason ?? post.note }, "reject", opts);
  const until = new Date(Date.now() + (opts.hours ?? 24) * 3600_000).toISOString();
  const scopes = opts.scopes ?? ["story"];
  const r = post.record;
  if (r && scopes.includes("story") && r.keys.length) {
    await addBlock(ctx.db, { type: "story", value: { keys: r.keys, words: r.words }, until, reason: opts.reason ?? "rejected", postId: id }, ctx.actor);
  }
  if (r && scopes.includes("outlet") && r.sourceId) {
    // The outlet (or channel) credited first: a carousel's other cards keep theirs.
    const type = post.content === "video" || post.content === "roundup" ? "channel" : "outlet";
    await addBlock(ctx.db, { type, value: r.sourceId, until, reason: opts.reason ?? "rejected", postId: id }, ctx.actor);
  }
  if (r && scopes.includes("section") && r.category && r.category !== "other") {
    await addBlock(ctx.db, { type: "section", value: r.category, until, reason: opts.reason ?? "rejected", postId: id }, ctx.actor);
  }
  return done;
}

/** Leaves the slot empty: no post, and no new draft for it. */
export async function skip(ctx: ActionContext, id: string, version: number) {
  const post = await load(ctx, id, version);
  return change(ctx, post, { status: "skipped", locked: true, decidedBy: ctx.actor, decidedAt: nowIso() }, "skip");
}

/** Back to a draft the picker may refresh (undoes approve, reject, skip, or an edit). */
export async function reopen(ctx: ActionContext, id: string, version: number) {
  const post = await load(ctx, id, version);
  return change(ctx, post, { status: "draft", locked: false, edited: false, decidedBy: null, decidedAt: null, error: null }, "reopen");
}

export interface Edit {
  message?: string;
  /**
   * The post's cards, as they should now be (removed, added, swapped, reordered): each a bartaboard.com link with a
   * title, its outlet or channel, and (in a carousel) a picture. A carousel keeps 2 to 10; a single post, one.
   */
  cards?: Card[];
  /** ISO; when it goes out. */
  scheduledAt?: string;
  /** A carousel's cards in their new order (indexes into the current order). */
  order?: number[];
  policy?: Policy;
}

/** Changes a draft (or approved or failed post): it is locked, so the picker leaves it as edited. */
export async function edit(ctx: ActionContext, id: string, version: number, e: Edit) {
  const post = await load(ctx, id, version);
  if (!OPEN.includes(post.status)) throw new ActionError(409, `a ${post.status} post can't be edited`, post);
  // Edits close shortly before the post's time (settings: editLockMinutes): what is seen then is what goes out.
  const { editLockMinutes } = queueSettings(await readSettings(ctx.db));
  if (!editable(post.scheduledAt, editLockMinutes)) {
    const closed = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit" }).format(editDeadline(post.scheduledAt, editLockMinutes));
    throw new ActionError(409, `editing closed at ${closed}, ${editLockMinutes} minutes before it goes out; it can still be rejected or skipped`, post);
  }
  const params = { ...post.params };
  let cards: Card[] = post.cards;
  if (e.message !== undefined) {
    const message = e.message.trim();
    if (!message) throw new ActionError(400, "the post needs some text");
    if (message.length > 5000) throw new ActionError(400, "the text is too long");
    params.message = message;
  }
  if (e.order) {
    const n = post.cards.length;
    const valid = e.order.length === n && new Set(e.order).size === n && e.order.every((i) => Number.isInteger(i) && i >= 0 && i < n);
    if (!valid || !params.child_attachments) throw new ActionError(400, "the new order must list every card once");
    const children = JSON.parse(params.child_attachments) as unknown[];
    params.child_attachments = JSON.stringify(e.order.map((i) => children[i]));
    cards = e.order.map((i) => post.cards[i]);
  }
  let record = post.record;
  if (e.cards) {
    const carousel = !!post.params.child_attachments;
    const checked = e.cards.map((c) => checkCard(c, carousel));
    if (carousel && (checked.length < 2 || checked.length > 10)) throw new ActionError(400, "a carousel needs 2 to 10 cards");
    if (!carousel && checked.length !== 1) throw new ActionError(400, "a single post has one item");
    cards = checked;
    if (carousel) {
      params.child_attachments = JSON.stringify(checked.map((c) => ({ link: c.link, name: c.title, description: c.source, picture: c.picture })));
    } else params.link = checked[0].link;
    // The stories added count as posted from now on (the picking rules' repeats); removed ones stay counted.
    if (record) {
      const keys = [...new Set([...record.keys, ...checked.map((c) => c.key).filter((k): k is string => !!k)])];
      record = { ...record, keys, link: params.link, ...(checked[0].sourceId && { sourceId: checked[0].sourceId }), title: carousel ? record.title : checked[0].title };
    }
  }
  if (e.scheduledAt !== undefined) {
    const t = Date.parse(e.scheduledAt);
    if (Number.isNaN(t)) throw new ActionError(400, "not a time");
    if (t < Date.now() + editLockMinutes * 60_000 || t > Date.now() + 7 * DAY_MS) {
      throw new ActionError(400, `the new time must be at least ${editLockMinutes} minutes from now, and within a week`);
    }
  }
  if (e.policy && !["manual", "auto_unless_rejected", "auto"].includes(e.policy)) throw new ActionError(400, "unknown policy");
  return change(
    ctx,
    post,
    {
      params,
      cards,
      message: params.message ?? post.message,
      link: params.link ?? post.link,
      record,
      ...(e.scheduledAt && { scheduledAt: new Date(e.scheduledAt).toISOString() }),
      ...(e.policy && { policy: e.policy }),
      locked: true,
      edited: true,
    },
    "edit",
    e,
  );
}

/**
 * Posts it to the Page now, from here, as it stands. Only when the queue posts for real: in its trial (shadow) the
 * Page is posted the old way, and this would post twice.
 */
export async function postNow(ctx: ActionContext, id: string, version: number) {
  if (!ctx.fb) throw new ActionError(503, "Facebook isn't set up for the admin (FB_PAGE_ID, FB_PAGE_TOKEN)");
  if (!(await queueLive(ctx.db))) throw new ActionError(409, "the queue is still on trial (FB_QUEUE=shadow): nothing is posted from the admin yet");
  const post = await load(ctx, id, version);
  if (!OPEN.includes(post.status)) throw new ActionError(409, `a ${post.status} post can't be posted`, post);
  const claimed = await change(ctx, post, { status: "posting" }, "claim");
  try {
    const single = !claimed.params.child_attachments;
    let previewOk: boolean | undefined;
    if (single && claimed.params.link) previewOk = await rescrape(ctx.fb, claimed.params.link);
    const fbPostId = await postToFeed(ctx.fb, claimed.params);
    const at = nowIso();
    const record = claimed.record ? { ...claimed.record, at, id: fbPostId, mode: "on" as const, ...(previewOk && { previewOk }) } : null;
    return await updatePost(
      ctx.db,
      id,
      claimed.version,
      { status: "posted", fbPostId, postedAt: at, scheduledAt: at, record, error: null, decidedBy: ctx.actor, decidedAt: at, locked: true },
      ctx.actor,
      "posted",
    );
  } catch (err) {
    const message = (err as Error).message;
    await updatePost(ctx.db, id, claimed.version, { status: "failed", error: message }, ctx.actor, "failed");
    throw new ActionError(502, `Facebook refused it: ${message}`);
  }
}

/** Takes a posted post off the Page. It stays in the history (the story did go out). */
export async function takeDown(ctx: ActionContext, id: string, version: number) {
  if (!ctx.fb) throw new ActionError(503, "Facebook isn't set up for the admin (FB_PAGE_ID, FB_PAGE_TOKEN)");
  const post = await load(ctx, id, version);
  if (post.status !== "posted" || !post.fbPostId) throw new ActionError(409, "only a post on the Page can be taken down", post);
  if (post.removedAt) throw new ActionError(409, "already taken down", post);
  try {
    await deletePost(ctx.fb, post.fbPostId);
  } catch (err) {
    throw new ActionError(502, `Facebook refused: ${(err as Error).message}`);
  }
  return change(ctx, post, { removedAt: nowIso(), note: `${post.note ?? ""} · taken down by ${ctx.actor}` }, "take-down");
}

const SITE_HOSTS = ["bartaboard.com", "www.bartaboard.com"];

/** A card a person added: a Bartaboard link, a title, its source, and a picture where it shows one. */
function checkCard(c: Card, needsPicture: boolean): Card {
  const title = c?.title?.trim();
  const source = c?.source?.trim();
  if (!title || title.length > 300) throw new ActionError(400, "each item needs a title");
  if (!source || source.length > 120) throw new ActionError(400, `"${title.slice(0, 40)}" needs its outlet or channel`);
  let link: URL;
  try {
    link = new URL(c.link);
  } catch {
    throw new ActionError(400, `"${title.slice(0, 40)}" has no link`);
  }
  if (link.protocol !== "https:" || !SITE_HOSTS.includes(link.hostname)) throw new ActionError(400, "items link to their bartaboard.com page");
  let picture: string | undefined;
  if (c.picture) {
    try {
      const p = new URL(c.picture);
      if (p.protocol !== "https:") throw new Error();
      picture = p.toString();
    } catch {
      throw new ActionError(400, `"${title.slice(0, 40)}" has a bad picture address`);
    }
  }
  if (needsPicture && !picture) throw new ActionError(400, `"${title.slice(0, 40)}" has no picture: a carousel card needs one`);
  return { link: link.toString(), title, source, picture, ...(c.sourceId && { sourceId: String(c.sourceId).slice(0, 60) }), ...(c.section && { section: String(c.section).slice(0, 30) }), ...(c.key && { key: String(c.key).slice(0, 80) }) };
}

export interface NewItemPost {
  /** The headline or video, as a card (see checkCard). */
  card: Card;
  content: "news" | "video";
  /** The post's text; default: the title, then its outlet or channel. */
  message?: string;
  /** ISO; default: in 5 minutes. */
  scheduledAt?: string;
}

/** One headline or video from the site, chosen by a person, as its own post at its time (approved). */
export async function createFromItem(ctx: ActionContext, p: NewItemPost) {
  if (p.content !== "news" && p.content !== "video") throw new ActionError(400, "an item is a headline or a video");
  const card = checkCard(p.card, false);
  const message = (p.message?.trim() || `${card.title}\n\n${card.source}`).slice(0, 5000);
  const at = p.scheduledAt ? Date.parse(p.scheduledAt) : Date.now() + 5 * 60_000;
  if (Number.isNaN(at) || at < Date.now() - 5 * 60_000 || at > Date.now() + 14 * DAY_MS) throw new ActionError(400, "the time must be from now to two weeks ahead");
  const scheduledAt = new Date(at).toISOString();
  const post = await insertPost(ctx.db, {
    kind: "manual",
    content: p.content,
    status: "approved",
    policy: "auto",
    scheduledAt,
    message,
    link: card.link,
    params: { message, link: card.link },
    cards: [card],
    record: {
      kind: "slot",
      content: p.content,
      at: scheduledAt,
      title: card.title,
      link: card.link,
      sourceId: card.sourceId ?? "bartaboard",
      category: (p.content === "news" ? (card.section ?? "other") : "other") as PostRecordCategory,
      keys: card.key ? [card.key] : [],
      words: [],
      mode: "on",
    },
    locked: true,
    edited: true,
    decidedBy: ctx.actor,
    decidedAt: nowIso(),
  });
  if (!post) throw new ActionError(500, "not saved");
  return post;
}

export interface NewManualPost {
  message: string;
  link?: string;
  /** ISO; default: in 5 minutes. */
  scheduledAt?: string;
}

/** A post of one's own (text, and a link Facebook previews), approved, for the queue to post at its time. */
export async function createManual(ctx: ActionContext, p: NewManualPost) {
  const message = p.message?.trim();
  if (!message) throw new ActionError(400, "the post needs some text");
  if (message.length > 5000) throw new ActionError(400, "the text is too long");
  let link = "";
  if (p.link?.trim()) {
    try {
      const u = new URL(p.link.trim());
      if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error();
      link = u.toString();
    } catch {
      throw new ActionError(400, "the link isn't a web address");
    }
  }
  const at = p.scheduledAt ? Date.parse(p.scheduledAt) : Date.now() + 5 * 60_000;
  if (Number.isNaN(at) || at < Date.now() - 5 * 60_000 || at > Date.now() + 14 * DAY_MS) throw new ActionError(400, "the time must be from now to two weeks ahead");
  const post = await insertPost(ctx.db, {
    kind: "manual",
    content: "custom",
    status: "approved",
    policy: "auto",
    scheduledAt: new Date(at).toISOString(),
    message,
    link,
    params: link ? { message, link } : { message },
    cards: link ? [{ link, title: message.split("\n")[0].slice(0, 140), source: "Bartaboard" }] : [],
    locked: true,
    edited: true,
    decidedBy: ctx.actor,
    decidedAt: nowIso(),
  });
  if (!post) throw new ActionError(500, "not saved");
  return post;
}
