// Renders a video bulletin (1080×1920, 30 fps, H.264 + AAC) from a bulletin spec.
//
//   node scripts/render-bulletin.mjs <spec.json> [--out bulletin.mp4] [--jobs 2] [--stills 2.5,12]
//
// The spec is described in docs/bulletin.md. The picture is scripts/bulletin/template.html, drawn
// frame by frame in headless Chrome; the sound is the theme stems in assets/bulletin/audio plus one
// voice clip per story. Needs Chrome (CHROME_PATH, or one of the usual places) and ffmpeg.
import { createRequire } from "node:module";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FPS = 30;
const VOICE_AT = 0.9; // seconds into a story before the voice starts
const VOICE_TAIL = 0.55; // seconds a story stays up after the voice ends
const MIN_STORY = 8.6; // the graphics need this long to play out
const OPEN_RUN = 8.4; // opener + headline list, fixed: the intro music is cut to it

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const specPath = args.find((a, i) => !a.startsWith("--") && !(args[i - 1] ?? "").startsWith("--"));
if (!specPath) {
  console.error("usage: node scripts/render-bulletin.mjs <spec.json> [--out bulletin.mp4] [--jobs 2] [--stills 2.5,12]");
  process.exit(2);
}
const out = path.resolve(flag("out", "bulletin.mp4"));
const jobs = Math.max(1, Number(flag("jobs", "2")) || 2);
const stills = flag("stills", null);

