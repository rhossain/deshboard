/** DELETE /api/admin/blocks/:id — lifts a block. */
import { actionContext, answer } from "../../../../src/lib/admin-api";
import { removeBlock } from "../../../../src/lib/social-store";
import type { Handler } from "../_middleware";

export const onRequestDelete: Handler = ({ params, env, data }) =>
  answer(async () => {
    const { db, actor } = actionContext(env, `panel:${data.admin.email}`);
    await removeBlock(db, Number(params.id), actor);
    return { ok: true };
  });
