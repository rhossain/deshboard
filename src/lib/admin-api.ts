/**
 * Shared by the admin API's handlers (functions/api/admin/*): the context actions run in, JSON in and out, and
 * errors as answers. Kept here, not under functions/, where every file would be a route.
 */
import { graphFromEnv } from "./facebook-graph";
import { ActionError, type ActionContext } from "./social-actions";
import { type D1Like, fromBinding } from "./social-db";

export interface AdminBindings {
  SOCIAL_DB?: D1Like;
  FB_PAGE_TOKEN?: string;
  FB_PAGE_ID?: string;
  FB_APP_ID?: string;
  FB_APP_SECRET?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_ADMIN_CHAT_ID?: string;
  /** The Instagram account's id (optional: asked of the Page when unset). */
  IG_USER_ID?: string;
}

export function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export function actionContext(env: AdminBindings, actor: string): ActionContext {
  if (!env.SOCIAL_DB) throw new ActionError(503, "the admin's database isn't bound (SOCIAL_DB)");
  return { db: fromBinding(env.SOCIAL_DB), actor, fb: graphFromEnv(env as Record<string, string | undefined>), igUserId: env.IG_USER_ID?.trim() || undefined };
}

/** The handler's answer, or its ActionError as one (with the post as it now is, for a 409). */
export async function answer(fn: () => Promise<unknown>): Promise<Response> {
  try {
    return reply(await fn());
  } catch (err) {
    if (err instanceof ActionError) return reply({ error: err.message, post: err.post ?? undefined }, err.status);
    console.log(`admin API: ${(err as Error).stack ?? err}`);
    return reply({ error: `server error: ${(err as Error).message}` }, 500);
  }
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new ActionError(400, "the request body isn't JSON");
  }
}

export function version(body: { version?: unknown }): number {
  const v = Number(body.version);
  if (!Number.isInteger(v) || v < 1) throw new ActionError(400, "which version of the post this is about (version) is missing");
  return v;
}
