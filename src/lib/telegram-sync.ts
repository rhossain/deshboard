/**
 * Keeps a post's Telegram message in step with it after a change made at the edge (a button, or the admin page).
 */
import type { Db } from "./social-db";
import { queueLive } from "./social-actions";
import { queueSettings } from "./social-settings";
import { readSettings, type SocialPost } from "./social-store";
import { editMessage, type TelegramAccess, telegramFromEnv } from "./telegram";
import { previewOf, reviewButtons, reviewText } from "./telegram-review";

export const SITE = "https://bartaboard.com";

export async function syncTelegram(env: Record<string, unknown>, db: Db, post: SocialPost, access?: TelegramAccess | null): Promise<void> {
  const tg = access ?? telegramFromEnv(env as Record<string, string | undefined>);
  if (!tg || !post.telegramMessageId) return;
  const opts = { site: SITE, trial: !(await queueLive(db, post.platform)), lockMinutes: queueSettings(await readSettings(db)).editLockMinutes };
  await editMessage(tg, post.telegramMessageId, reviewText(post, opts), {
    buttons: reviewButtons(post, opts),
    previewUrl: previewOf(post),
  });
}
