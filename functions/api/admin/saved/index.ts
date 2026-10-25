/**
 * The items saved from the public board for a post (src/lib/social-actions.ts saveFromSite; docs/admin.md "Saving
 * from the board"):
 *   GET  /api/admin/saved   every saved headline and video, newest first: { items }
 *   POST /api/admin/saved   saves one — {kind: headline|video, key, title, source, sourceId, link, picture?, section?,
 *                           time?, item?} — or refreshes the one saved before under its key: { item, created }
 * The board's pages call these while the admin is signed in (src/components/admin-session.ts): the same door
 * (_middleware.ts) stands in front, so a reader who isn't gets Access's sign-in page, never a saved list.
 */
import { actionContext, answer, readJson } from "../../../../src/lib/admin-api";
import { saveFromSite, savedItems } from "../../../../src/lib/social-actions";
import type { Handler } from "../_middleware";

export const onRequestGet: Handler = ({ env, data }) =>
  answer(async () => {
    const ctx = actionContext(env, `panel:${data.admin.email}`);
    return { items: await savedItems(ctx) };
  });

export const onRequestPost: Handler = ({ request, env, data }) =>
  answer(async () => {
    const ctx = actionContext(env, `panel:${data.admin.email}`);
    return saveFromSite(ctx, await readJson<Parameters<typeof saveFromSite>[1]>(request));
  });
