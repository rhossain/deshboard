/**
 * The admin's Telegram bot (@bartaboard_bot): messages to the admin's chat (TELEGRAM_ADMIN_CHAT_ID), from the deploy
 * and from the Pages Functions alike. Plain text, so headlines need no escaping. Never throws: a message that can't
 * be sent is reported and the work goes on.
 */
export interface TelegramAccess {
  token: string;
  chatId: string;
}

export interface InlineButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface SendOptions {
  /** Rows of buttons under the message. */
  buttons?: InlineButton[][];
  /** The link whose preview Telegram shows (none when omitted). */
  previewUrl?: string;
  silent?: boolean;
}

export function telegramFromEnv(env: Record<string, string | undefined>): TelegramAccess | null {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = env.TELEGRAM_ADMIN_CHAT_ID?.trim();
  return token && chatId ? { token, chatId } : null;
}

/** Telegram's limit is 4096 characters a message. */
const clip = (text: string) => (text.length > 4000 ? `${text.slice(0, 3990)}…` : text);

async function call<T>(access: TelegramAccess, method: string, body: Record<string, unknown>): Promise<T | null> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${access.token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const out = (await res.json()) as { ok: boolean; result?: T; description?: string };
    if (!out.ok) {
      console.log(`! Telegram ${method}: ${out.description ?? res.status}`);
      return null;
    }
    return out.result ?? null;
  } catch (err) {
    console.log(`! Telegram ${method}: ${(err as Error).message}`);
    return null;
  }
}

function shape(access: TelegramAccess, text: string, opts: SendOptions) {
  return {
    chat_id: access.chatId,
    text: clip(text),
    disable_notification: opts.silent ?? false,
    link_preview_options: opts.previewUrl ? { url: opts.previewUrl, prefer_large_media: true } : { is_disabled: true },
    ...(opts.buttons && { reply_markup: { inline_keyboard: opts.buttons } }),
  };
}

/** Sends a message; its id, or null. */
export async function sendMessage(access: TelegramAccess, text: string, opts: SendOptions = {}): Promise<number | null> {
  const msg = await call<{ message_id: number }>(access, "sendMessage", shape(access, text, opts));
  return msg?.message_id ?? null;
}

/**
 * Sends a video (MP4, up to the Bot API's 50 MB) with a caption of at most 1024 characters; its message id, or null.
 * Vertical 1080×1920 unless told otherwise.
 */
export async function sendVideo(access: TelegramAccess, video: Uint8Array, caption = "", size = { width: 1080, height: 1920 }): Promise<number | null> {
  try {
    const form = new FormData();
    form.set("chat_id", access.chatId);
    form.set("caption", caption.slice(0, 1024));
    form.set("supports_streaming", "true");
    form.set("width", String(size.width));
    form.set("height", String(size.height));
    const bytes = video.buffer.slice(video.byteOffset, video.byteOffset + video.byteLength) as ArrayBuffer;
    form.set("video", new Blob([bytes], { type: "video/mp4" }), "bulletin.mp4");
    const res = await fetch(`https://api.telegram.org/bot${access.token}/sendVideo`, { method: "POST", body: form, signal: AbortSignal.timeout(180_000) });
    const out = (await res.json()) as { ok: boolean; result?: { message_id: number }; description?: string };
    if (!out.ok) {
      console.log(`! Telegram sendVideo: ${out.description ?? res.status}`);
      return null;
    }
    return out.result?.message_id ?? null;
  } catch (err) {
    console.log(`! Telegram sendVideo: ${(err as Error).message}`);
    return null;
  }
}

/** Rewrites a message sent before; false when Telegram won't (too old, deleted, unchanged). */
export async function editMessage(access: TelegramAccess, messageId: number, text: string, opts: SendOptions = {}): Promise<boolean> {
  const body: Record<string, unknown> = { ...shape(access, text, opts), message_id: messageId };
  delete body.disable_notification;
  return !!(await call(access, "editMessageText", body));
}
