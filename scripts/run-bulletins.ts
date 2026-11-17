/**
 * Video bulletins' queue (docs/bulletin.md), in two commands:
 *
 *   plan        every timed run (deploy.yml): drafts the table's bulletins an hour ahead (stories, a script for each
 *               from its article) and sends them for review; skips a draft nobody approved by its lock; and has each
 *               approved bulletin that is due made, by starting the Bulletins workflow for it.
 *   make <id>   the Bulletins workflow: the voice, the render, then the video to the admin's Telegram chat.
 *
 * BULLETINS: off (or unset: nothing happens), dry (everything but posting) or on: the video is put on the Page as a
 * Reel when it is made, scheduled for the bulletin's time (out at once when that is less than eleven minutes off), and
 * plan marks it posted once it is out. While posting is paused in the admin, on behaves as dry.
 *
 * Environment: CLOUDFLARE_ACCOUNT_ID and SOCIAL_DB_TOKEN (the admin's database), TELEGRAM_BOT_TOKEN and
 * TELEGRAM_ADMIN_CHAT_ID, ANTHROPIC_API_KEY (plan), ELEVENLABS_API_KEY (make), FB_PAGE_ID and FB_PAGE_TOKEN (on),
 * GITHUB_TOKEN and GITHUB_REPOSITORY
 * (plan starts the workflow; BULLETINS_REF, the branch its file is read from, is main unless set). Optional, as
 * scripts/make-bulletin.ts: BULLETIN_MODEL, ANTHROPIC_WORKSPACE_ID, BULLETIN_VOICE, BULLETIN_VOICE_ID,
 * BULLETIN_VOICE_MODEL, BULLETIN_JOBS, BULLETIN_DIR, SITE.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { BULLETIN_TIMES, bulletinCaption, bulletinSpec, type BulletinStory, bulletinsToDraft, clockBn, draftStory } from "../src/lib/bulletin";
import { pickBulletin } from "../src/lib/bulletin-pick";
import { bulletinStep, NEVER_FINISHED, REDRAFTS, stillWorthMaking } from "../src/lib/bulletin-queue";
import { SCRIPT_MODEL, writeScript } from "../src/lib/bulletin-script";
import { type Bulletin, bulletinForSlot, getBulletin, insertBulletin, listBulletins, updateBulletin } from "../src/lib/bulletin-store";
import { findVoice, speak, VOICE_MODEL, VOICE_NAME } from "../src/lib/elevenlabs";
import { graphFromEnv } from "../src/lib/facebook-graph";
import { publishVideo, videoLink, videoState } from "../src/lib/facebook-reels";
import { DATA_DIR, type PackedFeed, unpackFeed } from "../src/lib/packed";
import { pageStories } from "../src/lib/page-posts";
import { apiAccessFromEnv, type Db, fromApi } from "../src/lib/social-db";
import { queueSettings } from "../src/lib/social-settings";
import { readSettings, recordRun } from "../src/lib/social-store";
import { sendMessage, sendVideo, telegramFromEnv } from "../src/lib/telegram";
import { syncBulletinTelegram } from "../src/lib/telegram-bulletin";

const env = process.env;
const SITE = env.SITE?.trim() || env.SITE_URL?.trim() || "https://bartaboard.com";
const MODE = (env.BULLETINS ?? "").trim().toLowerCase();
const tg = telegramFromEnv(env);
const log: string[] = [];
const say = (line: string) => {
  console.log(line);
  log.push(line);
};

function database(): Db | null {
  const access = apiAccessFromEnv(env, existsSync("wrangler.toml") ? readFileSync("wrangler.toml", "utf8") : undefined);
  return access ? fromApi(access) : null;
}

/** The board's headlines: the file this run's fetch just wrote, else the live site's. */
async function feed() {
  const local = path.join("public", DATA_DIR, "news.json");
  if (existsSync(local)) return unpackFeed(JSON.parse(readFileSync(local, "utf8")) as PackedFeed);
  const res = await fetch(`${SITE}${DATA_DIR}/news.json`, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`the board's headlines answered ${res.status}`);
  return unpackFeed((await res.json()) as PackedFeed);
}

