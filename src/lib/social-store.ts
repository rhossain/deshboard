/**
 * The admin's records (migrations/0001_social.sql) as objects: posts and their moves from draft to posted, blocks,
 * settings, the audit log and runs. Used by the Pages Functions (the admin API, the Telegram webhook) and by the
 * deploy's propose/publish steps alike, over social-db.ts.
 *
 * Every change to a post names the version it was made against; one made against an older version is refused
 * (StaleError), so an edit in the admin and a run of the deploy never overwrite each other unseen.
 */
import type { PostContent, PostRecord } from "./page-posts";
import type { Db, SqlValue } from "./social-db";

export type Platform = "facebook" | "instagram";
export const PLATFORMS: Platform[] = ["facebook", "instagram"];
export type PostKind = "slot" | "breaking" | "manual";
export type SocialContent = PostContent | "custom";
export type PostStatus = "draft" | "approved" | "rejected" | "posting" | "posted" | "failed" | "skipped" | "dry";
export type Policy = "manual" | "auto_unless_rejected" | "auto";

/** A card as the admin shows it (a carousel's, or a single post's one). */
export interface Card {
  link: string;
  title: string;
  /** The outlet or channel, as the post names it. */
  source: string;
  sourceId?: string;
  picture?: string;
  section?: string;
  /** The headline's share key or the video's id: what the picking rules know it by. */
  key?: string;
  /** How many outlets carry the story (an Instagram card says so). */
  outlets?: number;
}

export interface SocialPost {
  id: string;
  platform: Platform;
  kind: PostKind;
  content: SocialContent;
  status: PostStatus;
  policy: Policy;
  slot: string | null;
  scheduledAt: string;
  message: string;
  link: string;
  params: Record<string, string>;
  cards: Card[];
  alternatives: Card[];
  record: PostRecord | null;
  locked: boolean;
  edited: boolean;
  note: string | null;
  error: string | null;
  /** The platform's id for the post (Facebook's, or Instagram's media id). */
  fbPostId: string | null;
  /** Where the post is on the platform (Instagram's permalink). */
  permalink: string | null;
  telegramMessageId: number | null;
  decidedBy: string | null;
  decidedAt: string | null;
  postedAt: string | null;
  /** Taken down from the Page from the admin. */
  removedAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

/** A post's state can only move along these. */
const MOVES: Record<PostStatus, PostStatus[]> = {
  draft: ["draft", "approved", "rejected", "skipped", "posting", "dry"],
  approved: ["approved", "draft", "rejected", "skipped", "posting", "dry"],
  rejected: ["draft"],
  skipped: ["draft", "dry"],
  // A trial's claim ends as a trial pick (dry): nothing was sent.
  posting: ["posted", "failed", "approved", "dry"],
  posted: ["posted"],
  failed: ["failed", "draft", "approved", "posting", "skipped"],
  dry: ["dry"],
};

export const canMove = (from: PostStatus, to: PostStatus) => MOVES[from].includes(to);

/** A change made against a version of the post that is no longer the latest. */
export class StaleError extends Error {
  constructor(
    public readonly id: string,
    public readonly current: SocialPost | null,
  ) {
    super(current ? `post ${id} changed meanwhile (now version ${current.version})` : `post ${id} not found`);
  }
}

export class MoveError extends Error {}

const nowIso = () => new Date().toISOString();

/** A sortable, unguessable id: "p_" + time (base 36) + 8 random characters. */
export function newId(prefix = "p"): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const random = Array.from(bytes, (b) => b.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, 8);
  return `${prefix}_${Date.now().toString(36)}${random}`;
}

interface PostRow {
  id: string;
  platform: string;
  kind: string;
  content: string;
  status: string;
  policy: string;
  slot: string | null;
  scheduled_at: string;
  message: string;
  link: string;
  params: string;
  cards: string;
  alternatives: string;
  record: string | null;
  locked: number;
  edited: number;
  note: string | null;
  error: string | null;
  fb_post_id: string | null;
  permalink?: string | null;
  telegram_message_id: number | null;
  decided_by: string | null;
  decided_at: string | null;
  posted_at: string | null;
  removed_at: string | null;
  created_at: string;
  updated_at: string;
  version: number;
}

