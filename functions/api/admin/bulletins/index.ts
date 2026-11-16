/**
 * Video bulletins in the admin (docs/bulletin.md):
 *   GET  /api/admin/bulletins   the last day's and the coming two days': { now, live, settings, bulletins }
 *   POST /api/admin/bulletins   one made by hand — { stories, at?, caption?, write? } — for `at` (ISO), or, without
 *                               it, for as soon as it is approved. write: the run writes its scripts from the
 *                               articles first (within a quarter of an hour); otherwise the scripts sent are the ones.
 */
import { actionContext, answer, readJson } from "../../../../src/lib/admin-api";
import { bulletinsLive, guard, storiesOf, syncBulletin } from "../../../../src/lib/bulletin-admin";
import { createBulletin, listBulletins } from "../../../../src/lib/bulletin-store";
import { queueSettings } from "../../../../src/lib/social-settings";
import { readSettings } from "../../../../src/lib/social-store";
import type { Handler } from "../_middleware";

export const onRequestGet: Handler = ({ env, data }) =>
  answer(async () => {
    const { db } = actionContext(env, `panel:${data.admin.email}`);
    const now = Date.now();
    const bulletins = await listBulletins(db, { from: new Date(now - 30 * 3600_000).toISOString(), to: new Date(now + 48 * 3600_000).toISOString(), limit: 80 });
    return { now: new Date(now).toISOString(), live: await bulletinsLive(db), settings: queueSettings(await readSettings(db)), bulletins };
  });

export const onRequestPost: Handler = ({ request, env, data, waitUntil }) =>
  answer(async () => {
    const body = await readJson<{ stories?: unknown; at?: string; caption?: string; write?: boolean }>(request);
    const { db, actor } = actionContext(env, `panel:${data.admin.email}`);
    const bulletin = await guard(() =>
      createBulletin(db, { stories: storiesOf(body.stories), at: body.at, caption: typeof body.caption === "string" ? body.caption.slice(0, 2000) : undefined, write: body.write === true }, actor),
    );
    // One waiting for its scripts is announced by the run that writes them.
    if (bulletin.locked) waitUntil(syncBulletin(env as unknown as Record<string, unknown>, db, bulletin));
    return bulletin;
  });
