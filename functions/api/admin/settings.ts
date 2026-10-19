/** GET/PUT /api/admin/settings — the queue's settings (src/lib/social-settings.ts); PUT takes the ones to change. */
import { actionContext, answer, readJson } from "../../../src/lib/admin-api";
import { readSettings, writeSetting } from "../../../src/lib/social-store";
import { type QueueSettings, queueSettings } from "../../../src/lib/social-settings";
import type { Handler } from "./_middleware";

export const onRequestGet: Handler = ({ env, data }) =>
  answer(async () => queueSettings(await readSettings(actionContext(env, `panel:${data.admin.email}`).db)));

export const onRequestPut: Handler = ({ request, env, data }) =>
  answer(async () => {
    const { db, actor } = actionContext(env, `panel:${data.admin.email}`);
    const asked = await readJson<Partial<QueueSettings>>(request);
    const before = queueSettings(await readSettings(db));
    const after = queueSettings({ ...before, ...asked });
    for (const key of Object.keys(after) as (keyof QueueSettings)[]) {
      if (key in asked && JSON.stringify(after[key]) !== JSON.stringify(before[key])) await writeSetting(db, key, after[key], actor);
    }
    return after;
  });