function parse<T>(text: string | null, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

function fromRow(r: PostRow): SocialPost {
  return {
    id: r.id,
    platform: r.platform as Platform,
    kind: r.kind as PostKind,
    content: r.content as SocialContent,
    status: r.status as PostStatus,
    policy: r.policy as Policy,
    slot: r.slot,
    scheduledAt: r.scheduled_at,
    message: r.message,
    link: r.link,
    params: parse(r.params, {}),
    cards: parse(r.cards, []),
    alternatives: parse(r.alternatives, []),
    record: parse(r.record, null),
    locked: !!r.locked,
    edited: !!r.edited,
    note: r.note,
    error: r.error,
    fbPostId: r.fb_post_id,
    permalink: r.permalink ?? null,
    telegramMessageId: r.telegram_message_id,
    decidedBy: r.decided_by,
    decidedAt: r.decided_at,
    postedAt: r.posted_at,
    removedAt: r.removed_at ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    version: r.version,
  };
}

/** The object's fields as columns, for the ones given. */
const COLUMNS: Record<keyof Omit<SocialPost, "id" | "version" | "createdAt" | "updatedAt">, [string, (v: never) => SqlValue]> = {
  platform: ["platform", (v: string) => v],
  kind: ["kind", (v: string) => v],
  content: ["content", (v: string) => v],
  status: ["status", (v: string) => v],
  policy: ["policy", (v: string) => v],
  slot: ["slot", (v: string | null) => v],
  scheduledAt: ["scheduled_at", (v: string) => v],
  message: ["message", (v: string) => v],
  link: ["link", (v: string) => v],
  params: ["params", (v: object) => JSON.stringify(v)],
  cards: ["cards", (v: object) => JSON.stringify(v)],
  alternatives: ["alternatives", (v: object) => JSON.stringify(v)],
  record: ["record", (v: object | null) => (v ? JSON.stringify(v) : null)],
  locked: ["locked", (v: boolean) => (v ? 1 : 0)],
  edited: ["edited", (v: boolean) => (v ? 1 : 0)],
  note: ["note", (v: string | null) => v],
  error: ["error", (v: string | null) => v],
  fbPostId: ["fb_post_id", (v: string | null) => v],
  permalink: ["permalink", (v: string | null) => v],
  telegramMessageId: ["telegram_message_id", (v: number | null) => v],
  decidedBy: ["decided_by", (v: string | null) => v],
  decidedAt: ["decided_at", (v: string | null) => v],
  postedAt: ["posted_at", (v: string | null) => v],
  removedAt: ["removed_at", (v: string | null) => v],
};

type Fields = Partial<Omit<SocialPost, "id" | "version" | "createdAt" | "updatedAt">>;

function columns(fields: Fields): [string[], SqlValue[]] {
  const names: string[] = [];
  const values: SqlValue[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    const column = COLUMNS[key as keyof typeof COLUMNS];
    if (!column) throw new Error(`unknown post field ${key}`);
    names.push(column[0]);
    values.push(column[1](value as never));
  }
  return [names, values];
}

export type NewPost = Fields & Pick<SocialPost, "kind" | "content" | "status" | "scheduledAt"> & { id?: string };

/**
 * Adds a post; null when the slot already has a live one (draft, approved, posting, posted or skipped) or the
 * Facebook post is already recorded.
 */
export async function insertPost(db: Db, post: NewPost): Promise<SocialPost | null> {
  const { id = newId(), ...fields } = post;
  const at = nowIso();
  const [names, values] = columns(fields);
  const sql = `INSERT INTO posts (id, ${names.join(", ")}, created_at, updated_at) VALUES (?, ${names.map(() => "?").join(", ")}, ?, ?) ON CONFLICT DO NOTHING`;
  const { changes } = await db.run(sql, [id, ...values, at, at]);
  return changes ? getPost(db, id) : null;
}

export async function getPost(db: Db, id: string): Promise<SocialPost | null> {
  const row = await db.first<PostRow>("SELECT * FROM posts WHERE id = ?", [id]);
  return row ? fromRow(row) : null;
}

export interface PostQuery {
  /** Default facebook; "any" for every platform's. */
  platform?: Platform | "any";
  /** scheduled_at from (inclusive) and to (exclusive), ISO. */
  from?: string;
  to?: string;
  statuses?: PostStatus[];
  limit?: number;
  /** Newest first. */
  desc?: boolean;
}

export async function listPosts(db: Db, q: PostQuery = {}): Promise<SocialPost[]> {
  const where: string[] = [];
  const params: SqlValue[] = [];
  if (q.platform !== "any") {
    where.push("platform = ?");
    params.push(q.platform ?? "facebook");
  }
  const add = (clause: string, ...values: SqlValue[]) => {
    where.push(clause);
    params.push(...values);
  };
  if (q.from) add("scheduled_at >= ?", q.from);
  if (q.to) add("scheduled_at < ?", q.to);
  if (q.statuses?.length) add(`status IN (${q.statuses.map(() => "?").join(", ")})`, ...q.statuses);
  const rows = await db.all<PostRow>(
    `SELECT * FROM posts ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY scheduled_at ${q.desc ? "DESC" : "ASC"}, created_at LIMIT ?`,
    [...params, q.limit ?? 500],
  );
  return rows.map(fromRow);
}

/** The live post for a slot (draft, approved, posting, posted or skipped), if any. */
export async function postForSlot(db: Db, slot: string, platform: Platform = "facebook"): Promise<SocialPost | null> {
  const row = await db.first<PostRow>(
    "SELECT * FROM posts WHERE platform = ? AND slot = ? AND status IN ('draft', 'approved', 'posting', 'posted', 'skipped')",
    [platform, slot],
  );
  return row ? fromRow(row) : null;
}

/**
 * Changes a post made against `version`: refused (StaleError) when it has changed since, and (MoveError) when its
 * status can't move to the one asked for. Logged in the audit as `action` by `actor`. Returns the post as it now is.
 */
export async function updatePost(
  db: Db,
  id: string,
  version: number,
  changes: Fields,
  actor: string,
  action = "update",
  detail?: unknown,
): Promise<SocialPost> {
  if (changes.status) {
    const current = await getPost(db, id);
    if (!current || current.version !== version) throw new StaleError(id, current);
    if (!canMove(current.status, changes.status)) throw new MoveError(`a ${current.status} post can't become ${changes.status}`);
  }
  const [names, values] = columns(changes);
  const set = [...names.map((n) => `${n} = ?`), "version = version + 1", "updated_at = ?"].join(", ");
  const { changes: n } = await db.run(`UPDATE posts SET ${set} WHERE id = ? AND version = ?`, [...values, nowIso(), id, version]);
  const post = await getPost(db, id);
  if (!n || !post) throw new StaleError(id, post);
  await audit(db, actor, action, id, detail ?? changes);
  return post;
}

/**
 * The records the picking rules read (PostRecord): what went out or is on its way since `since`. `dry` adds a dry
 * run's picks, for a dry run.
 */
export async function postedRecords(db: Db, since: string, dry = false, platform: Platform = "facebook"): Promise<PostRecord[]> {
  const statuses = ["approved", "posting", "posted", ...(dry ? ["dry"] : [])];
  const rows = await db.all<{ record: string }>(
    `SELECT record FROM posts WHERE platform = ? AND record IS NOT NULL AND scheduled_at >= ? AND status IN (${statuses.map(() => "?").join(", ")}) ORDER BY scheduled_at`,
    [platform, since, ...statuses],
  );
  return rows.map((r) => parse<PostRecord | null>(r.record, null)).filter((r): r is PostRecord => !!r);
}

export async function audit(db: Db, actor: string, action: string, postId?: string | null, detail?: unknown): Promise<void> {
  await db.run("INSERT INTO audit (at, actor, action, post_id, detail) VALUES (?, ?, ?, ?, ?)", [
    nowIso(),
    actor,
    action,
    postId ?? null,
    detail === undefined ? null : JSON.stringify(detail).slice(0, 4000),
  ]);
}

export interface AuditEntry {
  id: number;
  at: string;
  actor: string;
  action: string;
  postId: string | null;
  detail: unknown;
}

export async function auditLog(db: Db, opts: { postId?: string; limit?: number } = {}): Promise<AuditEntry[]> {
  const rows = await db.all<{ id: number; at: string; actor: string; action: string; post_id: string | null; detail: string | null }>(
    `SELECT * FROM audit ${opts.postId ? "WHERE post_id = ?" : ""} ORDER BY id DESC LIMIT ?`,
    [...(opts.postId ? [opts.postId] : []), opts.limit ?? 100],
  );
  return rows.map((r) => ({ id: r.id, at: r.at, actor: r.actor, action: r.action, postId: r.post_id, detail: parse(r.detail, r.detail) }));
}

export async function readSettings(db: Db): Promise<Record<string, unknown>> {
  const rows = await db.all<{ key: string; value: string }>("SELECT key, value FROM settings");
  return Object.fromEntries(rows.map((r) => [r.key, parse<unknown>(r.value, null)]));
}

export async function writeSetting(db: Db, key: string, value: unknown, actor: string): Promise<void> {
  await db.run(
    "INSERT INTO settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at",
    [key, JSON.stringify(value), actor, nowIso()],
  );
  await audit(db, actor, "setting", null, { key, value });
}

export type BlockType = "story" | "outlet" | "section" | "channel" | "word";

export interface Block {
  id: number;
  type: BlockType;
  /** A story's { keys, words }; otherwise the id or the word. */
  value: string | { keys: string[]; words: string[] };
  until: string | null;
  reason: string | null;
  postId: string | null;
}

export async function addBlock(
  db: Db,
  block: Omit<Block, "id">,
  actor: string,
): Promise<void> {
  const value = typeof block.value === "string" ? block.value : JSON.stringify(block.value);
  await db.run("INSERT INTO blocks (type, value, until, reason, post_id, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [
    block.type,
    value,
    block.until,
    block.reason,
    block.postId,
    actor,
    nowIso(),
  ]);
  await audit(db, actor, "block", block.postId, { type: block.type, value: block.value, until: block.until, reason: block.reason });
}

