/**
 * POST /api/admin/bulletins/:id/:action { version }: approve, reject, skip or reopen (src/lib/bulletin-store.ts).
 * The bulletin's Telegram message is rewritten to match.
 */
import { actionContext, answer, readJson, version } from "../../../../../src/lib/admin-api";
import { guard, syncBulletin } from "../../../../../src/lib/bulletin-admin";
import { approveBulletin, rejectBulletin, reopenBulletin, skipBulletin } from "../../../../../src/lib/bulletin-store";
import { ActionError } from "../../../../../src/lib/social-actions";
import type { Handler } from "../../_middleware";

export const onRequestPost: Handler = ({ request, params, env, data, waitUntil }) =>
  answer(async () => {
    const body = await readJson<{ version?: number; reason?: string }>(request);
    const { db, actor } = actionContext(env, `panel:${data.admin.email}`);
    const id = String(params.id);
    const v = version(body);
    const bulletin = await guard(() => {
      switch (String(params.action)) {
        case "approve":
          return approveBulletin(db, id, v, actor);
        case "reject":
          return rejectBulletin(db, id, v, actor, body.reason?.slice(0, 300));
        case "skip":
          return skipBulletin(db, id, v, actor);
        case "reopen":
          return reopenBulletin(db, id, v, actor);
        default:
          throw new ActionError(404, "no such action");
      }
    });
    waitUntil(syncBulletin(env as unknown as Record<string, unknown>, db, bulletin));
    return bulletin;
  });
