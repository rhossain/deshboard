/**
 * POST /api/admin/posts — a post of one's own, approved, posted at its time:
 *   {message, link?, scheduledAt?}                  text and a link (Facebook)
 *   {card, content: news|video, message?, scheduledAt?, platform?}  one headline or video from the site (Instagram:
 *                                                   a headline, drawn on its card by the next run)
 *   {cards: [...], content: headlines|roundup, ...} several, as a carousel (2 to 10; Instagram: 2 to 9 headlines)
 */
import { actionContext, answer, readJson } from "../../../../src/lib/admin-api";
import { createFromItem, createManual, type NewItemPost, type NewManualPost } from "../../../../src/lib/social-actions";
import type { Handler } from "../_middleware";

export const onRequestPost: Handler = ({ request, env, data }) =>
  answer(async () => {
    const ctx = actionContext(env, `panel:${data.admin.email}`);
    const body = await readJson<NewManualPost & Partial<NewItemPost>>(request);
    return body.card || body.cards ? createFromItem(ctx, body as NewItemPost) : createManual(ctx, body);
  });