/** Blocks still in force at `now` (ISO). */
export async function activeBlocks(db: Db, now = nowIso()): Promise<Block[]> {
  const rows = await db.all<{ id: number; type: string; value: string; until: string | null; reason: string | null; post_id: string | null }>(
    "SELECT * FROM blocks WHERE until IS NULL OR until > ? ORDER BY id",
    [now],
  );
  return rows.map((r) => ({
    id: r.id,
    type: r.type as BlockType,
    value: r.type === "story" ? parse(r.value, { keys: [], words: [] }) : r.value,
    until: r.until,
    reason: r.reason,
    postId: r.post_id,
  }));
}

export async function removeBlock(db: Db, id: number, actor: string): Promise<void> {
  await db.run("DELETE FROM blocks WHERE id = ?", [id]);
  await audit(db, actor, "unblock", null, { id });
}

export async function recordRun(db: Db, step: string, ok: boolean, summary: unknown): Promise<void> {
  await db.run("INSERT INTO runs (at, step, ok, summary) VALUES (?, ?, ?, ?)", [nowIso(), step, ok ? 1 : 0, JSON.stringify(summary).slice(0, 4000)]);
}

export async function lastRuns(db: Db, limit = 20): Promise<{ at: string; step: string; ok: boolean; summary: unknown }[]> {
  const rows = await db.all<{ at: string; step: string; ok: number; summary: string }>("SELECT at, step, ok, summary FROM runs ORDER BY id DESC LIMIT ?", [limit]);
  return rows.map((r) => ({ at: r.at, step: r.step, ok: !!r.ok, summary: parse(r.summary, r.summary) }));
}

