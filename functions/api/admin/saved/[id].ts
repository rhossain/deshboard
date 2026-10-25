/** DELETE /api/admin/saved/:id — takes an item off the saved list (it stays in any post it went into). */
import { actionContext, answer } from "../../../../src/lib/admin-api";
import { unsave } from "../../../../src/lib/social-actions";
import type { Handler } from "../_middleware";

export const onRequestDelete: Handler = ({ params, env, data }) =>
  answer(async () => {
    await unsave(actionContext(env, `panel:${data.admin.email}`), String(params.id));
    return { ok: true };
  });
