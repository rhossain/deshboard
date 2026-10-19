/** POST /api/admin/posts {message, link?, scheduledAt?} — a post of one's own, approved, posted at its time. */
import { actionContext, answer, readJson } from "../../../../src/lib/admin-api";
import { createManual, type NewManualPost } from "../../../../src/lib/social-actions";
import type { Handler } from "../_middleware";

export const onRequestPost: Handler = ({ request, env, data }) =>
  answer(async () => createManual(actionContext(env, `panel:${data.admin.email}`), await readJson<NewManualPost>(request)));