/** The latest run among `steps` (a platform's), if any. */
export async function lastRunOf(db: Db, steps: string[]): Promise<{ at: string; step: string } | null> {
  return db.first<{ at: string; step: string }>(
    `SELECT at, step FROM runs WHERE step IN (${steps.map(() => "?").join(", ")}) ORDER BY id DESC LIMIT 1`,
    steps,
  );
}

/**
 * Pictures (an Instagram post's: migrations/0003_instagram.sql), kept base64-encoded in parts small enough for one
 * statement each through Cloudflare's API.
 */
export const MEDIA_PART = 90_000;

export async function hasMedia(db: Db, key: string): Promise<boolean> {
  const row = await db.first<{ parts: number; n: number }>("SELECT MAX(parts) AS parts, COUNT(*) AS n FROM media WHERE key = ?", [key]);
  return !!row && row.n > 0 && row.n === row.parts;
}

/** Stores a picture (base64) under `key`, replacing one stored before. */
export async function putMedia(db: Db, key: string, base64: string, type = "image/jpeg"): Promise<void> {
  const parts = Math.max(1, Math.ceil(base64.length / MEDIA_PART));
  await db.run("DELETE FROM media WHERE key = ?", [key]);
  const at = nowIso();
  for (let i = 0; i < parts; i++) {
    await db.run("INSERT INTO media (key, part, parts, type, data, created_at) VALUES (?, ?, ?, ?, ?, ?)", [
      key,
      i,
      parts,
      type,
      base64.slice(i * MEDIA_PART, (i + 1) * MEDIA_PART),
      at,
    ]);
  }
}

