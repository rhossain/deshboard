/**
 * The Telegram message for a queued post: its text, and the buttons under it (Approve, Reject, Skip, Undo, Open).
 * The same message is written by the deploy when it drafts (scripts/post-facebook.ts) and rewritten whenever the
 * post changes — refreshed by a run, decided in the admin or with a button (functions/api/telegram.ts), posted —
 * so what the chat shows is the post as it stands.
 */
import { postImages } from "./instagram-post";
import type { SocialPost } from "./social-store";
import type { InlineButton } from "./telegram";

const DHAKA = "Asia/Dhaka";
const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
const bn = (n: number) => String(n).replace(/\d/g, (d) => BN_DIGITS[+d]);

export const dhakaClock = (iso: string | number) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: DHAKA, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export const CONTENT_LABEL: Record<string, string> = {
  headlines: "5 headlines",
  news: "one headline",
  video: "a video",
  roundup: "5 videos",
  custom: "your post",
};

const POLICY_LINE: Record<string, string> = {
  auto_unless_rejected: "Posts by itself at its time unless you reject it.",
  auto: "Posts by itself at its time.",
  manual: "Waits for your approval: not posted unless you approve it.",
};

function statusLine(post: SocialPost, by?: string): string {
  const who = by ?? (post.decidedBy?.startsWith("panel:") ? "in the admin" : post.decidedBy === "telegram" ? "here" : "");
  switch (post.status) {
    case "draft":
      return POLICY_LINE[post.policy] ?? "";
    case "approved":
      return `✅ Approved${who ? ` ${who}` : ""}: goes out at ${dhakaClock(post.scheduledAt)}.`;
    case "rejected":
      return `❌ Rejected${who ? ` ${who}` : ""}: the next run drafts something else for this slot.`;
    case "skipped":
      return `⏭ Skipped${who ? ` ${who}` : ""}: nothing goes out in this slot.`;
    case "posting":
      return "⏳ Posting…";
    case "posted":
      return post.removedAt ? "🗑 Posted, then taken down." : `📣 Posted at ${dhakaClock(post.postedAt ?? post.scheduledAt)}.`;
    case "failed":
      return `⚠️ Not posted: ${post.error ?? `${post.platform === "instagram" ? "Instagram" : "Facebook"} refused it`}. The next run tries again.`;
    case "dry":
      return "🧪 Trial pick: the queue would have posted this (nothing was sent).";
    default:
      return "";
  }
}

export interface ReviewOptions {
  site: string;
  /** The post's platform is on trial (FB_QUEUE=shadow, IG_POSTING=dry): nothing it drafts is posted. */
  trial: boolean;
  /** "Draft updated" rather than "Draft". */
  refreshed?: boolean;
  /** Edits close this long before the post goes out (settings: editLockMinutes). */
  lockMinutes?: number;
}

/** "Editable until 17:25" while edits are open, "Locked" after. */
function lockLine(post: SocialPost, lockMinutes: number | undefined, now: number): string | null {
  if (lockMinutes === undefined || !["draft", "approved"].includes(post.status)) return null;
  const until = Date.parse(post.scheduledAt) - lockMinutes * 60_000;
  return now < until
    ? `✏️ Editable until ${dhakaClock(until)} (in the admin).`
    : `🔒 Locked for editing since ${dhakaClock(until)}; you can still reject or skip it.`;
}

export function reviewText(post: SocialPost, o: ReviewOptions): string {
  const open = ["draft", "approved", "failed"].includes(post.status);
  const head = open ? (o.refreshed ? "🔄 Draft updated" : "📝 Draft") : "📝";
  const instagram = post.platform === "instagram";
  // An Instagram caption lists its headlines itself.
  const cards = post.cards.length > 1 && !instagram ? post.cards.map((c, i) => `${bn(i + 1)}. ${c.title} — ${c.source}`) : [];
  const trial = instagram
    ? "(Trial run: Instagram gets nothing yet; IG_POSTING=dry.)"
    : "(Trial run: the Page still posts the old way; this queue posts nothing yet.)";
  const pictures = instagram && open ? (postImages(post).length ? [] : ["🖼 Its pictures are drawn by the next run."]) : [];
  return [
    `${head} · ${instagram ? "📸 Instagram · " : ""}${dhakaClock(post.scheduledAt)} · ${CONTENT_LABEL[post.content] ?? post.content}${post.kind === "breaking" ? " · breaking" : ""}`,
    statusLine(post),
    ...[lockLine(post, o.lockMinutes, Date.now())].filter((l): l is string => !!l),
    ...(o.trial && open ? [trial] : []),
    ...pictures,
    "",
    post.message,
    ...(cards.length ? ["", ...cards] : post.link && !instagram ? [post.link] : []),
  ].join("\n");
}

/** callback_data: "<action>:<post id>" (Telegram allows 64 bytes). */
export function reviewButtons(post: SocialPost, o: ReviewOptions): InlineButton[][] {
  const admin: InlineButton = { text: "Open in admin", url: `${o.site}/admin/` };
  const b = (text: string, action: string): InlineButton => ({ text, callback_data: `${action}:${post.id}` });
  switch (post.status) {
    case "draft":
      return [[b("✅ Approve", "approve"), b("❌ Reject", "reject")], [b("⏭ Skip slot", "skip"), admin]];
    case "approved":
      return [[b("↩️ Undo", "reopen"), b("❌ Reject", "reject")], [admin]];
    case "failed":
      return [[b("🔁 Try again", "approve"), b("⏭ Skip", "skip")], [admin]];
    case "rejected":
    case "skipped":
      return [[b("↩️ Undo", "reopen"), admin]];
    case "posted":
      if (post.platform === "instagram") return post.permalink ? [[{ text: "View on Instagram", url: post.permalink }, admin]] : [[admin]];
      return post.fbPostId && !post.removedAt ? [[{ text: "View on Facebook", url: `https://www.facebook.com/${post.fbPostId}` }, admin]] : [[admin]];
    default:
      return [[admin]];
  }
}

/** The address Telegram previews under the message: an Instagram post's first picture, else a single post's link. */
export function previewOf(post: SocialPost): string | undefined {
  if (post.platform === "instagram") return postImages(post)[0];
  return post.cards.length === 1 ? post.link : undefined;
}
