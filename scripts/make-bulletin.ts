/**
 * Makes one video bulletin from the live board, start to finish, and sends it to the admin's Telegram chat: nothing
 * is saved to the queue and nothing is posted. The ops workflow's `bulletin-try` task runs it, to try the whole
 * chain with the real services (docs/bulletin.md):
 *
 *   pick stories → a script for each from its article (Claude) → the voice (ElevenLabs) → render → Telegram
 *
 * Each step that can't be done says why and the rest carries on: no script writer, and the stories keep their
 * headline drafts; no voice, and the bulletin is silent with estimated captions.
 *
 * Environment: ANTHROPIC_API_KEY, ELEVENLABS_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_ADMIN_CHAT_ID. Optional:
 * BULLETIN_STORIES (3 to 6), BULLETIN_MODEL, ANTHROPIC_WORKSPACE_ID, BULLETIN_VOICE (a name) or BULLETIN_VOICE_ID,
 * BULLETIN_VOICE_MODEL, SITE, BULLETIN_FEED (a saved news.json to read in place of the site's), BULLETIN_DIR (where the
 * files go; .bulletin), BULLETIN_JOBS (Chrome pages drawing at once; 4), REPORT (a file the summary is added to).
 */
import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { BULLETIN_STORIES, bulletinSpec, type BulletinStory, clockBn, dateLineBn, draftStory } from "../src/lib/bulletin";
import { pickBulletin } from "../src/lib/bulletin-pick";
import { SCRIPT_MODEL, writeScript } from "../src/lib/bulletin-script";
import { findVoice, speak, VOICE_MODEL, VOICE_NAME } from "../src/lib/elevenlabs";
import { DATA_DIR, type PackedFeed, unpackFeed } from "../src/lib/packed";
import { pageStories } from "../src/lib/page-posts";
import { sendMessage, sendVideo, telegramFromEnv } from "../src/lib/telegram";

const env = process.env;
const SITE = env.SITE?.trim() || "https://bartaboard.com";
const DIR = path.resolve(env.BULLETIN_DIR?.trim() || ".bulletin");

const lines: string[] = [];
function say(line: string) {
  console.log(line);
  lines.push(line);
}

async function main(): Promise<number> {
  const now = Date.now();
  mkdirSync(DIR, { recursive: true });
  const wanted = Number(env.BULLETIN_STORIES);
  const count = Number.isInteger(wanted) && wanted >= 3 && wanted <= 6 ? wanted : BULLETIN_STORIES;

  // The board, as readers have it now.
  let packed: PackedFeed;
  if (env.BULLETIN_FEED) packed = JSON.parse(readFileSync(env.BULLETIN_FEED, "utf8")) as PackedFeed;
  else {
    const res = await fetch(`${SITE}${DATA_DIR}/news.json`, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) {
      say(`The board's headlines couldn't be read (${res.status}).`);
      return 1;
    }
    packed = (await res.json()) as PackedFeed;
  }
  const feed = unpackFeed(packed);
  const items = feed.results.flatMap((r) => r.items);
  const { picks } = pickBulletin(pageStories(items, now), { now, count });
  say(`## Bulletin try, ${clockBn(now)}, ${dateLineBn(now)}`);
  say(`- ${items.length} headlines from ${feed.results.length} outlets; ${picks.length} of ${count} stories picked`);
  if (picks.length < 3) {
    say("Too few fresh stories with three outlets or more for a bulletin right now.");
    return 1;
  }
  let stories: BulletinStory[] = picks.map(draftStory);

  // Scripts.
  const claude = env.ANTHROPIC_API_KEY?.trim();
  if (!claude) say("- Scripts: ANTHROPIC_API_KEY isn't set, so the stories keep their headline drafts.");
  else {
    const model = env.BULLETIN_MODEL?.trim() || SCRIPT_MODEL;
    let written = 0;
    const next: BulletinStory[] = [];
    for (const [i, story] of stories.entries()) {
      const r = await writeScript(story, { apiKey: claude, model, workspaceId: env.ANTHROPIC_WORKSPACE_ID?.trim() || undefined });
      next.push(r.story);
      if (r.written) written++;
      else say(`- Story ${i + 1} kept its headline draft. ${r.warnings.join(" ")}`);
    }
    stories = next;
    say(`- Scripts: ${written} of ${stories.length} written by ${model}`);
  }

  // The voice.
  const eleven = env.ELEVENLABS_API_KEY?.trim();
  if (!eleven) say("- Voice: ELEVENLABS_API_KEY isn't set, so the bulletin is silent.");
  else {
    try {
      const name = env.BULLETIN_VOICE?.trim() || VOICE_NAME;
      const voiceId = env.BULLETIN_VOICE_ID?.trim() || (await findVoice(eleven, name));
      if (!voiceId) say(`- Voice: no voice named "${name}" among the account's voices (add it to My Voices in ElevenLabs), so the bulletin is silent.`);
      else {
        const model = env.BULLETIN_VOICE_MODEL?.trim() || VOICE_MODEL;
        let credits = 0;
        let timed = 0;
        for (const [i, story] of stories.entries()) {
          const spoken = await speak(story.script, { apiKey: eleven, voiceId, model });
          const file = path.join(DIR, `story${i + 1}.mp3`);
          writeFileSync(file, spoken.audio);
          story.audio = file;
          if (spoken.words.length) {
            story.words = spoken.words;
            timed++;
          }
          credits += story.script.length;
        }
        say(`- Voice: ${stories.length} clips by ${model}, about ${credits} characters; word times for ${timed}`);
      }
    } catch (e) {
      for (const story of stories) {
        delete story.audio;
        delete story.words;
      }
      say(`- Voice: ${(e as Error).message}. The bulletin is silent.`);
    }
  }

  // The video.
  const spec = path.join(DIR, "spec.json");
  const video = path.join(DIR, "bulletin.mp4");
  writeFileSync(spec, JSON.stringify(bulletinSpec(now, stories, { outlets: feed.results.length }), null, 2));
  const started = Date.now();
  const render = spawnSync("node", ["scripts/render-bulletin.mjs", spec, "--out", video, "--jobs", env.BULLETIN_JOBS?.trim() || "4"], { stdio: "inherit" });
  if (render.status !== 0) {
    say("- Render: failed (see the run's log).");
    return 1;
  }
  const bytes = readFileSync(video);
  say(`- Render: ${(bytes.length / 1e6).toFixed(1)} MB in ${Math.round((Date.now() - started) / 1000)} s`);

  // To the admin.
  const telegram = telegramFromEnv(env);
  if (!telegram) say("- Telegram: not set up here; the video is this run's artifact.");
  else {
    const sent = await sendVideo(telegram, bytes, `বুলেটিন (পরীক্ষা) · ${clockBn(now)} · ${stories.length}টি খবর\nNothing was posted.`);
    say(sent ? "- Telegram: the video was sent to the admin's chat" : "- Telegram: the video couldn't be sent; it is this run's artifact");
    const scripts = stories.map((s, i) => `${i + 1}. ${s.script}\n— ${s.source}${s.more ? ` +${s.more}` : ""} · ${s.visual.type}`).join("\n\n");
    await sendMessage(telegram, `Scripts of the test bulletin\n\n${scripts}\n\n${lines.filter((l) => l.startsWith("- ")).join("\n")}`);
  }
  return 0;
}

main()
  .catch((e) => {
    say(`The bulletin try stopped: ${(e as Error).message}`);
    return 1;
  })
  .then((code) => {
    if (env.REPORT) appendFileSync(env.REPORT, `${lines.join("\n")}\n`);
    process.exit(code);
  });
