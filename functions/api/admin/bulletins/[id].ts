/**
 * GET   /api/admin/bulletins/:id   the bulletin and what happened to it (the audit log)
 * PATCH /api/admin/bulletins/:id   { version, stories?, caption?, note?, at? }: an edit. The run no longer replaces
 *                                  it; an approved bulletin whose stories change goes back to draft.
 */
import { actionContext, answer, readJson, version } from "../../../../src/lib/admin-api";
import { guard, storiesOf, syncBulletin } from "../../../../src/lib/bulletin-admin";
import { editBulletin, getBulletin } from "../../../../src/lib/bulletin-store";
import { ActionError } from "../../../../src/lib/social-actions";
import { queueSettings } from "../../../../src/lib/social-settings";
import { auditLog, readSettings } from "../../../../src/lib/social-store";
import type { Handler } from "../_middleware";

export const onRequestGet: Handler = ({ params, env, data }) =>
  answer(async () => {
    const { db } = actionContext(env, `panel:${data.admin.email}`);
    const bulletin = await getBulletin(db, String(params.id));
    if (!bulletin) throw new ActionError(404, "no such bulletin");
    return { bulletin, audit: await auditLog(db, { postId: bulletin.id, limit: 50 }) };
  });

export const onRequestPatch: Handler = ({ request, params, env, data, waitUntil }) =>
  answer(async () => {
    const body = await readJson<{ version?: number; stories?: unknown; caption?: string; note?: string | null; at?: string }>(request);
    const { db, actor } = actionContext(env, `panel:${data.admin.email}`);
    const lock = queueSettings(await readSettings(db)).bulletinLockMinutes;
    const bulletin = await guard(() =>
      editBulletin(
        db,
        String(params.id),
        version(body),
        {
          stories: body.stories === undefined ? undefined : storiesOf(body.stories),
          caption: typeof body.caption === "string" ? body.caption.slice(0, 2000) : undefined,
          note: body.note === undefined ? undefined : body.note === null ? null : String(body.note).slice(0, 500),
          at: body.at,
        },
        actor,
        lock,
      ),
    );
    waitUntil(syncBulletin(env as unknown as Record<string, unknown>, db, bulletin));
    return bulletin;
  });
