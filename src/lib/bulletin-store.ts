/**
 * Video bulletins in the admin's database (migrations/0005_bulletin.sql): the rows, the states a bulletin moves
 * through, and what a person can do to one (make it by hand for any time, edit it, approve, reject, skip, reopen).
 * The same calls serve the Pages Functions and the scripts (social-db.ts). The rules for times and specs are in
 * bulletin.ts; choosing stories and writing scripts are in the scripts.
 */
import { bulletinLockAt, bulletinProblems, type BulletinStory, MAX_STORIES } from "./bulletin";
import type { Db, SqlValue } from "./social-db";
import { audit, newId } from "./social-store";

export type BulletinKind = "slot" | "manual";
export type BulletinStatus = "draft" | "approved" | "rendering" | "ready" | "posting" | "posted" | "rejected" | "skipped" | "failed" | "dry";

export interface Bulletin {
  id: string;
  platform: string;
  kind: BulletinKind;
  status: BulletinStatus;
  /** The time of the table it is for (ISO); null for one made by hand. */
  slot: string | null;
  /** When it goes out (ISO). */
  scheduledAt: string;
  stories: BulletinStory[];
  alternatives: BulletinStory[];
  caption: string;
  locked: boolean;
  edited: boolean;
  duration: number | null;
  note: string | null;
  error: string | null;
  fbPostId: string | null;
  permalink: string | null;
  telegramMessageId: number | null;
  decidedBy: string | null;
  decidedAt: string | null;
  postedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

/** Where a bulletin can go from each state. */
const MOVES: Record<BulletinStatus, BulletinStatus[]> = {
  draft: ["approved", "rejected", "skipped"],
  approved: ["draft", "rendering", "rejected", "skipped"],
  rendering: ["ready", "dry", "failed"],
  // ready: on Facebook, scheduled. posted once it is out; skipped when stopped before; failed if Facebook gives up.
  ready: ["posting", "posted", "skipped", "failed"],
  posting: ["posted", "failed"],
  posted: [],
  rejected: ["draft"],
  skipped: ["draft"],
  failed: ["draft", "rendering"],
  dry: [],
};
export const canMoveBulletin = (from: BulletinStatus, to: BulletinStatus) => MOVES[from].includes(to);

/** A change made against an older version of the row, or to a row that is gone. */
export class StaleBulletin extends Error {
  constructor(
    public readonly id: string,
    public readonly current: Bulletin | null,
  ) {
    super(current ? `bulletin ${id} changed meanwhile (now version ${current.version})` : `bulletin ${id} not found`);
  }
}
/** Something a person asked for that the bulletin's state, time or content doesn't allow; `message` is for them. */
export class BulletinError extends Error {}

const nowIso = () => new Date().toISOString();
const json = <T>(text: unknown, fallback: T): T => {
  try {
    return typeof text === "string" ? (JSON.parse(text) as T) : fallback;
  } catch {
    return fallback;
  }
};

type Row = Record<string, unknown>;
function fromRow(r: Row): Bulletin {
  const text = (v: unknown) => (v == null ? null : String(v));
  return {
    id: String(r.id),
    platform: String(r.platform),
    kind: r.kind as BulletinKind,
    status: r.status as BulletinStatus,
    slot: text(r.slot),
    scheduledAt: String(r.scheduled_at),
    stories: json<BulletinStory[]>(r.stories, []),
    alternatives: json<BulletinStory[]>(r.alternatives, []),
    caption: String(r.caption ?? ""),
    locked: Number(r.locked) === 1,
    edited: Number(r.edited) === 1,
    duration: r.duration == null ? null : Number(r.duration),
    note: text(r.note),
    error: text(r.error),
    fbPostId: text(r.fb_post_id),
    permalink: text(r.permalink),
    telegramMessageId: r.telegram_message_id == null ? null : Number(r.telegram_message_id),
    decidedBy: text(r.decided_by),
    decidedAt: text(r.decided_at),
    postedAt: text(r.posted_at),
    createdBy: text(r.created_by),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    version: Number(r.version),
  };
}

/** What a caller may set; everything else the store keeps itself. */
export type BulletinFields = Partial<
  Pick<
    Bulletin,
    | "status" | "slot" | "scheduledAt" | "stories" | "alternatives" | "caption" | "locked" | "edited" | "duration" | "note" | "error"
    | "fbPostId" | "permalink" | "telegramMessageId" | "decidedBy" | "decidedAt" | "postedAt" | "createdBy"
  >
>;

const COLUMNS: Record<keyof BulletinFields, string> = {
  status: "status", slot: "slot", scheduledAt: "scheduled_at", stories: "stories", alternatives: "alternatives", caption: "caption",
  locked: "locked", edited: "edited", duration: "duration", note: "note", error: "error", fbPostId: "fb_post_id", permalink: "permalink",
  telegramMessageId: "telegram_message_id", decidedBy: "decided_by", decidedAt: "decided_at", postedAt: "posted_at", createdBy: "created_by",
};

function columns(fields: BulletinFields): [string[], SqlValue[]] {
  const names: string[] = [];
  const values: SqlValue[] = [];
  for (const [key, value] of Object.entries(fields) as [keyof BulletinFields, unknown][]) {
    if (value === undefined || !COLUMNS[key]) continue;
    names.push(COLUMNS[key]);
    values.push(
      key === "stories" || key === "alternatives" ? JSON.stringify(value) : typeof value === "boolean" ? (value ? 1 : 0) : (value as SqlValue),
    );
  }
  return [names, values];
}

export type NewBulletin = BulletinFields & Pick<Bulletin, "kind" | "status" | "scheduledAt"> & { id?: string };

/** Adds a bulletin; null when the table's time already has a live one (the unique index), so two runs can't both draft it. */
export async function insertBulletin(db: Db, bulletin: NewBulletin): Promise<Bulletin | null> {
  const { id = newId("b"), kind, ...fields } = bulletin;
  const at = nowIso();
  const [names, values] = columns(fields);
  const sql = `INSERT INTO bulletins (id, kind, ${names.join(", ")}, created_at, updated_at) VALUES (?, ?, ${names.map(() => "?").join(", ")}, ?, ?) ON CONFLICT DO NOTHING`;
  const { changes } = await db.run(sql, [id, kind, ...values, at, at]);
  return changes ? getBulletin(db, id) : null;
}

export async function getBulletin(db: Db, id: string): Promise<Bulletin | null> {
  const row = await db.first<Row>("SELECT * FROM bulletins WHERE id = ?", [id]);
  return row ? fromRow(row) : null;
}

/** The live bulletin for a time of the table (rejected and failed ones don't hold it). */
export async function bulletinForSlot(db: Db, slot: string): Promise<Bulletin | null> {
  const row = await db.first<Row>(
    "SELECT * FROM bulletins WHERE platform = 'facebook' AND slot = ? AND status IN ('draft', 'approved', 'rendering', 'ready', 'posting', 'posted', 'skipped', 'dry')",
    [slot],
  );
  return row ? fromRow(row) : null;
}

/** Bulletins going out in a span of time, earliest first; `statuses` narrows them. */
export async function listBulletins(db: Db, q: { from?: string; to?: string; statuses?: BulletinStatus[]; limit?: number } = {}): Promise<Bulletin[]> {
  const where: string[] = [];
  const params: SqlValue[] = [];
  if (q.from) {
    where.push("scheduled_at >= ?");
    params.push(q.from);
  }
  if (q.to) {
    where.push("scheduled_at < ?");
    params.push(q.to);
  }
  if (q.statuses?.length) {
    where.push(`status IN (${q.statuses.map(() => "?").join(", ")})`);
    params.push(...q.statuses);
  }
  const sql = `SELECT * FROM bulletins ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY scheduled_at LIMIT ?`;
  return (await db.all<Row>(sql, [...params, Math.min(q.limit ?? 100, 500)])).map(fromRow);
}

/**
 * Changes a bulletin, against the version the caller read: a change of state must be one MOVES allows, and a change
 * against an older version is refused (two editors, or an editor and a run). Written to the audit log.
 */
export async function updateBulletin(db: Db, id: string, version: number, changes: BulletinFields, actor: string, action = "bulletin.update", detail?: unknown): Promise<Bulletin> {
  if (changes.status) {
    const current = await getBulletin(db, id);
    if (!current || current.version !== version) throw new StaleBulletin(id, current);
    if (current.status !== changes.status && !canMoveBulletin(current.status, changes.status)) {
      throw new BulletinError(`A ${current.status} bulletin can't become ${changes.status}.`);
    }
  }
  const [names, values] = columns(changes);
  const set = [...names.map((n) => `${n} = ?`), "version = version + 1", "updated_at = ?"].join(", ");
  const { changes: n } = await db.run(`UPDATE bulletins SET ${set} WHERE id = ? AND version = ?`, [...values, nowIso(), id, version]);
  const bulletin = await getBulletin(db, id);
  if (!n || !bulletin) throw new StaleBulletin(id, bulletin);
  await audit(db, actor, action, id, detail ?? { ...changes, stories: changes.stories?.length, alternatives: undefined });
  return bulletin;
}

// ---------- what a person does ----------

const MIN_AHEAD_MS = 2 * 60_000;

function checkStories(stories: BulletinStory[]) {
  if (stories.length > MAX_STORIES) throw new BulletinError(`A bulletin holds ${MAX_STORIES} stories at most.`);
  const problems = bulletinProblems(stories);
  if (problems.length) throw new BulletinError(problems.join(" "));
}

/**
 * A bulletin made by hand, for any time: now (`at` omitted: it is rendered and goes out as soon as it is approved) or
 * a time ahead. It holds no slot of the table, so it never collides with the table's own. With `write`, its scripts
 * start as the headlines and the next run writes them from the articles before it can be approved.
 */
export async function createBulletin(
  db: Db,
  input: { stories: BulletinStory[]; at?: string; caption?: string; note?: string; /** The run writes the scripts from the articles first. */ write?: boolean },
  actor: string,
  now = Date.now(),
): Promise<Bulletin> {
  checkStories(input.stories);
  const at = input.at ? Date.parse(input.at) : now;
  if (Number.isNaN(at)) throw new BulletinError("That time isn't a date.");
  if (input.at && at < now + MIN_AHEAD_MS) throw new BulletinError("That time has passed. Leave the time out to send it as soon as it is approved.");
  const bulletin = await insertBulletin(db, {
    kind: "manual",
    status: "draft",
    scheduledAt: new Date(at).toISOString(),
    stories: input.stories,
    caption: input.caption ?? "",
    note: input.note ?? null,
    // Not locked while its scripts are still the run's to write (scripts/run-bulletins.ts); the run locks it after.
    locked: !input.write,
    edited: !input.write,
    createdBy: actor,
  });
  if (!bulletin) throw new BulletinError("The bulletin could not be saved.");
  await audit(db, actor, "bulletin.create", bulletin.id, { at: bulletin.scheduledAt, stories: bulletin.stories.length });
  return bulletin;
}

/**
 * Whether a bulletin's stories and time can still be changed at `now`: while it is a draft or approved, and, for one
 * of the table's, until the lock before its time. One made by hand has no lock: it waits for its maker.
 */
export function bulletinEditable(b: Pick<Bulletin, "status" | "kind" | "scheduledAt">, lockMinutes: number, now = Date.now()): boolean {
  if (b.status !== "draft" && b.status !== "approved") return false;
  return b.kind === "manual" || now < bulletinLockAt(Date.parse(b.scheduledAt), lockMinutes);
}

/** A person's edit: stories (order, scripts, graphics), caption, note or time. An approved one goes back to draft. */
export async function editBulletin(
  db: Db,
  id: string,
  version: number,
  changes: { stories?: BulletinStory[]; caption?: string; note?: string | null; at?: string },
  actor: string,
  lockMinutes: number,
  now = Date.now(),
): Promise<Bulletin> {
  const current = await getBulletin(db, id);
  if (!current || current.version !== version) throw new StaleBulletin(id, current);
  if (!bulletinEditable(current, lockMinutes, now)) {
    throw new BulletinError(current.status === "draft" || current.status === "approved" ? "Edits to this bulletin have closed: it is about to be rendered." : `A ${current.status} bulletin can't be edited.`);
  }
  if (changes.stories) checkStories(changes.stories);
  const fields: BulletinFields = { locked: true, edited: true };
  if (changes.stories) fields.stories = changes.stories;
  if (changes.caption !== undefined) fields.caption = changes.caption;
  if (changes.note !== undefined) fields.note = changes.note;
  if (changes.at !== undefined) {
    const at = Date.parse(changes.at);
    if (Number.isNaN(at) || at < now + MIN_AHEAD_MS) throw new BulletinError("Choose a time that is still ahead.");
    if (current.kind === "slot") throw new BulletinError("A scheduled bulletin keeps its time. Skip it and make one by hand for another time.");
    fields.scheduledAt = new Date(at).toISOString();
  }
  // A changed script hasn't been signed off.
  if (current.status === "approved" && changes.stories) Object.assign(fields, { status: "draft", decidedBy: null, decidedAt: null });
  return updateBulletin(db, id, version, fields, actor, "bulletin.edit");
}

async function decide(db: Db, id: string, version: number, status: BulletinStatus, actor: string, action: string, extra: BulletinFields = {}) {
  return updateBulletin(db, id, version, { status, locked: true, decidedBy: actor, decidedAt: nowIso(), ...extra }, actor, action);
}

/** Signs off the scripts: the bulletin is rendered at its lock (or at once, made by hand for now). */
export async function approveBulletin(db: Db, id: string, version: number, actor: string): Promise<Bulletin> {
  const current = await getBulletin(db, id);
  if (!current || current.version !== version) throw new StaleBulletin(id, current);
  if (current.kind === "manual" && !current.locked) throw new BulletinError("Its scripts are still being written; they arrive with the next run.");
  checkStories(current.stories);
  return decide(db, id, version, "approved", actor, "bulletin.approve");
}

/** Turns it down; a slot's next run may draft another. */
export const rejectBulletin = (db: Db, id: string, version: number, actor: string, note?: string) =>
  decide(db, id, version, "rejected", actor, "bulletin.reject", note ? { note } : {});

/** Leaves the time empty: nothing goes out and nothing replaces it. */
export const skipBulletin = (db: Db, id: string, version: number, actor: string) => decide(db, id, version, "skipped", actor, "bulletin.skip");

/** Back to a draft: from approved, rejected, skipped or failed. */
export const reopenBulletin = (db: Db, id: string, version: number, actor: string) =>
  updateBulletin(db, id, version, { status: "draft", decidedBy: null, decidedAt: null, error: null }, actor, "bulletin.reopen");
