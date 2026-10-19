/** GET /api/admin/history?days=7 — what went out (and was skipped, rejected or failed), newest first. */
import { actionContext, answer } from "../../../src/lib/admin-api";
import { listPosts } from "../../../src/lib/social-store";
import type { Handler } from "./_middleware";

export const onRequestGet: Handler = ({ request, env, data }) =>
  answer(async () => {
    const { db } = actionContext(env, `panel:${data.admin.email}`);
    const days = Math.min(Math.max(Number(new URL(request.url).searchParams.get("days")) || 7, 1), 60);
    const posts = await listPosts(db, {
      from: new Date(Date.now() - days * 86_400_000).toISOString(),
      to: new Date().toISOString(),
      statuses: ["posted", "skipped", "rejected", "failed", "dry"],
      desc: true,
      limit: 1000,
    });
    return { days, posts };
  });