/** A stored picture, base64, with its type; null unless every part is there. */
export async function getMedia(db: Db, key: string): Promise<{ type: string; base64: string } | null> {
  const rows = await db.all<{ part: number; parts: number; type: string; data: string }>("SELECT part, parts, type, data FROM media WHERE key = ? ORDER BY part", [key]);
  if (!rows.length || rows.length !== rows[0].parts) return null;
  return { type: rows[0].type, base64: rows.map((r) => r.data).join("") };
}

/** Deletes pictures stored before `before` (ISO): Instagram keeps its own copy once a post is made. */
export async function pruneMedia(db: Db, before: string): Promise<number> {
  return (await db.run("DELETE FROM media WHERE created_at < ?", [before])).changes;
}

/**
 * Headlines and videos saved from the public board for a post (migrations/0004_saved.sql): one row an item, by its
 * kind and key; saving one again refreshes its row and keeps its place in the list.
 */
export type SavedKind = "headline" | "video";

export interface SavedItem {
  id: string;
  kind: SavedKind;
  /** The headline's share key or the video's id. */
  key: string;
  title: string;
  /** The outlet or channel, in Bangla. */
  source: string;
  sourceId: string;
  /** Its bartaboard.com link, as a card's. */
  link: string;
  picture: string | null;
  section: string | null;
  /** ISO; when it was published, when known. */
  publishedAt: string | null;
  /** The NewsItem or Video as the board had it. */
  item: unknown | null;
  note: string | null;
  savedBy: string;
  savedAt: string;
  /** When it went into a post, and which. */
  usedAt: string | null;
  postId: string | null;
}

export type NewSavedItem = Pick<SavedItem, "kind" | "key" | "title" | "source" | "sourceId" | "link"> &
  Partial<Pick<SavedItem, "picture" | "section" | "publishedAt" | "item" | "note">>;

interface SavedRow {
  id: string;
  kind: string;
  key: string;
  title: string;
  source: string;
  source_id: string;
  link: string;
  picture: string | null;
  section: string | null;
  published_at: string | null;
  item: string | null;
  note: string | null;
  saved_by: string;
  saved_at: string;
  used_at: string | null;
  post_id: string | null;
}

