/**
 * Shared by the admin API's bulletin handlers (functions/api/admin/bulletins): what the browser sends is made into
 * stories nothing else needs to doubt, a bulletin's refusals become the API's answers, and its Telegram message is
 * kept in step.
 */
import { type BulletinStory, MAX_SCRIPT_CHARS, MAX_STORIES, OTHER_REPORTS, visualOf } from "./bulletin";
import { type Bulletin, BulletinError, StaleBulletin } from "./bulletin-store";
import { CATEGORIES, type Category } from "./categories";
import { ActionError } from "./social-actions";
import type { Db } from "./social-db";
import { queueSettings } from "./social-settings";
import { readSettings } from "./social-store";
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

/** How a bulletin's Telegram message is written here: the lock from the settings, a trial unless BULLETINS is on. */
export async function reviewOptions(db: Db, env: Record<string, unknown>) {
  return { lockMinutes: queueSettings(await readSettings(db)).bulletinLockMinutes, trial: env.BULLETINS !== "on" };
}

/** Rewrites (or sends) the bulletin's Telegram message after a change made in the admin. */
export async function syncBulletin(env: Record<string, unknown>, db: Db, bulletin: Bulletin): Promise<void> {
  await syncBulletinTelegram(db, bulletin, telegramFromEnv(env as Record<string, string | undefined>), await reviewOptions(db, env));
}