/** Starts the Bulletins workflow for one bulletin; why not, when it can't. */
async function startMaking(id: string): Promise<string | null> {
  const token = env.GITHUB_TOKEN?.trim();
  const repo = env.GITHUB_REPOSITORY?.trim();
  if (!token || !repo) return "GITHUB_TOKEN or GITHUB_REPOSITORY isn't set";
  const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/bulletins.yml/dispatches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
    body: JSON.stringify({ ref: env.BULLETINS_REF?.trim() || "main", inputs: { id } }),
    signal: AbortSignal.timeout(20_000),
  });
  return res.status === 204 ? null : `GitHub answered ${res.status} to starting the Bulletins workflow`;
}

async function plan(db: Db): Promise<void> {
  const now = Date.now();
  const settings = queueSettings(await readSettings(db));
  const times = settings.bulletinTimes ?? BULLETIN_TIMES;
  const review = { lockMinutes: settings.bulletinLockMinutes, trial: MODE !== "on", now };
  const recent = await listBulletins(db, { from: new Date(now - 20 * 3600_000).toISOString(), to: new Date(now + 26 * 3600_000).toISOString(), limit: 200 });

  // 1. Drafts for the table's bulletins that are an hour off.
  // (2. scripts for bulletins made by hand; 3. what is due.)
  for (const at of bulletinsToDraft(now, times, settings.bulletinLeadMinutes)) {
    const slot = new Date(at).toISOString();
    if (await bulletinForSlot(db, slot)) continue;
    if (recent.filter((b) => b.slot === slot && b.status === "rejected").length > REDRAFTS) continue;
    const board = await feed();
    // No story twice in a day, and none of a rejected draft's.
    const exclude = new Set(recent.flatMap((b) => b.stories.map((s) => s.key)));
    const { picks, alternatives } = pickBulletin(pageStories(board.results.flatMap((r) => r.items), now), { now, count: settings.bulletinStories, exclude });
    if (picks.length < 3) {
      say(`- ${clockBn(at)}: too few fresh stories for a bulletin (${picks.length}); the next run tries again`);
      continue;
    }
    const notes: string[] = [];
    let stories: BulletinStory[] = picks.map(draftStory);
    const key = env.ANTHROPIC_API_KEY?.trim();
    if (!key) notes.push("No script writer (ANTHROPIC_API_KEY): the scripts are the headlines.");
    else {
      const written: BulletinStory[] = [];
      for (const [i, story] of stories.entries()) {
        const r = await writeScript(story, { apiKey: key, model: env.BULLETIN_MODEL?.trim() || SCRIPT_MODEL, workspaceId: env.ANTHROPIC_WORKSPACE_ID?.trim() || undefined });
        written.push(r.story);
        if (!r.written) notes.push(`Story ${i + 1} is its headline only. ${r.warnings.join(" ")}`);
        else if (r.warnings.length) notes.push(`Story ${i + 1}: ${r.warnings.join(" ")}`);
      }
      stories = written;
    }
    const made = await insertBulletin(db, { kind: "slot", status: "draft", slot, scheduledAt: slot, stories, alternatives: alternatives.map(draftStory), note: notes.join(" ") || null, createdBy: "run" });
    if (!made) continue; // Another run drafted it meanwhile.
    await syncBulletinTelegram(db, made, tg, review);
    say(`- ${clockBn(at)}: drafted with ${stories.length} stories${notes.length ? ` (${notes.length} notes)` : ""}`);
  }

  // 2. Bulletins made by hand in the admin that asked for their scripts to be written.
  const span = { statuses: ["draft", "approved", "rendering"] as Bulletin["status"][], from: new Date(now - 24 * 3600_000).toISOString(), limit: 50 };
  for (const b of await listBulletins(db, span)) {
    if (b.kind !== "manual" || b.status !== "draft" || b.locked) continue;
    const notes: string[] = [];
    const key = env.ANTHROPIC_API_KEY?.trim();
    let stories = b.stories;
    if (!key) notes.push("No script writer (ANTHROPIC_API_KEY): the scripts are the headlines.");
    else {
      const written: BulletinStory[] = [];
      for (const [i, story] of stories.entries()) {
        const r = await writeScript(story, { apiKey: key, model: env.BULLETIN_MODEL?.trim() || SCRIPT_MODEL, workspaceId: env.ANTHROPIC_WORKSPACE_ID?.trim() || undefined });
        written.push(r.story);
        if (!r.written) notes.push(`Story ${i + 1} is its headline only. ${r.warnings.join(" ")}`);
        else if (r.warnings.length) notes.push(`Story ${i + 1}: ${r.warnings.join(" ")}`);
      }
      stories = written;
    }
    try {
      const ready = await updateBulletin(db, b.id, b.version, { stories, locked: true, note: notes.join(" ") || null }, "run", "bulletin.scripts");
      await syncBulletinTelegram(db, ready, tg, review);
      say(`- by hand, ${clockBn(Date.parse(b.scheduledAt))}: scripts written${notes.length ? ` (${notes.length} notes)` : ""}`);
    } catch (e) {
      say(`- ${b.id}: ${(e as Error).message}`);
    }
  }

  // 3. What is due among those waiting.
  const waiting = await listBulletins(db, span);
  for (const b of waiting) {
    const step = bulletinStep(b, settings.bulletinLockMinutes, now);
    if (step === "wait") continue;
    try {
      if (step === "skip") {
        const done = await updateBulletin(db, b.id, b.version, { status: "skipped", decidedBy: "auto", decidedAt: new Date(now).toISOString() }, "run", "bulletin.missed");
        await syncBulletinTelegram(db, done, tg, review);
        say(`- ${clockBn(Date.parse(b.scheduledAt))}: skipped, nobody approved it in time`);
      } else if (step === "stuck") {
        const done = await updateBulletin(db, b.id, b.version, { status: "failed", error: NEVER_FINISHED }, "run", "bulletin.stuck");
        await syncBulletinTelegram(db, done, tg, review);
        say(`- ${clockBn(Date.parse(b.scheduledAt))}: its making never finished; marked failed`);
      } else {
        // Marked first, so the next run doesn't start it again while this one's workflow is still queued.
        const rendering = await updateBulletin(db, b.id, b.version, { status: "rendering" }, "run", "bulletin.make");
        const why = await startMaking(b.id);
        if (why) {
          const failed = await updateBulletin(db, b.id, rendering.version, { status: "failed", error: why }, "run", "bulletin.make-failed");
          await syncBulletinTelegram(db, failed, tg, review);
          say(`- ${clockBn(Date.parse(b.scheduledAt))}: couldn't be made: ${why}`);
        } else {
          await syncBulletinTelegram(db, rendering, tg, review);
          say(`- ${clockBn(Date.parse(b.scheduledAt))}: approved and due; its video is being made`);
        }
      }
    } catch (e) {
      say(`- ${b.id}: ${(e as Error).message}`); // Changed by a person meanwhile: the next run looks again.
    }
  }
  // 4. Bulletins scheduled on Facebook whose time has come: out, or not.
  const fb = graphFromEnv(env);
  if (fb) {
    for (const b of await listBulletins(db, { statuses: ["ready"], from: new Date(now - 24 * 3600_000).toISOString(), limit: 20 })) {
      if (!b.fbPostId || now < Date.parse(b.scheduledAt)) continue;
      try {
        const state = await videoState(fb, b.fbPostId);
        if (state.state === "out") {
          const posted = await updateBulletin(db, b.id, b.version, { status: "posted", postedAt: new Date(now).toISOString(), permalink: await videoLink(fb, b.fbPostId) }, "run", "bulletin.posted");
          await syncBulletinTelegram(db, posted, tg, review);
          say(`- ${clockBn(Date.parse(b.scheduledAt))}: out on the Page`);
        } else if (state.state === "failed") {
          const failed = await updateBulletin(db, b.id, b.version, { status: "failed", error: `Facebook couldn't publish it: ${state.detail}` }, "run", "bulletin.failed");
          await syncBulletinTelegram(db, failed, tg, review);
          say(`- ${clockBn(Date.parse(b.scheduledAt))}: Facebook couldn't publish it: ${state.detail}`);
        } else if (now > Date.parse(b.scheduledAt) + 30 * 60_000) say(`- ${clockBn(Date.parse(b.scheduledAt))}: still not out on Facebook (${state.detail ?? "waiting"})`);
      } catch (e) {
        say(`- ${b.id}: ${(e as Error).message}`);
      }
    }
  }
  if (!log.length) say("- nothing due");
}

