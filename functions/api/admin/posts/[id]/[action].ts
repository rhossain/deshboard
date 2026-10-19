/**
 * POST /api/admin/posts/:id/:action {version, ...} — approve, reject {reason?, scopes?, hours?}, skip, reopen,
 * post-now, take-down (src/lib/social-actions.ts).
 */
import { actionContext, answer, readJson, version } from "../../../../../src/lib/admin-api";
import { ActionError, approve, type BlockScope, postNow, reject, reopen, skip, takeDown } from "../../../../../src/lib/social-actions";
import type { Handler } from "../../_middleware";

interface Body {
  version?: number;
  reason?: string;
  scopes?: BlockScope[];
  hours?: number;
}

export const onRequestPost: Handler = ({ request, params, env, data }) =>
  answer(async () => {
    const ctx = actionContext(env, `panel:${data.admin.email}`);
    const id = String(params.id);
    const body = await readJson<Body>(request);
    const v = version(body);
    switch (String(params.action)) {
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
  });