function chromePath() {
  const places = [
    process.env.CHROME_PATH,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  const found = places.find((p) => fs.existsSync(p));
  if (!found) throw new Error("Chrome not found: set CHROME_PATH to a Chrome or Chromium binary");
  return found;
}

function run(cmd, cmdArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, { stdio: ["ignore", "inherit", "inherit"] });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`))));
  });
}

/** How long a clip is, and where its pauses are. */
function probe(file) {
  const dur = Number(
    execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim(),
  );
  const r = spawnSync("ffmpeg", ["-hide_banner", "-i", file, "-af", "silencedetect=noise=-38dB:d=0.22", "-f", "null", "-"], { encoding: "utf8" });
  const log = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  const starts = [...log.matchAll(/silence_start: ([\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...log.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  return { dur, pauses: starts.map((s, i) => [s, ends[i] ?? dur]) };
}

const weight = (word) => [...word].reduce((n, c) => n + (/[০-৯0-9]/.test(c) ? 3 : 1), 1.5);

/**
 * When each word of the script is spoken, in seconds from the story's start.
 * With a clip: sentences are pinned to the clip's longest pauses and words share a sentence's
 * time by length. Without one: the whole thing is estimated from the text.
 */
function timings(script, clip) {
  const sentences = script.split(/(?<=[।?!])\s+/).map((s) => s.trim()).filter(Boolean);
  let spans;
  let speech;
  if (clip) {
    const inner = clip.pauses.filter(([s, e]) => s > 0.15 && e < clip.dur - 0.05);
    const lead = clip.pauses.find(([s]) => s <= 0.15);
    const tail = clip.pauses.find(([, e]) => e >= clip.dur - 0.05);
    const from = lead ? lead[1] : 0;
    const to = tail ? tail[0] : clip.dur;
    speech = clip.dur;
    const cuts = [...inner].sort((a, b) => b[1] - b[0] - (a[1] - a[0])).slice(0, sentences.length - 1).sort((a, b) => a[0] - b[0]);
    if (cuts.length === sentences.length - 1) {
      spans = sentences.map((_, i) => [i === 0 ? from : cuts[i - 1][1], i === sentences.length - 1 ? to : cuts[i][0]]);
    } else {
      spans = null; // fewer pauses than sentences: spread the words over the whole clip
      const all = script.split(/\s+/);
      const total = all.reduce((n, w) => n + weight(w), 0);
      let acc = 0;
      const wt = all.map((w) => {
        const a = from + ((to - from) * acc) / total;
        acc += weight(w);
        return [VOICE_AT + a, VOICE_AT + from + ((to - from) * acc) / total];
      });
      return { wt: round(wt), speech };
    }
  } else {
    const perUnit = 0.062; // seconds per weight unit, about the pace of the chosen voice
    let t = 0;
    spans = sentences.map((s) => {
      const d = s.split(/\s+/).reduce((n, w) => n + weight(w), 0) * perUnit;
      const span = [t, t + d];
      t += d + 0.45;
      return span;
    });
    speech = t - 0.45;
  }
  const wt = [];
  sentences.forEach((s, i) => {
    const words = s.split(/\s+/);
    const total = words.reduce((n, w) => n + weight(w), 0);
    const [a, b] = spans[i];
    let acc = 0;
    for (const w of words) {
      const start = a + ((b - a) * acc) / total;
      acc += weight(w);
      wt.push([VOICE_AT + start, VOICE_AT + a + ((b - a) * acc) / total]);
    }
  });
  return { wt: round(wt), speech };
}
const round = (wt) => wt.map(([a, b]) => [Math.round(a * 1000) / 1000, Math.round(b * 1000) / 1000]);

// ---------- the spec ----------
const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
if (!Array.isArray(spec.stories) || spec.stories.length < 1 || spec.stories.length > 6) {
  throw new Error("a bulletin needs 1 to 6 stories");
}
const specDir = path.dirname(path.resolve(specPath));
const voices = [];
for (const story of spec.stories) {
  for (const key of ["section", "color", "headline", "source", "script"]) {
    if (!story[key]) throw new Error(`story "${story.headline ?? "?"}" is missing ${key}`);
  }
  story.visual ??= { type: "points", items: [] };
  const file = story.audio ? path.resolve(specDir, story.audio) : null;
  if (file && !fs.existsSync(file)) throw new Error(`voice clip not found: ${file}`);
  const clip = file ? probe(file) : null;
  const { wt, speech } = timings(story.script, clip);
  // The voice's own word times (story.words, seconds from the clip's start), when it gave one for every word.
  const own = Array.isArray(story.words) && story.words.length === story.script.trim().split(/\s+/).length;
  story.wt = own ? round(story.words.map(([a, b]) => [VOICE_AT + a, VOICE_AT + b])) : wt;
  story.dur = Math.round(Math.max(MIN_STORY, VOICE_AT + speech + VOICE_TAIL) * FPS) / FPS;
  voices.push(file);
}

// ---------- the picture ----------
const work = fs.mkdtempSync(path.join(os.tmpdir(), "bulletin-"));
const page = path.join(work, "bulletin.html");
fs.writeFileSync(
  page,
  fs
    .readFileSync(path.join(ROOT, "scripts/bulletin/template.html"), "utf8")
    .replaceAll("__FONTS__", pathToFileURL(path.join(ROOT, "assets/fonts")).href)
    .replaceAll("__BRAND__", pathToFileURL(path.join(ROOT, "public/brand")).href)
    .replace("/*SPEC*/null", () => JSON.stringify(spec).replace(/</g, "\\u003c")),
);

const { chromium } = require("playwright-core");
const browser = await chromium.launch({ executablePath: chromePath(), args: ["--no-sandbox", "--font-render-hinting=none"] });
async function openPage() {
  const p = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  p.on("pageerror", (e) => {
    console.error("page error:", e.message);
    process.exitCode = 1;
  });
  await p.goto(pathToFileURL(page).href);
  await p.evaluate(() => window.ready);
  return p;
}

try {
  const first = await openPage();
  const scenes = await first.evaluate(() => window.SCENES);
  const total = scenes[scenes.length - 1].e;

  if (stills) {
    const dir = path.join(path.dirname(out), "stills");
    fs.mkdirSync(dir, { recursive: true });
    for (const t of stills.split(",").map(Number)) {
      await first.evaluate((x) => window.render(x), t);
      await first.screenshot({ path: path.join(dir, `t${String(t).replace(".", "_")}.jpg`), type: "jpeg", quality: 85 });
    }
    console.log(`stills in ${dir} (the bulletin is ${total.toFixed(1)} s)`);
  } else {
    // One encoded file per scene, joined without re-encoding.
    const queue = scenes.map((_, i) => i);
    async function worker(p) {
      for (let i = queue.shift(); i !== undefined; i = queue.shift()) {
        const s = scenes[i];
        const frames = Math.round(s.d * FPS);
        const tmp = path.join(work, `tmp_${i}.mp4`);
        const ff = spawn(
          "ffmpeg",
          ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
            "-c:v", "libx264", "-crf", "18", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-r", String(FPS),
            // A key frame every three seconds: Facebook asks Reels for a closed GOP of two to five.
            "-g", String(FPS * 3), "-keyint_min", String(FPS), "-flags", "+cgop", tmp],
          { stdio: ["pipe", "inherit", "inherit"] },
        );
        const done = new Promise((resolve) => ff.on("exit", resolve));
        for (let f = 0; f < frames; f++) {
          await p.evaluate((x) => window.render(x), s.s + f / FPS);
          const shot = await p.screenshot({ type: "jpeg", quality: 92 });
          if (!ff.stdin.write(shot)) await new Promise((r) => ff.stdin.once("drain", r));
        }
        ff.stdin.end();
        if ((await done) !== 0) throw new Error(`encoding scene ${i} failed`);
        fs.renameSync(tmp, path.join(work, `scene_${String(i).padStart(2, "0")}.mp4`));
      }
    }
    const pages = [first];
    for (let j = 1; j < Math.min(jobs, scenes.length); j++) pages.push(await openPage());
    await Promise.all(pages.map(worker));

    const list = path.join(work, "list.txt");
    fs.writeFileSync(list, scenes.map((_, i) => `file '${path.join(work, `scene_${String(i).padStart(2, "0")}.mp4`)}'`).join("\n"));
    const silent = path.join(work, "silent.mp4");
    await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", silent]);

    // ---------- the sound ----------
    const A = (name) => path.join(ROOT, "assets/bulletin/audio", `${name}.flac`);
    const storyStarts = scenes.filter((s) => s.k === "story").map((s) => s.s);
    const closeAt = scenes[scenes.length - 1].s;
    const inputs = ["-i", silent];
    const chains = [];
    const mixed = [];
    let n = 1;
    const place = (file, at, extra = "", pre = []) => {
      inputs.push(...pre, "-i", file);
      chains.push(`[${n}:a]${extra}adelay=${Math.max(0, Math.round(at * 1000))}:all=1[m${n}]`);
      mixed.push(`[m${n}]`);
      n++;
    };
    place(A("intro"), 0);
    spec.stories.forEach((_, i) => place(A(`blip${Math.min(i + 1, 6)}`), 3.2 + 0.62 + i * 0.38));
    const bedLen = closeAt - OPEN_RUN;
    place(A("bed"), OPEN_RUN, `atrim=0:${bedLen.toFixed(3)},afade=t=in:d=0.5,afade=t=out:st=${(bedLen - 0.4).toFixed(3)}:d=0.4,`, ["-stream_loop", "-1"]);
    storyStarts.forEach((at) => place(A("hit"), at - 0.5));
    place(A("closer"), closeAt);
    voices.forEach((file, i) => file && place(file, storyStarts[i] + VOICE_AT));
    const filter = `${chains.join(";")};${mixed.join("")}amix=inputs=${mixed.length}:normalize=0,pan=stereo|c0=c0|c1=c0,alimiter=limit=0.95:level=disabled,apad[a]`;
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const tmpOut = path.join(work, "out.mp4");
    await run("ffmpeg", ["-y", "-loglevel", "error", ...inputs, "-filter_complex", filter, "-map", "0:v", "-map", "[a]",
      "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", "-shortest", "-movflags", "+faststart", tmpOut]);
    fs.copyFileSync(tmpOut, out);
    const missing = voices.filter((v) => !v).length;
    console.log(`${out}: ${total.toFixed(1)} s, ${spec.stories.length} stories${missing ? `, ${missing} without a voice clip (captions estimated)` : ""}`);
  }
} finally {
  await browser.close();
  fs.rmSync(work, { recursive: true, force: true });
}
