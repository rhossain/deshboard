/**
 * POST /api/telegram — the admin's Telegram bot (@bartaboard_bot), called by Telegram (setWebhook: the ops
 * workflow's telegram-webhook task). Outside Cloudflare Access, so it trusts a request only when it carries the
 * webhook's secret (X-Telegram-Bot-Api-Secret-Token) and comes from the admin's own chat.
 *
 * Buttons under a draft (src/lib/telegram-review.ts): approve, reject (its story left out for a day), skip, reopen;
 * the message is rewritten to show what was done. Commands: /status, /pause, /resume.
 */
import { ActionError, approve, queueLive, reject, reopen, skip } from "../../src/lib/social-actions";
import { fromBinding } from "../../src/lib/social-db";
import { getPost, listPosts, readSettings, writeSetting } from "../../src/lib/social-store";
import { queueSettings } from "../../src/lib/social-settings";
import { sendMessage, type TelegramAccess } from "../../src/lib/telegram";
import { CONTENT_LABEL, dhakaClock } from "../../src/lib/telegram-review";
import { syncTelegram } from "../../src/lib/telegram-sync";

interface Env {
  SOCIAL_DB: D1Database;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  TELEGRAM_ADMIN_CHAT_ID?: string;
}

interface Update {
  callback_query?: { id: string; from: { id: number }; data?: string; message?: { message_id: number; chat: { id: number } } };
  message?: { message_id: number; chat: { id: number }; from?: { id: number }; text?: string };
}

const ok = () => new Response("ok");

/** Constant-time comparison of the secret. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function answerCallback(token: string, id: string, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: id, text: text.slice(0, 190) }),
  }).catch(() => undefined);
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const secret = env.TELEGRAM_WEBHOOK_SECRET ?? "";
  if (!secret || !same(request.headers.get("x-telegram-bot-api-secret-token") ?? "", secret)) return new Response("forbidden", { status: 403 });
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_ADMIN_CHAT_ID) return ok();
  const tg: TelegramAccess = { token: env.TELEGRAM_BOT_TOKEN, chatId: env.TELEGRAM_ADMIN_CHAT_ID };
  const admin = Number(env.TELEGRAM_ADMIN_CHAT_ID);
  const update = (await request.json().catch(() => ({}))) as Update;
  const db = fromBinding(env.SOCIAL_DB);
  const ctx = { db, actor: "telegram", fb: null };

  const cb = update.callback_query;
  if (cb) {
    if (cb.from.id !== admin) {
      await answerCallback(tg.token, cb.id, "Not allowed.");
      return ok();
    }
    const [action, id] = (cb.data ?? "").split(":");
    const post = id ? await getPost(db, id) : null;
    if (!post) {
      await answerCallback(tg.token, cb.id, "That post is gone.");
      return ok();
    }
    try {
      const done =
        action === "approve"
          ? await approve(ctx, post.id, post.version)
          : action === "reject"
            ? await reject(ctx, post.id, post.version, { reason: "rejected on Telegram", scopes: ["story"], hours: 24 })
            : action === "skip"
              ? await skip(ctx, post.id, post.version)
              : action === "reopen"
                ? await reopen(ctx, post.id, post.version)
                : null;
      if (!done) {
        await answerCallback(tg.token, cb.id, "Unknown button.");
        return ok();
      }
      await answerCallback(tg.token, cb.id, { approve: "Approved.", reject: "Rejected: another draft comes next run.", skip: "Slot skipped.", reopen: "Back to a draft." }[action] ?? "Done.");
      await syncTelegram(env as unknown as Record<string, unknown>, db, cb.message ? { ...done, telegramMessageId: done.telegramMessageId ?? cb.message.message_id } : done, tg);
    } catch (err) {
      await answerCallback(tg.token, cb.id, err instanceof ActionError ? err.message : "Something went wrong; try the admin page.");
      // Show the post as it now is (someone changed it meanwhile).
      const now = await getPost(db, post.id);
      if (now) await syncTelegram(env as unknown as Record<string, unknown>, db, now, tg);
    }
    return ok();
  }

  const msg = update.message;
  if (msg?.text && msg.chat.id === admin) {
    const command = msg.text.trim().split(/\s|@/)[0].toLowerCase();
    if (command === "/pause" || command === "/resume") {
      await writeSetting(db, "paused", command === "/pause", "telegram");
      await sendMessage(tg, command === "/pause" ? "⏸ Posting paused. Drafts are still made; nothing goes out. /resume to start again." : "▶️ Posting resumed.");
    } else if (command === "/status") {
      const settings = queueSettings(await readSettings(db));
      const [live, igLive] = await Promise.all([queueLive(db, "facebook"), queueLive(db, "instagram")]);
      const now = Date.now();
      const posts = await listPosts(db, { platform: "any", from: new Date(now - 30 * 60_000).toISOString(), to: new Date(now + 24 * 3600_000).toISOString() });
      const lines = posts
        .filter((p) => ["draft", "approved", "failed", "posted"].includes(p.status))
        .slice(0, 16)
        .map((p) => `${dhakaClock(p.scheduledAt)} ${p.platform === "instagram" ? "📸 " : ""}${CONTENT_LABEL[p.content] ?? p.content} — ${p.status}`);
      await sendMessage(
        tg,
        [
          `Facebook: ${live ? "🟢 Live" : "🧪 Trial"} · Instagram: ${igLive ? "🟢 Live" : "🧪 Trial"}${settings.paused ? " · ⏸ paused" : ""}`,
          "",
          ...(lines.length ? lines : ["Nothing queued in the next 24 hours yet."]),
          "",
          "https://bartaboard.com/admin/",
        ].join("\n"),
      );
    } else {
      await sendMessage(tg, "Drafts arrive here about 40 minutes before each slot, with buttons to approve, reject or skip.\n\n/status — what's coming\n/pause — stop posting\n/resume — start again\n\nhttps://bartaboard.com/admin/");
    }
  }
  return ok();
};