function savedFromRow(r: SavedRow): SavedItem {
  return {
    id: r.id,
    kind: r.kind as SavedKind,
    key: r.key,
    title: r.title,
    source: r.source,
    sourceId: r.source_id,
    link: r.link,
    picture: r.picture,
    section: r.section,
    publishedAt: r.published_at,
    item: parse<unknown | null>(r.item, null),
    note: r.note,
    savedBy: r.saved_by,
    savedAt: r.saved_at,
    usedAt: r.used_at,
    postId: r.post_id,
  };
}

/**
 * Saves an item, or refreshes the one saved before under the same kind and key (its title, link and picture as the
 * board has them now; its place in the list, who saved it first and the post it went into are kept). Says which.
 */
export async function saveItem(db: Db, item: NewSavedItem, actor: string): Promise<{ item: SavedItem; created: boolean }> {
  const before = await getSavedByKey(db, item.kind, item.key);
  const at = nowIso();
  const id = before?.id ?? newId("s");
  await db.run(
    `INSERT INTO saved_items (id, kind, key, title, source, source_id, link, picture, section, published_at, item, note, saved_by, saved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (kind, key) DO UPDATE SET title = excluded.title, source = excluded.source, source_id = excluded.source_id,
       link = excluded.link, picture = COALESCE(excluded.picture, saved_items.picture), section = COALESCE(excluded.section, saved_items.section),
       published_at = COALESCE(excluded.published_at, saved_items.published_at), item = COALESCE(excluded.item, saved_items.item),
       note = COALESCE(excluded.note, saved_items.note)`,
    [
      id,
      item.kind,
      item.key,
      item.title,
      item.source,
      item.sourceId,
      item.link,
      item.picture ?? null,
      item.section ?? null,
      item.publishedAt ?? null,
      item.item === undefined || item.item === null ? null : JSON.stringify(item.item),
      item.note ?? null,
      actor,
      at,
    ],
  );
  const saved = (await getSavedByKey(db, item.kind, item.key))!;
  await audit(db, actor, before ? "save-again" : "save", saved.postId, { id: saved.id, kind: saved.kind, key: saved.key, title: saved.title.slice(0, 120) });
  return { item: saved, created: !before };
}

export async function getSaved(db: Db, id: string): Promise<SavedItem | null> {
  const row = await db.first<SavedRow>("SELECT * FROM saved_items WHERE id = ?", [id]);
  return row ? savedFromRow(row) : null;
}

export async function getSavedByKey(db: Db, kind: SavedKind, key: string): Promise<SavedItem | null> {
  const row = await db.first<SavedRow>("SELECT * FROM saved_items WHERE kind = ? AND key = ?", [kind, key]);
  return row ? savedFromRow(row) : null;
}

/** Every saved item, newest first (up to `limit`). */
export async function listSaved(db: Db, limit = 500): Promise<SavedItem[]> {
  const rows = await db.all<SavedRow>("SELECT * FROM saved_items ORDER BY saved_at DESC, rowid DESC LIMIT ?", [limit]);
  return rows.map(savedFromRow);
}

/** Takes a saved item off the list; false when it wasn't there. */
export async function removeSaved(db: Db, id: string, actor: string): Promise<boolean> {
  const before = await getSaved(db, id);
  const { changes } = await db.run("DELETE FROM saved_items WHERE id = ?", [id]);
  if (changes) await audit(db, actor, "unsave", before?.postId ?? null, { id, kind: before?.kind, key: before?.key, title: before?.title.slice(0, 120) });
  return changes > 0;
}

/**
 * Marks the saved items among `keys` (headlines' share keys and videos' ids) as having gone into post `postId`: the
 * list shows them so, and the picker tells them apart. Items not saved are left alone.
 */
export async function markSavedUsed(db: Db, keys: string[], postId: string): Promise<number> {
  const unique = [...new Set(keys.filter(Boolean))];
  if (!unique.length) return 0;
  const { changes } = await db.run(`UPDATE saved_items SET used_at = ?, post_id = ? WHERE key IN (${unique.map(() => "?").join(", ")})`, [nowIso(), postId, ...unique]);
  return changes;
}
