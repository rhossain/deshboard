/**
 * A bulletin's message in the admin's Telegram chat (docs/bulletin.md): the scripts to sign off, with buttons, kept
 * in step with the bulletin as it is approved, made and sent. Its buttons' callback_data is "b-<action>:<id>", which
 * functions/api/telegram.ts tells from a post's by the prefix.
 */
import { bulletinLockAt, clockBn } from "./bulletin";
import { type Bulletin, bulletinEditable, updateBulletin } from "./bulletin-store";
import type { Db } from "./social-db";
import { editMessage, type InlineButton, sendMessage, type TelegramAccess } from "./telegram";

const SITE = "https://bartaboard.com";
const GRAPHIC: Record<string, string> = { number: "figure", quote: "quote", versus: "match", points: "key points" };

const dhakaClock = (at: number) => new Date(at + 6 * 3600_000).toISOString().slice(11, 16);

export interface BulletinReviewOptions {
  lockMinutes: number;
  /** Whether an untouched draft goes out by itself (the bulletinPolicy setting); it does unless this says manual. */
  policy?: "auto_unless_rejected" | "manual";
  /** Nothing is posted (BULLETINS=dry). */
  trial: boolean;
  now?: number;
}

function stateLine(b: Bulletin, o: BulletinReviewOptions): string {
  const at = Date.parse(b.scheduledAt);
  const lock = dhakaClock(bulletinLockAt(at, o.lockMinutes));
  switch (b.status) {
    case "draft":
      if (b.kind !== "slot") return "📝 Draft, made by hand. It is made once you approve it.";
      return o.policy === "manual"
        ? `📝 Draft. Approve by ${lock} or it is skipped; editable until then.`
        : `📝 Draft. It goes out at ${dhakaClock(at)} by itself unless you reject or skip it by ${lock}; editable until then.`;
    case "approved":
      return b.kind === "slot" ? `✅ Approved${b.decidedBy ? ` (${b.decidedBy})` : ""}. The video is made at ${lock}.` : "✅ Approved. The video is made on the next run.";
    case "rendering":
      return "🎞 The video is being made…";
    case "ready":
      return `🎬 The video is on Facebook, scheduled for ${dhakaClock(at)}. Stop it before then if it shouldn't go out.`;
    case "posting":
      return "⏳ Being posted…";
    case "posted":
      return `🟢 Posted${b.permalink ? `: ${b.permalink}` : ""}\nIt can be taken down at any time.`;
    case "dry":
      return `🧪 Made and sent here as a preview. ${b.note?.includes("paused") ? "Posting is paused" : "Trial"}: nothing was posted.`;
    case "rejected":
      return "❌ Rejected.";
    case "skipped":
      if (b.note?.startsWith("Not made") || b.note?.startsWith("Taken down") || b.note?.startsWith("Stopped")) return `⏭ ${b.note}`;
      return b.decidedBy === "auto" ? "⏭ Skipped: nobody approved it in time." : "⏭ Skipped.";
    case "failed":
      return `⚠️ Failed: ${b.error ?? "see the run"}`;
  }
}

export function bulletinReviewText(b: Bulletin, o: BulletinReviewOptions): string {
  const at = Date.parse(b.scheduledAt);
  const head = `🎬 Video bulletin · ${clockBn(at)} (${dhakaClock(at)})${b.kind === "manual" ? " · by hand" : ""}${o.trial ? " · trial" : ""}`;
  const stories = b.stories.map((s, i) => `${i + 1}. ${s.script}\n   — ${s.source}${s.more ? ` +${s.more}` : ""} · ${GRAPHIC[s.visual.type] ?? s.visual.type}`);
  return [head, stateLine(b, o), "", ...stories, ...(b.note ? ["", `Notes: ${b.note}`] : [])].join("\n");
}

/**
 * Approve, reject and skip under a draft; stop under one scheduled on Facebook and take down under one that is out;
 * reopen under one decided while its time is still ahead.
 */
export function bulletinButtons(b: Bulletin, o: BulletinReviewOptions): InlineButton[][] {
  const admin: InlineButton = { text: "Open in admin", url: `${SITE}/admin/` };
  const btn = (text: string, action: string): InlineButton => ({ text, callback_data: `b-${action}:${b.id}` });
  const now = o.now ?? Date.now();
  const open = bulletinEditable({ ...b, status: "draft" }, o.lockMinutes, now);
  if (b.status === "draft") return [[btn("✅ Approve", "approve"), btn("❌ Reject", "reject"), btn("⏭ Skip", "skip")], [admin]];
  if (b.status === "approved") return [[btn("↩️ Back to draft", "reopen"), btn("⏭ Skip", "skip")], [admin]];
  if (b.status === "ready") return [[btn("🛑 Stop it", "stop")], [admin]];
  if (b.status === "posted" && b.fbPostId) return [[btn("🗑 Take it down", "stop")], [admin]];
  if ((b.status === "rejected" || b.status === "skipped") && open) return [[btn("↩️ Reopen", "reopen")], [admin]];
  return [[admin]];
}

/** Sends the bulletin's message, or rewrites the one it has; the bulletin, with the message's id once it has one. */
export async function syncBulletinTelegram(db: Db, b: Bulletin, tg: TelegramAccess | null, o: BulletinReviewOptions): Promise<Bulletin> {
  if (!tg) return b;
  const text = bulletinReviewText(b, o);
  const buttons = bulletinButtons(b, o);
  if (b.telegramMessageId) {
    await editMessage(tg, b.telegramMessageId, text, { buttons });
    return b;
  }
  const id = await sendMessage(tg, text, { buttons });
  if (!id) return b;
  try {
    return await updateBulletin(db, b.id, b.version, { telegramMessageId: id }, "run", "bulletin.telegram", { message: id });
  } catch {
    return b; // Changed meanwhile: the message stands, and the next change finds it by its id or sends another.
  }
}
