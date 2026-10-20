/**
 * GET /api/admin/queue?platform=facebook|instagram&from=ISO&to=ISO — a platform's posts in that window (default:
 * Facebook's, from 12 hours ago to 36 hours ahead), with the settings, its slot table in effect, the blocks in force
 * and the last runs: everything the queue screen shows.
 */
import { actionContext, answer } from "../../../src/lib/admin-api";
import { instagramSlots } from "../../../src/lib/instagram-post";
import { queueLive } from "../../../src/lib/social-actions";
import { activeBlocks, lastRuns, listPosts, type Platform, readSettings } from "../../../src/lib/social-store";
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
    const platform: Platform = url.searchParams.get("platform") === "instagram" ? "instagram" : "facebook";
    const [posts, settings, blocks, runs, live] = await Promise.all([
      listPosts(db, { platform, from, to }),
      readSettings(db),
      activeBlocks(db),
      lastRuns(db, 5),
      queueLive(db, platform),
    ]);
    const resolved = queueSettings(settings);
    // The table in effect: the admin's, else the default (FB_SLOTS, the deploy's override, isn't set). Instagram's:
    // its own times, each headlines.
    const slots = platform === "instagram" ? instagramSlots(resolved.instagramTimes) : (resolved.slots ?? SLOTS);
    return { now: new Date(now).toISOString(), from, to, platform, live, settings: resolved, slots, pageSlots: resolved.slots ?? SLOTS, blocks, runs, posts };
  });
