/**
 * Shared by the admin API's bulletin handlers (functions/api/admin/bulletins): what the browser sends is made into
 * stories nothing else needs to doubt, a bulletin's refusals become the API's answers, and its Telegram message is
 * kept in step.
 */
import { type BulletinStory, MAX_SCRIPT_CHARS, MAX_STORIES, OTHER_REPORTS, visualOf } from "./bulletin";
import { type Bulletin, BulletinError, getBulletin, StaleBulletin, updateBulletin } from "./bulletin-store";
import { graphFromEnv } from "./facebook-graph";
import { deleteVideo } from "./facebook-reels";
import { CATEGORIES, type Category } from "./categories";
import { ActionError } from "./social-actions";
import type { Db } from "./social-db";
import { queueSettings } from "./social-settings";
import { lastRunOf, readSettings } from "./social-store";
import { telegramFromEnv } from "./telegram";
import { syncBulletinTelegram } from "./telegram-bulletin";

/** A bulletin's own errors as the API's: a refusal is the caller's to read (400), a stale version a conflict (409). */
export async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof BulletinError) throw new ActionError(400, e.message);
    if (e instanceof StaleBulletin) throw new ActionError(409, e.message);
    throw e;
  }
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const web = (v: unknown) => (typeof v === "string" && /^https?:\/\/[^\s]+$/.test(v) ? v.slice(0, 600) : "");
const SECTIONS = new Set<string>(CATEGORIES.map((c) => c.id));

/**
 * The stories of a request, as stored: every text trimmed and capped, the section one of the board's, the graphic one
 * the renderer draws, and nothing a browser has no business setting (voice clips, word times).
 */
export function storiesOf(raw: unknown): BulletinStory[] {
  if (!Array.isArray(raw)) throw new ActionError(400, "the bulletin's stories are missing");
  if (raw.length > MAX_STORIES) throw new ActionError(400, `a bulletin holds ${MAX_STORIES} stories at most`);
  return raw.map((r, i) => {
    const o = (r ?? {}) as Record<string, unknown>;
    const visual = visualOf(o.visual);
    const link = web(o.link);
    if (!visual) throw new ActionError(400, `story ${i + 1}'s graphic isn't one the bulletin can draw`);
    if (!link) throw new ActionError(400, `story ${i + 1} has no link to its article`);
    const reports = (Array.isArray(o.reports) ? o.reports : [])
      .map((x) => ({ link: web((x as Record<string, unknown>)?.link), source: text((x as Record<string, unknown>)?.source, 60), sourceId: text((x as Record<string, unknown>)?.sourceId, 60) }))
      .filter((x) => x.link && x.source && x.sourceId)
      .slice(0, OTHER_REPORTS);
    const more = Number(o.more);
    return {
      key: text(o.key, 600) || link,
      link,
      section: (SECTIONS.has(String(o.section)) ? o.section : "other") as Category,
      headline: text(o.headline, 220),
      short: text(o.short, 120) || text(o.headline, 120),
      source: text(o.source, 60),
      sourceId: text(o.sourceId, 60),
      more: Number.isInteger(more) && more > 0 ? Math.min(more, 99) : 0,
      script: text(o.script, MAX_SCRIPT_CHARS),
      visual,
      ...(reports.length ? { reports } : {}),
    };
  });
}

/**
 * Stops a bulletin that is on Facebook: one scheduled for its time (ready), or, at any time after, one already out
 * (posted). The video is taken off the Page, then the bulletin is marked skipped, with a note of which it was. Nothing
 * is marked if Facebook won't take it off.
 */
export async function stopBulletin(db: Db, env: Record<string, unknown>, id: string, version: number, actor: string): Promise<Bulletin> {
  const current = await getBulletin(db, id);
  if (!current || current.version !== version) throw new StaleBulletin(id, current);
  if (current.status !== "ready" && current.status !== "posted") throw new BulletinError(`A ${current.status} bulletin has nothing on Facebook to take off.`);
  const wasOut = current.status === "posted";
  if (current.fbPostId) {
    const fb = graphFromEnv(env as Record<string, string | undefined>);
    if (!fb) throw new BulletinError("Facebook isn't set up here, so it can't be stopped from this page. Remove it in Meta Business Suite.");
    try {
      await deleteVideo(fb, current.fbPostId);
    } catch (e) {
      throw new BulletinError(`Facebook wouldn't remove it: ${(e as Error).message}`);
    }
  }
  return updateBulletin(
    db,
    id,
    version,
    { status: "skipped", decidedBy: actor, decidedAt: new Date().toISOString(), note: wasOut ? "Taken down from the Page after it went out." : "Stopped before it went out.", permalink: null },
    actor,
    wasOut ? "bulletin.take-down" : "bulletin.stop",
  );
}

/**
 * Whether bulletins are posted to the Page: as the timed run last ran (scripts/run-bulletins.ts records each plan as
 * bulletins-plan, or bulletins-plan-dry in a trial), so the admin needs no setting of its own to know.
 */
export async function bulletinsLive(db: Db): Promise<boolean> {
  return (await lastRunOf(db, ["bulletins-plan", "bulletins-plan-dry"]))?.step === "bulletins-plan";
}

/** How a bulletin's Telegram message is written here: the lock from the settings, a trial unless the runs are live. */
export async function reviewOptions(db: Db) {
  const settings = queueSettings(await readSettings(db));
  return { lockMinutes: settings.bulletinLockMinutes, policy: settings.bulletinPolicy, trial: !(await bulletinsLive(db)) };
}

/** Rewrites (or sends) the bulletin's Telegram message after a change made in the admin. */
export async function syncBulletin(env: Record<string, unknown>, db: Db, bulletin: Bulletin): Promise<void> {
  await syncBulletinTelegram(db, bulletin, telegramFromEnv(env as Record<string, string | undefined>), await reviewOptions(db));
}