async function make(db: Db, id: string): Promise<number> {
  const settings = queueSettings(await readSettings(db));
  const review = { lockMinutes: settings.bulletinLockMinutes, trial: MODE !== "on" };
  let b: Bulletin | null = await getBulletin(db, id);
  if (!b) {
    say(`No bulletin ${id}.`);
    return 1;
  }
  // Given up on while this run was still waiting for a runner: taken up again.
  if (b.status === "failed" && b.error === NEVER_FINISHED) {
    b = await updateBulletin(db, id, b.version, { status: "rendering", error: null }, "run", "bulletin.resumed");
    say("- its run started late; taken up again");
  }
  if (b.status !== "rendering") {
    say(`Bulletin ${id} is ${b.status}, not waiting to be made.`);
    return 0;
  }
  const at = Date.parse(b.scheduledAt);
  if (!stillWorthMaking(b, Date.now())) {
    const late = Math.round((Date.now() - at) / 60_000);
    const skipped = await updateBulletin(db, id, b.version, { status: "skipped", decidedBy: "auto", decidedAt: new Date().toISOString(), note: `Not made: its run only started ${late} minutes after its time (GitHub kept it waiting).` }, "run", "bulletin.late");
    await syncBulletinTelegram(db, skipped, tg, review);
    if (tg) await sendMessage(tg, `⚠️ The ${clockBn(at)} bulletin was not made: GitHub only started its run ${late} minutes after its time. Nothing was posted. You can make one by hand in the admin.`);
    say(`- not made: the run started ${late} minutes after its time`);
    return 0;
  }
  const dir = path.resolve(env.BULLETIN_DIR?.trim() || ".bulletin");
  mkdirSync(dir, { recursive: true });
  const fail = async (why: string) => {
    say(`- failed: ${why}`);
    const current = (await getBulletin(db, id)) ?? b!;
    const failed = await updateBulletin(db, id, current.version, { status: "failed", error: why }, "run", "bulletin.failed").catch(() => current);
    await syncBulletinTelegram(db, failed, tg, review);
    return 1;
  };
  try {
    const stories: BulletinStory[] = b.stories.map((s) => ({ ...s }));
    const eleven = env.ELEVENLABS_API_KEY?.trim();
    if (!eleven) return await fail("ELEVENLABS_API_KEY isn't set, so there is no voice.");
    const name = env.BULLETIN_VOICE?.trim() || VOICE_NAME;
    const voiceId = env.BULLETIN_VOICE_ID?.trim() || (await findVoice(eleven, name));
    if (!voiceId) return await fail(`No voice named "${name}" among the ElevenLabs account's voices.`);
    let characters = 0;
    for (const [i, story] of stories.entries()) {
      const spoken = await speak(story.script, { apiKey: eleven, voiceId, model: env.BULLETIN_VOICE_MODEL?.trim() || VOICE_MODEL });
      story.audio = path.join(dir, `story${i + 1}.mp3`);
      writeFileSync(story.audio, spoken.audio);
      if (spoken.words.length) story.words = spoken.words;
      characters += story.script.length;
    }
    say(`- voice: ${stories.length} clips, about ${characters} characters`);

    const spec = path.join(dir, "spec.json");
    const video = path.join(dir, "bulletin.mp4");
    writeFileSync(spec, JSON.stringify(bulletinSpec(at, stories, { times: settings.bulletinTimes ?? BULLETIN_TIMES, outlets: Number(env.BULLETIN_OUTLETS) || undefined }), null, 2));
    const render = spawnSync("node", ["scripts/render-bulletin.mjs", spec, "--out", video, "--jobs", env.BULLETIN_JOBS?.trim() || "4"], { stdio: "inherit" });
    if (render.status !== 0) return await fail("The render failed (see the run's log).");
    const bytes = readFileSync(video);
    const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", video], { encoding: "utf8" });
    const duration = Math.round(Number(probe.stdout) * 10) / 10 || null;
    say(`- render: ${(bytes.length / 1e6).toFixed(1)} MB, ${duration ?? "?"} s`);

    const posting = MODE === "on" && !settings.paused;
    const fb = graphFromEnv(env);
    if (posting && !fb) return await fail("FB_PAGE_TOKEN or FB_PAGE_ID isn't set, so it can't be posted.");
    if (tg) {
      const what = posting ? "Being put on Facebook now." : `Preview: nothing was posted${MODE === "on" ? " (posting is paused)" : ""}.`;
      const sent = await sendVideo(tg, bytes, `বুলেটিন · ${clockBn(at)} · ${stories.length}টি খবর\n${what}`);
      if (!sent) await sendMessage(tg, "The bulletin's video was made but couldn't be sent here; it is the Bulletins run's artifact.");
    }
    b = (await getBulletin(db, id)) ?? b;
    if (!posting || !fb) {
      const done = await updateBulletin(db, id, b.version, { status: "dry", duration, error: null, ...(MODE === "on" ? { note: "Posting is paused." } : {}) }, "run", "bulletin.made", { duration, bytes: bytes.length });
      await syncBulletinTelegram(db, done, tg, review);
      return 0;
    }

    // On the Page: scheduled for its time when that is far enough off, otherwise out at once.
    const caption = b.caption.trim() || bulletinCaption(at, stories);
    const out = await publishVideo(fb, bytes, { description: caption, title: `বার্তাবোর্ড বুলেটিন · ${clockBn(at)}`, at, seconds: duration ?? 0, aiMade: true });
    say(`- Facebook: ${out.kind === "reel" ? "a Reel" : "a Page video (too long for a Reel)"}, ${out.scheduled ? `scheduled for ${new Date(at).toISOString()}` : "going out now"}`);
    let done = await updateBulletin(db, id, b.version, { status: "ready", duration, error: null, caption, fbPostId: out.videoId }, "run", "bulletin.scheduled", { video: out.videoId, kind: out.kind, scheduled: out.scheduled });
    if (!out.scheduled) {
      // Out now: Facebook takes a minute or two to process it. Past four, the next timed run looks again.
      for (let i = 0; i < 16; i++) {
        await new Promise((r) => setTimeout(r, 15_000));
        const state = await videoState(fb, out.videoId).catch(() => null);
        if (state?.state === "failed") return await fail(`Facebook couldn't publish it: ${state.detail}`);
        if (state?.state === "out") {
          done = await updateBulletin(db, id, done.version, { status: "posted", postedAt: new Date().toISOString(), permalink: await videoLink(fb, out.videoId) }, "run", "bulletin.posted");
          say("- Facebook: it is out");
          break;
        }
      }
    }
    await syncBulletinTelegram(db, done, tg, review);
    return 0;
  } catch (e) {
    return fail((e as Error).message);
  }
}

async function main(): Promise<number> {
  const [command, id] = process.argv.slice(2);
  if (MODE !== "dry" && MODE !== "on") {
    console.log("BULLETINS is off: nothing to do.");
    return 0;
  }
  const db = database();
  if (!db) {
    console.log("The admin's database isn't reachable from here (CLOUDFLARE_ACCOUNT_ID, SOCIAL_DB_TOKEN).");
    return 1;
  }
  let code = 0;
  if (command === "plan") await plan(db);
  else if (command === "make" && id) code = await make(db, id);
  else {
    console.log("usage: tsx scripts/run-bulletins.ts plan | make <id>");
    return 2;
  }
  await recordRun(db, `bulletins-${command}${MODE === "dry" ? "-dry" : ""}`, code === 0, log.join("\n")).catch(() => undefined);
  if (env.GITHUB_STEP_SUMMARY) writeFileSync(env.GITHUB_STEP_SUMMARY, `## Bulletins: ${command}\n${log.join("\n")}\n`, { flag: "a" });
  return code;
}

main()
  .catch((e) => {
    console.log(`Bulletins stopped: ${(e as Error).message}`);
    return 1;
  })
  .then((code) => process.exit(code));
