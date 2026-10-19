/**
 * POST /api/admin/bulk {action: approve|reject|skip|reopen, items: [{id, version}], reason?, scopes?} — the same
 * action on many posts; each succeeds or fails on its own.
 */
import { actionContext, answer, readJson } from "../../../src/lib/admin-api";
import { ActionError, approve, type BlockScope, reject, reopen, skip } from "../../../src/lib/social-actions";
import { syncTelegram } from "../../../src/lib/telegram-sync";
import type { Handler } from "./_middleware";

interface Body {
  action?: string;
  items?: { id: string; version: number }[];
  reason?: string;
  scopes?: BlockScope[];
}

export const onRequestPost: Handler = ({ request, env, data, waitUntil }) =>
  answer(async () => {
    const ctx = actionContext(env, `panel:${data.admin.email}`);
    const body = await readJson<Body>(request);
    const items = (body.items ?? []).slice(0, 100);
    const act = { approve, skip, reopen, reject: (c: typeof ctx, id: string, v: number) => reject(c, id, v, { reason: body.reason, scopes: body.scopes }) }[
      body.action as "approve"
    ];
    if (!act) throw new ActionError(400, "unknown action");
    const results = [];
    for (const it of items) {
      try {
        const post = await act(ctx, it.id, Number(it.version));
        waitUntil(syncTelegram(env as unknown as Record<string, unknown>, ctx.db, post));
        results.push({ id: it.id, ok: true, post });
      } catch (err) {
        results.push({ id: it.id, ok: false, error: (err as Error).message });
      }
    }
    return { results };
  });
