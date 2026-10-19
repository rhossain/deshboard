/** GET /api/admin/blocks — what the picker leaves out now (rejected stories, outlets, sections, words). */
import { actionContext, answer } from "../../../src/lib/admin-api";
import { activeBlocks } from "../../../src/lib/social-store";
import type { Handler } from "./_middleware";

export const onRequestGet: Handler = ({ env, data }) => answer(async () => ({ blocks: await activeBlocks(actionContext(env, `panel:${data.admin.email}`).db) }));
