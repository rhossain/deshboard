/**
 * GET /api/admin/posts/:id — the post and what happened to it (the audit log).
 * PATCH /api/admin/posts/:id {version, message?, scheduledAt?, order?, policy?} — an edit; the post is then locked.
 */
import { actionContext, answer, readJson, version } from "../../../../src/lib/admin-api";
import { ActionError, edit, type Edit } from "../../../../src/lib/social-actions";
import { auditLog, getPost } from "../../../../src/lib/social-store";
import type { Handler } from "../_middleware";

export const onRequestGet: Handler = ({ params, env, data }) =>
  answer(async () => {
    const { db } = actionContext(env, `panel:${data.admin.email}`);
    const post = await getPost(db, String(params.id));
    if (!post) throw new ActionError(404, "no such post");
    return { post, audit: await auditLog(db, { postId: post.id, limit: 50 }) };
  });

export const onRequestPatch: Handler = ({ request, params, env, data }) =>
  answer(async () => {
    const body = await readJson<Edit & { version?: number }>(request);
    return edit(actionContext(env, `panel:${data.admin.email}`), String(params.id), version(body), body);
  });
