/**
 * POST /api/admin/posts/:id/:action {version, ...} — approve, reject {reason?, scopes?, hours?}, skip, reopen,
 * post-now, take-down (src/lib/social-actions.ts). The post's Telegram message is rewritten to match.
 */
import { actionContext, answer, readJson, version } from "../../../../../src/lib/admin-api";
import {
  type ActionContext,
  ActionError,
  approve,
  type BlockScope,
  postNow,
  reject,
  reopen,
  skip,
  takeDown,
} from "../../../../../src/lib/social-actions";
import { syncTelegram } from "../../../../../src/lib/telegram-sync";
import type { Handler } from "../../_middleware";

interface Body {
  version?: number;
  reason?: string;
  scopes?: BlockScope[];
  hours?: number;
}

function act(ctx: ActionContext, action: string, id: string, body: Body) {
  const v = version(body);
  switch (action) {
    case "approve":
      return approve(ctx, id, v);
    case "reject":
      return reject(ctx, id, v, { reason: body.reason?.slice(0, 300), scopes: body.scopes, hours: body.hours });
    case "skip":
      return skip(ctx, id, v);
    case "reopen":
      return reopen(ctx, id, v);
    case "post-now":
      return postNow(ctx, id, v);
    case "take-down":
      return takeDown(ctx, id, v);
    default:
      throw new ActionError(404, "no such action");
  }
}

export const onRequestPost: Handler = ({ request, params, env, data, waitUntil }) =>
  answer(async () => {
    const ctx = actionContext(env, `panel:${data.admin.email}`);
    const post = await act(ctx, String(params.action), String(params.id), await readJson<Body>(request));
    waitUntil(syncTelegram(env as unknown as Record<string, unknown>, ctx.db, post));
    return post;
  });
