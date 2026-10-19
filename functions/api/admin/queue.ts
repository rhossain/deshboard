/**
 * GET /api/admin/queue?from=ISO&to=ISO — the posts in that window (default: from 12 hours ago to 36 hours ahead),
 * with the settings, the slot table in effect, the blocks in force and the last runs: everything the queue screen shows.
 */
import { actionContext, answer } from "../../../src/lib/admin-api";
import { queueLive } from "../../../src/lib/social-actions";
import { activeBlocks, lastRuns, listPosts, readSettings } from "../../../src/lib/social-store";
import { queueSettings } from "../../../src/lib/social-settings";
import { SLOTS } from "../../../src/lib/slot-table";
import type { Handler } from "./_middleware";

export const onRequestGet: Handler = ({ request, env, data }) =>
  answer(async () => {
    const { db } = actionContext(env, `panel:${data.admin.email}`);
    const url = new URL(request.url);
    const now = Date.now();
    const from = url.searchParams.get("from") ?? new Date(now - 12 * 3600_000).toISOString();
    const to = url.searchParams.get("to") ?? new Date(now + 36 * 3600_000).toISOString();
    const [posts, settings, blocks, runs, live] = await Promise.all([
      listPosts(db, { from, to }),
      readSettings(db),
      activeBlocks(db),
      lastRuns(db, 5),
      queueLive(db),
    ]);
    const resolved = queueSettings(settings);
    // The table in effect: the admin's, else the default (FB_SLOTS, the deploy's override, isn't set).
    return { now: new Date(now).toISOString(), from, to, live, settings: resolved, slots: resolved.slots ?? SLOTS, blocks, runs, posts };
  });
