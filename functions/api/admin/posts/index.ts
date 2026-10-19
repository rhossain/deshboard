/**
 * POST /api/admin/posts — a post of one's own, approved, posted at its time:
 *   {message, link?, scheduledAt?}                  text and a link
 *   {card, content: news|video, message?, scheduledAt?}  one headline or video from the site
 */
import { actionContext, answer, readJson } from "../../../../src/lib/admin-api";
import { createFromItem, createManual, type NewItemPost, type NewManualPost } from "../../../../src/lib/social-actions";
import type { Handler } from "../_middleware";

export const onRequestPost: Handler = ({ request, env, data }) =>
  answer(async () => {
    const ctx = actionContext(env, `panel:${data.admin.email}`);
    const body = await readJson<NewManualPost & Partial<NewItemPost>>(request);
    return body.card ? createFromItem(ctx, body as NewItemPost) : createManual(ctx, body);
  });
