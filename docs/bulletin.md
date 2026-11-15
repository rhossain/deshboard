# Video bulletins

A bulletin is a 60–90 second vertical video (1080×1920) of four to six stories from the board: an opener, the list of headlines, one segment per story with its own graphic, an AI Bangla voice with word-by-word captions, and a closer. It has no presenter; the voice is labelled "AI কণ্ঠ" on screen. The plan and the decisions behind it are in the project doc `video-bulletin-plan.md`.

Status: the **renderer**, the bulletins **table**, the **settings** and the rules for times and specs are built (this page). Choosing stories in a run, drafting scripts with an AI model, the voice step, the admin editor and publishing are not built yet.

## When bulletins go out

- **The table:** three a day, 10:00, 16:00 and 21:00 Dhaka (`bulletinTimes` in the admin's settings replaces them).
- **By hand:** a bulletin can also be made for any time, outside the table (`kind` manual). It takes no slot, so it never collides with the table's, and it is reviewed, rendered and posted the same way.
- **Timeline:** the draft is made 60 minutes before its time (`bulletinLeadMinutes`); edits close 30 minutes before (`bulletinLockMinutes`, always at least ten minutes less than the lead), because the voice, the render and the preview need that long.
- **Stories:** five a bulletin (`bulletinStories`, 3 to 6); the renderer takes up to six.

These settings sit beside the Page's own lead (40 minutes) and lock (5 minutes), which they leave alone.

## The table and the rules

- `migrations/0005_bulletin.sql`: the `bulletins` table, one row a bulletin: draft → approved → rendering → ready → posting → posted, or rejected, skipped, failed, dry. One live bulletin per time of the table; none of that for ones made by hand. Apply with the ops workflow's `d1-migrate`.
- `src/lib/bulletin.ts`: the times (`bulletinSlots`, `bulletinsToDraft`, `bulletinLockAt`), Bangla labels (`clockBn`, `dateLineBn`, `nextLineBn`), each section's colour, a story as the picker drafts it (`draftStory`: the headline as the script and the outlets carrying it as the graphic, both true without reading the article), what stops a bulletin (`bulletinProblems`) and the renderer's spec (`bulletinSpec`).
- `npm run test:bulletin`: 13 checks of the above, the table included.

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
