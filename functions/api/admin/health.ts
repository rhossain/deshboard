/** GET /api/admin/health — the last runs, whether the queue posts for real, Facebook's token, Telegram's setup. */
import { actionContext, answer } from "../../../src/lib/admin-api";
import { tokenHealth } from "../../../src/lib/facebook-graph";
import { queueLive } from "../../../src/lib/social-actions";
import { lastRuns } from "../../../src/lib/social-store";
import type { Handler } from "./_middleware";

export const onRequestGet: Handler = ({ env, data }) =>
  answer(async () => {
    const { db, fb } = actionContext(env, `panel:${data.admin.email}`);
    const [runs, live, facebook] = await Promise.all([lastRuns(db, 20), queueLive(db), fb ? tokenHealth(fb) : Promise.resolve({ ok: false, error: "not set up" })]);
    const last = runs[0] ? Date.parse(runs[0].at) : 0;
    return {
      now: new Date().toISOString(),
      live,
      lastRunMinutesAgo: last ? Math.round((Date.now() - last) / 60_000) : null,
      runs,
      facebook,
      telegram: !!(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_ADMIN_CHAT_ID),
    };
  });
