/**
 * Keeps a post's Telegram message in step with it after a change made at the edge (a button, or the admin page).
 */
import type { Db } from "./social-db";
import { queueLive } from "./social-actions";
import type { SocialPost } from "./social-store";
import { editMessage, type TelegramAccess, telegramFromEnv } from "./telegram";
import { reviewButtons, reviewText } from "./telegram-review";

export const SITE = "https://bartaboard.com";

export async function syncTelegram(env: Record<string, unknown>, db: Db, post: SocialPost, access?: TelegramAccess | null): Promise<void> {
  const tg = access ?? telegramFromEnv(env as Record<string, string | undefined>);
  if (!tg || !post.telegramMessageId) return;
  const opts = { site: SITE, trial: !(await queueLive(db)) };
  await editMessage(tg, post.telegramMessageId, reviewText(post, opts), {
    buttons: reviewButtons(post, opts),
    previewUrl: post.cards.length === 1 ? post.link : undefined,
  });
}
