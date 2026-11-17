# Video bulletins

A bulletin is a 60–90 second vertical video (1080×1920) of four to six stories from the board: an opener, the list of headlines, one segment per story with its own graphic, an AI Bangla voice with word-by-word captions, and a closer. It has no presenter; the voice is labelled "AI কণ্ঠ" on screen. The plan and the decisions behind it are in the project doc `video-bulletin-plan.md`.

Status: the **renderer**, the bulletins **table** and **store**, the **settings**, the **picker**, the **script writer**, the **voice** call and a **try run** that chains them and sends the video to Telegram and the **queue** (drafts an hour ahead, review on Telegram, the video made at the lock and sent as a preview) are built (this page). The admin's **Bulletins tab** and **posting to the Page** (as a scheduled Reel, with `BULLETINS` on) are built too. Posting has only been checked against a stand-in Graph API: the first real post is the first bulletin approved with `BULLETINS` on.

## When bulletins go out

- **The table:** three a day, 10:00, 16:00 and 21:00 Dhaka (`bulletinTimes` in the admin's settings replaces them).
- **By hand:** a bulletin can also be made for any time, outside the table (`kind` manual). It takes no slot, so it never collides with the table's, and it is reviewed, rendered and posted the same way.
- **Timeline:** the draft is made 60 minutes before its time (`bulletinLeadMinutes`); edits close 30 minutes before (`bulletinLockMinutes`, always at least ten minutes less than the lead), because the voice, the render and the preview need that long.
- **Stories:** five a bulletin (`bulletinStories`, 3 to 6); the renderer takes up to six.

These settings sit beside the Page's own lead (40 minutes) and lock (5 minutes), which they leave alone.

## The table and the rules

- `migrations/0005_bulletin.sql`: the `bulletins` table, one row a bulletin: draft → approved → rendering → ready → posting → posted, or rejected, skipped, failed, dry. One live bulletin per time of the table; none of that for ones made by hand. Apply with the ops workflow's `d1-migrate`.
- `src/lib/bulletin.ts`: the times (`bulletinSlots`, `bulletinsToDraft`, `bulletinLockAt`), Bangla labels (`clockBn`, `dateLineBn`, `nextLineBn`), each section's colour, a story as the picker drafts it (`draftStory`: the headline as the script and the outlets carrying it as the graphic, both true without reading the article), what stops a bulletin (`bulletinProblems`) and the renderer's spec (`bulletinSpec`).
- `src/lib/bulletin-store.ts`: the rows and what a person does to one: `createBulletin` (by hand, for now or any time ahead), `editBulletin` (stories, scripts, caption, time; closed at the lock for the table's, open for one made by hand; an approved one whose script changes goes back to draft), `approveBulletin`, `rejectBulletin`, `skipBulletin`, `reopenBulletin`. Every change is made against the version read and written to the audit log.
- `npm run test:bulletin`: 41 checks of all of this, on the real schema.

## Scripts and voice

- `src/lib/bulletin-script.ts`: `writeScript` reads the story's article and asks Claude (the Claude API, `ANTHROPIC_API_KEY`; model `claude-sonnet-5-5` unless told otherwise) for the script, the short line and the graphic, from the article alone. The reply must be the JSON asked for, lengths are capped, and every figure in the script and the graphic must be in the article or the headline ("১ হাজার ১৪৬" and "১,১৪৬" count as the same number, and so do "দুটি" and "২টি"). A script that runs past 34 words is sent back once to be cut to 28; if the cut is no shorter or brings in a figure the article lacks, the long one stays and the report says so. When the credited article can't be read (a page that needs a browser, a site that turns scripts away), the script is written from the first of up to four other outlets' reports that can, and that outlet is credited instead; a page drawn by a script is read from its structured data when it has any. Anything else wrong, and the story keeps its headline draft and says why. A person approves every script before it is voiced.
- `src/lib/elevenlabs.ts`: `findVoice` and `speak` (ElevenLabs, `ELEVENLABS_API_KEY`; voice "Subhajit", model `eleven_v4`): the clip and each word's time, which the renderer takes as a story's `words`.

Neither can be run from the laptop: the keys live in GitHub's secrets, so real runs are in Actions.

## The queue

`BULLETINS` (a repository variable): `dry` (everything but posting) or `on` (posted to the Page); unset or `off`, nothing happens. While posting is paused in the admin, `on` behaves as `dry`.

1. **Plan** (`scripts/run-bulletins.ts plan`, the deploy's "Video bulletins" step, every 15 minutes):
   - drafts each of the table's bulletins an hour ahead: stories no other bulletin of the day has had, a script for each from its article, saved as a draft and sent to Telegram for review;
   - skips a draft nobody approved by its lock, and marks a making that never finished as failed;
   - for each approved bulletin that is due (at its lock; one made by hand for now, at once), marks it `rendering` and starts the **Bulletins** workflow with its id.
2. **Review** (Telegram, `src/lib/telegram-bulletin.ts`): the message lists the scripts with ✅ Approve, ❌ Reject (the next run drafts another, with other stories; twice at most) and ⏭ Skip, and is rewritten as the bulletin moves on. The webhook (`functions/api/telegram.ts`) tells a bulletin's buttons by their `b-` prefix.
3. **Make** (`scripts/run-bulletins.ts make <id>`, `.github/workflows/bulletins.yml`): the voice, the render, the video to Telegram as a preview. In a trial the bulletin ends `dry`. Anything that fails marks it `failed` with the reason, on Telegram too. The files are the run's artifact for three days.
4. **Post** (`on`; `src/lib/facebook-reels.ts`): the same run puts the video on the Page as a **Reel**, labelled as made with AI, with the bulletin's headlines as its text (`bulletinCaption`). Made at the lock, it is **scheduled** for the bulletin's time, about twenty minutes off (`ready`); less than eleven minutes off (one made by hand for now), it goes out at once. Until its time it can be stopped — 🛑 on Telegram, "Stop it" in the admin — which takes the scheduled video off Facebook and skips the bulletin. The plan run after its time asks Facebook whether it is out and marks it `posted`, with its address, or `failed`.

A Reel is 3 to 90 seconds; a bulletin longer than 89 goes up as an ordinary Page video instead (not tried against Facebook yet). The renderer's output is what Reels ask for: H.264, 30 fps, a key frame every three seconds, AAC at 48 kHz stereo. The token needs `pages_manage_posts`, `pages_read_engagement` and `pages_show_list`, as the Page's other posts do.

`src/lib/bulletin-queue.ts` holds the rule for what a run does with a bulletin at a given moment (`bulletinStep`).

**When GitHub is slow.** On 16 November 2026 GitHub kept the 21:00 bulletin's run (and the deploy after it) waiting about fifty minutes for a runner; the plan had given the bulletin up as lost after 25, so when the run started there was nothing for it to make, and nothing was posted. Since then a making is only given up after 90 minutes; a run that starts late takes its bulletin up again even if it was given up; one of the table's is still made and sent out (at once, late) up to 45 minutes after its time, and past that it is skipped with a message on Telegram saying why. One made by hand has no hour to miss and is always made.

To switch it on: push `static-export`; copy `deploy.yml`, `ops.yml` and `bulletins.yml` to `main` (the timer starts the deploy there, and the deploy starts Bulletins there); run the ops task `d1-migrate` (migration 0005); set the variable `BULLETINS` to `dry`.

## In the admin

The **Bulletins** tab (`src/components/admin/BulletinsView.tsx`, `/admin/#bulletins`) lists the last day's bulletins and the coming two days'.

- **A draft**: every story's script, its line in the headline list and its graphic's text can be changed; stories can be reordered or removed. Save, then Approve (or Reject, Skip). An approved bulletin whose stories change goes back to draft. Scheduled ones close at the lock; the card says when.
- **New bulletin**: the board's most covered fresh stories, picked in the browser as the run picks them; tick up to six, choose "as soon as it is approved" or a time, and whether the scripts are written from the articles (by the next run, within 15 minutes) or start as the headlines for you to write. It holds no slot of the table.
- **Times and timing**: the day's times, the draft lead, the lock and the number of stories.

The API is `functions/api/admin/bulletins` (list and create; one bulletin: read and edit; `:action`: approve, reject, skip, reopen), behind the same door as the rest. `src/lib/bulletin-admin.ts` makes what the browser sends into stories the store can trust (texts capped, the graphic one the renderer draws, no voice clips or word times) and keeps the Telegram message in step.

A bulletin made for "now" still waits for the timed runs: its scripts with the next one, its video with the one after it is approved, so up to about half an hour in all.

## Trying the whole chain

The ops workflow's **`bulletin-try`** task (Actions → Ops → Run workflow, branch `static-export`, task `bulletin-try`; `arg`: how many stories, 3 to 6) makes one bulletin from the live board and sends it to the admin's Telegram chat, with the scripts in a second message. Nothing is queued and nothing is posted.

1. **Pick** (`src/lib/bulletin-pick.ts`): the most covered fresh stories (three outlets or more, a report in the last three hours), nothing sensitive, no opinion, two a section at most, no story twice.
2. **Scripts**: each story's article is read and Claude writes its script; a story whose script can't be trusted keeps its headline draft, and the report says why.
3. **Voice**: one clip a story, with word times.
4. **Render**, then **Telegram**. The spec, the clips and the video are also the run's artifact for three days.

A step that can't be done says so and the rest carries on: without `ANTHROPIC_API_KEY` the stories keep their headline drafts; without `ELEVENLABS_API_KEY`, or when the voice isn't among the account's voices, the bulletin is silent with estimated captions. Repository variables can replace the defaults: `BULLETIN_MODEL`, `BULLETIN_VOICE_ID`, `BULLETIN_VOICE_MODEL`, `ANTHROPIC_WORKSPACE_ID` (needed only with a key that isn't tied to one workspace).

`scripts/make-bulletin.ts` is the run; `BULLETIN_FEED=<news.json>` reads a saved feed in place of the site's.

## Rendering one

```
npm run bulletin:render -- scripts/bulletin/sample.json --out bulletin.mp4
```

- `--out` where the MP4 goes (default `bulletin.mp4`).
- `--jobs` how many Chrome pages draw at once (default 2). About five minutes for a one-minute bulletin on three.
- `--stills 2.5,12,30` writes those moments as JPEGs beside `--out` instead of rendering: the quick way to check a layout.

Needs Chrome or Chromium (`CHROME_PATH`, or one of the usual install places) and `ffmpeg`/`ffprobe` on the path. `playwright-core` drives Chrome; it downloads no browser of its own.

## The spec

One JSON file per bulletin. `scripts/bulletin/sample.json` is the bulletin of 15 November 2026.

| Field | What it is |
|---|---|
| `slotLabel` | The opener's time line, e.g. `বিকেল ৪টা` |
| `slotChip` | The chip at the top right of every story, e.g. `বিকেল ৪টা · ১৫ নভেম্বর` |
| `dateLine` | The opener's date |
| `tagline` | The opener's foot line |
| `nextLine` | The closer's "next bulletin" line |
| `stories` | 1 to 6 stories, in order |

Each story:

| Field | What it is |
|---|---|
| `section`, `color` | The pill's text and the story's accent colour |
| `headline` | Shown under the graphic; wrapped to three lines at most, the type shrinking if it must |
| `short` | The line used in the headline list and the ticker (falls back to `headline`) |
| `source`, `more` | The outlet credited, and how many other outlets carry the story |
| `script` | What the voice says. Captions are this text, four words at a time |
| `audio` | The voice clip, a path relative to the spec. Without it the story is silent and its timing estimated |
| `words` | Each word's start and end in the clip, in seconds (`[[0, 0.31], …]`), from the voice service. Without it, or when it doesn't have one pair per word of `script`, the timing is estimated |
| `visual` | The graphic, one of the four below |

Graphics:

- `{"type":"number","label":…,"value":1146,"unit":…,"chips":[…]}`: a figure that counts up. `value` may be text, which is shown as it is.
- `{"type":"quote","text":…,"by":…,"chips":[…]}`: a quotation and who said it.
- `{"type":"versus","title":…,"a":{"name","code","color"},"b":{…},"facts":[{"k","v"}]}`: two sides and up to three facts, for matches.
- `{"type":"points","title":…,"items":[…]}`: two or three short facts. What a story gets when nothing else fits.

Text in graphics must come from the story's sources; the renderer shows what it is given.

## Timing

- The opener and the headline list are 8.4 seconds, fixed, because the intro music is cut to them. The closer is 3.6 seconds.
- A story lasts as long as its voice clip plus 0.9 s before and 0.55 s after, and never less than 8.6 s (the graphics need that long).
- Captions: the clip's longest pauses mark where sentences end; inside a sentence, words share the time by their length. This is close, not exact. When the voice comes from the ElevenLabs API, its own word timings should replace the estimate.

## Music

The theme is original and fixed: `assets/bulletin/audio` holds it as stems (intro, a note per headline row, a loop that plays quietly under the voice, a soft hit at each story change, the closer), already at the levels they are mixed at. `scripts/bulletin/make-theme.py` writes them again when the music changes (needs numpy).

## Files

- `scripts/render-bulletin.mjs`: the spec to an MP4.
- `scripts/bulletin/template.html`: the picture. Every element's state is a function of the time passed to `window.render(seconds)`, so frames do not depend on how fast they were drawn.
- `scripts/bulletin/sample.json`: a full example.
- `scripts/bulletin/make-theme.py`, `assets/bulletin/audio/*.flac`: the music.
