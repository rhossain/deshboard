/**
 * The admin's settings for the Page's queue, as stored in the settings table (social-store.ts readSettings) and
 * changed in the admin; whatever is missing or malformed falls back to the defaults below.
 */
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
}

export const DEFAULT_SETTINGS: QueueSettings = {
  paused: false,
  slotPolicy: "auto_unless_rejected",
  breakingPolicy: "auto",
  draftLeadMinutes: 40,
  slots: null,
  editLockMinutes: 5,
  instagramTimes: null,
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
  return {
    paused: raw.paused === true,
    slotPolicy: policy(raw.slotPolicy, DEFAULT_SETTINGS.slotPolicy),
    breakingPolicy: policy(raw.breakingPolicy, DEFAULT_SETTINGS.breakingPolicy),
    draftLeadMinutes: Number.isFinite(lead) && lead >= 20 && lead <= 360 ? lead : DEFAULT_SETTINGS.draftLeadMinutes,
    slots: slots.length ? slots : null,
    editLockMinutes: raw.editLockMinutes !== undefined && Number.isInteger(lock) && lock >= 0 && lock <= 30 ? lock : DEFAULT_SETTINGS.editLockMinutes,
    instagramTimes: times.length ? times.slice(0, 12) : null,
  };
}

/** When editing a post closes (ms): `lockMinutes` before it goes out. */
export const editDeadline = (scheduledAt: string, lockMinutes: number) => Date.parse(scheduledAt) - lockMinutes * 60_000;

/** Whether a post going out at `scheduledAt` can still be edited at `now`. */
export const editable = (scheduledAt: string, lockMinutes: number, now = Date.now()) => now < editDeadline(scheduledAt, lockMinutes);
