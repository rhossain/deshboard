/**
 * The admin's settings for the Page's queue, as stored in the settings table (social-store.ts readSettings) and
 * changed in the admin; whatever is missing or malformed falls back to the defaults below.
 */
import { BULLETIN_LEAD_MINUTES, BULLETIN_LOCK_MINUTES, BULLETIN_STORIES } from "./bulletin-defaults";
import type { Slot } from "./slot-table";
import type { Policy } from "./social-store";

export interface QueueSettings {
  /** Nothing is posted while paused; drafts are still made, and those whose time passes are skipped. */
  paused: boolean;
  /** What happens to a slot's draft nobody touched by its time. */
  slotPolicy: Policy;
  /** The same for breaking news (auto: posted at once, and you're told). */
  breakingPolicy: Policy;
  /** How long before its time a slot's draft is made (and refreshed every run until someone touches it). */
  draftLeadMinutes: number;
  /** The slot table; null: FB_SLOTS, else page-posts.ts SLOTS. */
  slots: Slot[] | null;
  /**
   * Edits close this long before a post's time, and the picker stops refreshing its draft then too: what the admin
   * sees at that moment is what goes out. Approve, reject and skip stay open until it goes.
   */
  editLockMinutes: number;
  /**
   * Instagram's times of day ("HH:MM", Dhaka), each a carousel of headlines; null: the Page's headline times
   * (instagram-post.ts IG_DEFAULT_TIMES). Instagram uses the other settings (pause, policy, lead, lock) as they are.
   */
  instagramTimes: string[] | null;
  /** Video bulletins' times of day ("HH:MM", Dhaka); null: bulletin.ts BULLETIN_TIMES (10:00, 16:00, 21:00). */
  bulletinTimes: string[] | null;
  /** How long before its time a bulletin's draft is made. Bulletins keep their own lead and lock: they need rendering. */
  bulletinLeadMinutes: number;
  /** Edits to a bulletin close this long before its time (the voice, the render and the preview take it); at least ten minutes less than the lead. */
  bulletinLockMinutes: number;
  /** Stories in a bulletin the picker makes (3 to 6). */
  bulletinStories: number;
}

export const DEFAULT_SETTINGS: QueueSettings = {
  paused: false,
  slotPolicy: "auto_unless_rejected",
  breakingPolicy: "auto",
  draftLeadMinutes: 40,
  slots: null,
  editLockMinutes: 5,
  instagramTimes: null,
  bulletinTimes: null,
  bulletinLeadMinutes: BULLETIN_LEAD_MINUTES,
  bulletinLockMinutes: BULLETIN_LOCK_MINUTES,
  bulletinStories: BULLETIN_STORIES,
};

const POLICIES: Policy[] = ["manual", "auto_unless_rejected", "auto"];
const CONTENTS = ["headlines", "news", "video", "roundup"];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function queueSettings(raw: Record<string, unknown>): QueueSettings {
  const policy = (v: unknown, d: Policy) => (POLICIES.includes(v as Policy) ? (v as Policy) : d);
  const lead = Number(raw.draftLeadMinutes);
  const lock = Number(raw.editLockMinutes);
  const slots = Array.isArray(raw.slots)
    ? (raw.slots as Slot[]).filter((s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s?.time) && CONTENTS.includes(s?.content))
    : [];
  const times = Array.isArray(raw.instagramTimes)
    ? [...new Set((raw.instagramTimes as unknown[]).filter((t): t is string => typeof t === "string" && TIME.test(t)))].sort()
    : [];
  const bulletinTimes = Array.isArray(raw.bulletinTimes)
    ? [...new Set((raw.bulletinTimes as unknown[]).filter((t): t is string => typeof t === "string" && TIME.test(t)))].sort()
    : [];
  const bLead = Number(raw.bulletinLeadMinutes);
  const bulletinLead = Number.isFinite(bLead) && bLead >= 30 && bLead <= 360 ? bLead : DEFAULT_SETTINGS.bulletinLeadMinutes;
  const bLock = Number(raw.bulletinLockMinutes);
  const bulletinLock =
    Number.isInteger(bLock) && bLock >= 10 && bLock <= 60 && bLock <= bulletinLead - 10
      ? bLock
      : Math.min(DEFAULT_SETTINGS.bulletinLockMinutes, bulletinLead - 10);
  const bStories = Number(raw.bulletinStories);
  return {
    paused: raw.paused === true,
    slotPolicy: policy(raw.slotPolicy, DEFAULT_SETTINGS.slotPolicy),
    breakingPolicy: policy(raw.breakingPolicy, DEFAULT_SETTINGS.breakingPolicy),
    draftLeadMinutes: Number.isFinite(lead) && lead >= 20 && lead <= 360 ? lead : DEFAULT_SETTINGS.draftLeadMinutes,
    slots: slots.length ? slots : null,
    editLockMinutes: raw.editLockMinutes !== undefined && Number.isInteger(lock) && lock >= 0 && lock <= 30 ? lock : DEFAULT_SETTINGS.editLockMinutes,
    instagramTimes: times.length ? times.slice(0, 12) : null,
    bulletinTimes: bulletinTimes.length ? bulletinTimes.slice(0, 8) : null,
    bulletinLeadMinutes: bulletinLead,
    bulletinLockMinutes: bulletinLock,
    bulletinStories: Number.isInteger(bStories) && bStories >= 3 && bStories <= 6 ? bStories : DEFAULT_SETTINGS.bulletinStories,
  };
}

/** When editing a post closes (ms): `lockMinutes` before it goes out. */
export const editDeadline = (scheduledAt: string, lockMinutes: number) => Date.parse(scheduledAt) - lockMinutes * 60_000;

/** Whether a post going out at `scheduledAt` can still be edited at `now`. */
export const editable = (scheduledAt: string, lockMinutes: number, now = Date.now()) => now < editDeadline(scheduledAt, lockMinutes);
