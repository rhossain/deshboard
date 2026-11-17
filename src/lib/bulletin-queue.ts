/**
 * What a run does with a bulletin at a given moment (docs/bulletin.md): wait, skip a draft nobody approved in time,
 * have an approved one made, or give up on one whose making never finished. Pure, so it can be tested without a run.
 */
import { bulletinLockAt } from "./bulletin";
import type { Bulletin } from "./bulletin-store";

export type BulletinStep = "wait" | "skip" | "make" | "stuck";
/** What becomes of one of the table's drafts nobody touched by its lock (the bulletinPolicy setting). */
export type BulletinPolicy = "auto_unless_rejected" | "manual";

/**
 * A bulletin still "rendering" this long after it started has lost its run. Long on purpose: GitHub has kept a run
 * waiting for a runner for fifty minutes (16 Nov 2026), and a bulletin given up on while its run was only queued
 * cannot be made when the run does start.
 */
export const RENDER_LIMIT_MS = 90 * 60_000;
/** A scheduled bulletin whose video is only made this long after its time is not sent out: it would say the wrong hour. */
export const LATE_MS = 45 * 60_000;
/** What the plan writes when it gives up on a making (and what a late run recognises, to take it up again). */
export const NEVER_FINISHED = "The video was never finished (its run stopped).";

/**
 * Whether a run that has only now started should still make the bulletin: one of the table's, until LATE_MS after its
 * time (it goes out late, at once); one made by hand, always: it has no hour to miss.
 */
export const stillWorthMaking = (b: Pick<Bulletin, "kind" | "scheduledAt">, now: number) => b.kind === "manual" || now <= Date.parse(b.scheduledAt) + LATE_MS;
/** A draft made by hand that nobody approved goes stale this long after its time. */
export const MANUAL_STALE_MS = 6 * 3600_000;
/** A rejected slot is drafted again, with other stories, at most this many times. */
export const REDRAFTS = 2;

export function bulletinStep(
  b: Pick<Bulletin, "status" | "kind" | "scheduledAt" | "updatedAt">,
  lockMinutes: number,
  now: number,
  policy: BulletinPolicy = "auto_unless_rejected",
): BulletinStep {
  const at = Date.parse(b.scheduledAt);
  const lock = bulletinLockAt(at, lockMinutes);
  if (b.status === "rendering") return now - Date.parse(b.updatedAt) > RENDER_LIMIT_MS ? "stuck" : "wait";
  if (b.status === "draft") {
    // The table's, untouched at the lock: made as it stands (the policy's default) or, where sign-off is required,
    // skipped. One made by hand waits for its maker, but not for ever.
    if (b.kind === "slot") return now < lock ? "wait" : policy === "manual" ? "skip" : "make";
    return now > at + MANUAL_STALE_MS ? "skip" : "wait";
  }
  // Approved: made at the lock, so it is ready before its time; one made by hand for now is made at once.
  if (b.status === "approved") return now >= lock ? "make" : "wait";
  return "wait";
}
