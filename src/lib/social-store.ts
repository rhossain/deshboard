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

export type Platform = "facebook";
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
  fbPostId: string | null;
  telegramMessageId: number | null;
  decidedBy: string | null;
  decidedAt: string | null;
  postedAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

/** A post's state can only move along these. */
const MOVES: Record<PostStatus, PostStatus[]> = {
  draft: ["draft", "approved", "rejected", "skipped", "posting", "dry"],
  approved: ["approved", "draft", "rejected", "skipped", "posting"],
  rejected: ["draft"],
  skipped: ["draft"],
  posting: ["posted", "failed", "approved"],
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
  telegram_message_id: number | null;
  decided_by: string | null;
  decided_at: string | null;
  posted_at: string | null;
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
    telegramMessageId: r.telegram_message_id,
    decidedBy: r.decided_by,
    decidedAt: r.decided_at,
    postedAt: r.posted_at,
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
  telegramMessageId: ["telegram_message_id", (v: number | null) => v],
  decidedBy: ["decided_by", (v: string | null) => v],
  decidedAt: ["decided_at", (v: string | null) => v],
  postedAt: ["posted_at", (v: string | null) => v],
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
  platform?: Platform;
  /** scheduled_at from (inclusive) and to (exclusive), ISO. */
  from?: string;
  to?: string;
  statuses?: PostStatus[];
  limit?: number;
  /** Newest first. */
  desc?: boolean;
}

export async function listPosts(db: Db, q: PostQuery = {}): Promise<SocialPost[]> {
  const where: string[] = ["platform = ?"];
  const params: SqlValue[] = [q.platform ?? "facebook"];
  const add = (clause: string, ...values: SqlValue[]) => {
    where.push(clause);
    params.push(...values);
  };
  if (q.from) add("scheduled_at >= ?", q.from);
  if (q.to) add("scheduled_at < ?", q.to);
  if (q.statuses?.length) add(`status IN (${q.statuses.map(() => "?").join(", ")})`, ...q.statuses);
  const rows = await db.all<PostRow>(
    `SELECT * FROM posts WHERE ${where.join(" AND ")} ORDER BY scheduled_at ${q.desc ? "DESC" : "ASC"}, created_at LIMIT ?`,
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
