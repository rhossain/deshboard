/**
 * The admin's settings for the Page's queue, as stored in the settings table (social-store.ts readSettings) and
 * changed in the admin; whatever is missing or malformed falls back to the defaults below.
 */
import type { Slot } from "./page-posts";
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
}

export const DEFAULT_SETTINGS: QueueSettings = {
  paused: false,
  slotPolicy: "auto_unless_rejected",
  breakingPolicy: "auto",
  draftLeadMinutes: 60,
  slots: null,
};

const POLICIES: Policy[] = ["manual", "auto_unless_rejected", "auto"];
const CONTENTS = ["headlines", "news", "video", "roundup"];

export function queueSettings(raw: Record<string, unknown>): QueueSettings {
  const policy = (v: unknown, d: Policy) => (POLICIES.includes(v as Policy) ? (v as Policy) : d);
  const lead = Number(raw.draftLeadMinutes);
  const slots = Array.isArray(raw.slots)
    ? (raw.slots as Slot[]).filter((s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s?.time) && CONTENTS.includes(s?.content))
    : [];
  return {
    paused: raw.paused === true,
    slotPolicy: policy(raw.slotPolicy, DEFAULT_SETTINGS.slotPolicy),
    breakingPolicy: policy(raw.breakingPolicy, DEFAULT_SETTINGS.breakingPolicy),
    draftLeadMinutes: Number.isFinite(lead) && lead >= 20 && lead <= 360 ? lead : DEFAULT_SETTINGS.draftLeadMinutes,
    slots: slots.length ? slots : null,
  };
}
