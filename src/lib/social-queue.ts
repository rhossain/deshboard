/**
 * When the Page's queue acts on a post (scripts/post-facebook.ts queueMain): pure rules, tested in
 * scripts/test-social-store.ts.
 *
 * A slot's draft is made `draftLead` before its time and refreshed every run until a person touches it. It goes out
 * `publishLead` before its time (0 when posting straight away; ahead in review mode, as a Facebook scheduled post),
 * unless it waits for approval (policy manual) or posting is paused. A post still not out MISSED_MS after its time is
 * skipped: news an hour late is not worth posting.
 */
import { slotTimes, type Slot } from "./page-posts";
import type { Block } from "./social-store";
import type { SocialPost } from "./social-store";

export const MISSED_MS = 45 * 60_000;
/** In review mode, a post goes to Facebook this long before its time, scheduled, so it can still be deleted there. */
export const REVIEW_PUBLISH_LEAD_MS = 20 * 60_000;
/** Breaking news that waits for a look (its policy isn't auto) goes out this long after it was found. */
export const BREAKING_REVIEW_MS = 20 * 60_000;

export type QueueAction = "wait" | "publish" | "hold" | "miss";

/** What to do with an open post (draft, approved or failed) now. */
export function queueAction(
  post: Pick<SocialPost, "status" | "policy" | "scheduledAt">,
  now: number,
  { publishLead, paused }: { publishLead: number; paused: boolean },
): QueueAction {
  const at = Date.parse(post.scheduledAt);
  if (now > at + MISSED_MS) return "miss";
  if (now < at - publishLead) return "wait";
  if (paused) return "hold";
  if (post.status === "draft" && post.policy === "manual") return "hold";
  return "publish";
}

/** The slots whose draft is due now: from `draftLead` before their time until they are missed. */
export function slotsToDraft(now: number, slots: Slot[], draftLead: number): (Slot & { at: number })[] {
  return slotTimes(now, slots).filter((s) => now >= s.at - draftLead && now < s.at + MISSED_MS);
}

/** Blocks as sets, for leaving stories, outlets, sections, channels and words out of a pick. */
export function blockSets(blocks: Block[]) {
  const keys = new Set<string>();
  const outlets = new Set<string>();
  const sections = new Set<string>();
  const channels = new Set<string>();
  const words: string[] = [];
  for (const b of blocks) {
    if (b.type === "story" && typeof b.value === "object") b.value.keys.forEach((k) => keys.add(k));
    else if (typeof b.value === "string") {
      if (b.type === "outlet") outlets.add(b.value);
      else if (b.type === "section") sections.add(b.value);
      else if (b.type === "channel") channels.add(b.value);
      else if (b.type === "word" && b.value.trim()) words.push(b.value.trim());
    }
  }
  return { keys, outlets, sections, channels, words, hasWord: (text: string) => words.some((w) => text.includes(w)) };
}

/** Two records about the same stories (what a refresh compares, to leave an unchanged draft alone). */
export function sameStories(a: { keys: string[] } | null | undefined, b: { keys: string[] } | null | undefined): boolean {
  if (!a || !b) return false;
  return [...a.keys].sort().join("\n") === [...b.keys].sort().join("\n");
}
