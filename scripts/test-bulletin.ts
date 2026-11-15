/**
 * Video bulletins' rules (src/lib/bulletin.ts) and their table (migrations/0005_bulletin.sql): npm run test:bulletin.
 * The table is checked on Node's built-in SQLite (Node 22.5 or later); that part is skipped, with a note, before that.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {
  BULLETIN_TIMES,
  bulletinLockAt,
  bulletinProblems,
  bulletinsToDraft,
  bulletinSlots,
  bulletinSpec,
  bulletinTimesOf,
  type BulletinStory,
  clockBn,
  dateLineBn,
  draftStory,
  MAX_SCRIPT_CHARS,
  nextLineBn,
  SECTION_COLORS,
} from "../src/lib/bulletin";
import { BULLETIN_FRESH_MS, pickBulletin } from "../src/lib/bulletin-pick";
import { articleText, figures, parseDraft, scaled, unsupportedFigures, visualOf, writeScript } from "../src/lib/bulletin-script";
import {
  approveBulletin,
  bulletinEditable,
  BulletinError,
  bulletinForSlot,
  canMoveBulletin,
  createBulletin,
  editBulletin,
  getBulletin,
  insertBulletin,
  listBulletins,
  rejectBulletin,
  reopenBulletin,
  skipBulletin,
  StaleBulletin,
  updateBulletin,
} from "../src/lib/bulletin-store";
import { findVoice, speak, wordTimes } from "../src/lib/elevenlabs";
import type { PostChoice } from "../src/lib/page-posts";
import type { Story } from "../src/lib/stories";
import type { Db, SqlValue } from "../src/lib/social-db";
import { DEFAULT_SETTINGS, queueSettings } from "../src/lib/social-settings";
import type { NewsItem } from "../src/lib/types";

/** What the test uses of node:sqlite, which the project's Node types don't describe yet. */
interface Sqlite {
  DatabaseSync: new (file: string) => {
    exec(sql: string): void;
    prepare(sql: string): { all(...p: SqlValue[]): unknown[]; get(...p: SqlValue[]): unknown; run(...p: SqlValue[]): { changes: number | bigint } };
  };
}

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`ok  ${name}`);
}

/** A Dhaka wall-clock time as ms. */
const dhaka = (iso: string) => Date.parse(`${iso}+06:00`);

test("times of day in Bangla", () => {
  assert.equal(clockBn(dhaka("2026-11-15T10:00")), "সকাল ১০টা");
  assert.equal(clockBn(dhaka("2026-11-15T16:00")), "বিকেল ৪টা");
  assert.equal(clockBn(dhaka("2026-11-15T21:00")), "রাত ৯টা");
  assert.equal(clockBn(dhaka("2026-11-15T13:30")), "দুপুর ১:৩০");
  assert.equal(clockBn(dhaka("2026-11-15T00:05")), "রাত ১২:০৫");
  assert.equal(clockBn(dhaka("2026-11-15T18:45")), "সন্ধ্যা ৬:৪৫");
});

test("the date line", () => {
  assert.equal(dateLineBn(dhaka("2026-11-15T16:00")), "রবিবার, ১৫ নভেম্বর ২০২৬");
  // Late evening UTC is already the next Dhaka day.
  assert.equal(dateLineBn(Date.parse("2026-11-15T19:30:00Z")), "সোমবার, ১৬ নভেম্বর ২০২৬");
});

test("the table's bulletins around now", () => {
  const now = dhaka("2026-11-15T12:00");
  const slots = bulletinSlots(now);
  assert.equal(slots.length, 9);
  assert.ok(slots.includes(dhaka("2026-11-15T16:00")));
  assert.ok(slots.includes(dhaka("2026-11-14T21:00")));
  assert.ok(slots.includes(dhaka("2026-11-16T10:00")));
  assert.deepEqual([...slots].sort((a, b) => a - b), slots);
});

test("a draft is due an hour ahead, and the run just before the hour makes it", () => {
  const at = dhaka("2026-11-15T16:00");
  assert.deepEqual(bulletinsToDraft(dhaka("2026-11-15T14:50"), BULLETIN_TIMES, 60), []);
  assert.deepEqual(bulletinsToDraft(dhaka("2026-11-15T14:56"), BULLETIN_TIMES, 60), [at]);
  assert.deepEqual(bulletinsToDraft(dhaka("2026-11-15T15:30"), BULLETIN_TIMES, 60), [at]);
  assert.deepEqual(bulletinsToDraft(dhaka("2026-11-15T16:00"), BULLETIN_TIMES, 60), []);
  assert.equal(bulletinLockAt(at, 30), dhaka("2026-11-15T15:30"));
});

test("the next bulletin's line", () => {
  assert.equal(nextLineBn(dhaka("2026-11-15T16:00")), "পরের বুলেটিন রাত ৯টায়");
  assert.equal(nextLineBn(dhaka("2026-11-15T21:00")), "পরের বুলেটিন কাল সকাল ১০টায়");
  // A bulletin made by hand between two of the table's.
  assert.equal(nextLineBn(dhaka("2026-11-15T12:20")), "পরের বুলেটিন বিকেল ৪টায়");
  assert.equal(nextLineBn(dhaka("2026-11-15T16:00"), ["10:00", "18:30"]), "পরের বুলেটিন সন্ধ্যা ৬:৩০-এ");
});

test("the times setting", () => {
  assert.deepEqual(bulletinTimesOf(undefined), BULLETIN_TIMES);
  assert.deepEqual(bulletinTimesOf(["21:00", "9:00", "08:15", "08:15", 7, "25:00"]), ["08:15", "21:00"]);
  assert.deepEqual(bulletinTimesOf([]), BULLETIN_TIMES);
});

test("bulletin settings and their defaults", () => {
  assert.deepEqual(queueSettings({}), DEFAULT_SETTINGS);
  assert.deepEqual(DEFAULT_SETTINGS.bulletinTimes, null);
  assert.equal(DEFAULT_SETTINGS.bulletinLeadMinutes, 60);
  assert.equal(DEFAULT_SETTINGS.bulletinLockMinutes, 30);
  assert.equal(DEFAULT_SETTINGS.bulletinStories, 5);
  const s = queueSettings({ bulletinTimes: ["11:00", "20:00"], bulletinLeadMinutes: 90, bulletinLockMinutes: 20, bulletinStories: 4 });
  assert.deepEqual(s.bulletinTimes, ["11:00", "20:00"]);
  assert.equal(s.bulletinLeadMinutes, 90);
  assert.equal(s.bulletinLockMinutes, 20);
  assert.equal(s.bulletinStories, 4);
  // The lock must leave time to review: it can't reach the lead.
  const tight = queueSettings({ bulletinLeadMinutes: 40, bulletinLockMinutes: 45 });
  assert.equal(tight.bulletinLeadMinutes, 40);
  assert.equal(tight.bulletinLockMinutes, 30);
  assert.equal(queueSettings({ bulletinStories: 9 }).bulletinStories, 5);
  assert.equal(queueSettings({ bulletinLockMinutes: 5 }).bulletinLockMinutes, 30);
});

const item = (title: string, sourceId: string, sourceName: string, category: NewsItem["category"] = "business"): NewsItem => ({
  title,
  link: `https://example.com/${sourceId}`,
  sourceId,
  sourceName,
  lang: "bn",
  category,
  publishedAt: "2026-11-15T07:30:00.000Z",
});

function choice(): PostChoice {
  const lead = item("চার মাসে ১ হাজার ১৪৬ কোটি ডলার রেমিট্যান্স", "prothomalo", "Prothom Alo");
  const items = [lead, item("চার মাসে প্রবাসী আয় ১ হাজার ১৪৬ কোটি ডলার", "jugantor", "Jugantor"), item("রেমিট্যান্সে শীর্ষে সৌদি আরব", "kalerkantho", "Kaler Kantho", "other")];
  return { story: { id: lead.link, lead, items, outlets: 3, heat: 3, latest: lead.publishedAt }, item: lead, outlets: 3 };
}

test("a story as the picker drafts it", () => {
  const s = draftStory(choice());
  assert.equal(s.key, "https://example.com/prothomalo");
  assert.equal(s.section, "business");
  assert.equal(s.headline, "চার মাসে ১ হাজার ১৪৬ কোটি ডলার রেমিট্যান্স");
  assert.equal(s.script, "চার মাসে ১ হাজার ১৪৬ কোটি ডলার রেমিট্যান্স।");
  assert.equal(s.more, 2);
  assert.equal(s.sourceId, "prothomalo");
  assert.ok(s.source.length > 0);
  assert.equal(s.visual.type, "points");
  if (s.visual.type === "points") {
    assert.equal(s.visual.items.length, 3);
    assert.equal(s.visual.items[0], s.source);
  }
  assert.deepEqual(bulletinProblems([s]), []);
});

test("what stops a bulletin", () => {
  const good = draftStory(choice());
  assert.equal(bulletinProblems([]).length, 1);
  assert.equal(bulletinProblems(Array.from({ length: 7 }, () => good)).length, 1);
  const bad: BulletinStory = { ...good, script: " ", visual: { type: "points", items: [] } };
  assert.deepEqual(bulletinProblems([good, bad]), ["Story 2 has no script.", "Story 2's graphic is empty."]);
  const long: BulletinStory = { ...good, script: "ক".repeat(MAX_SCRIPT_CHARS + 1) };
  assert.equal(bulletinProblems([long]).length, 1);
});

test("the renderer's spec", () => {
  const at = dhaka("2026-11-15T16:00");
  const spec = bulletinSpec(at, [draftStory(choice())], { outlets: 59 });
  assert.equal(spec.slotLabel, "বিকেল ৪টা");
  assert.equal(spec.slotChip, "বিকেল ৪টা · ১৫ নভেম্বর");
  assert.equal(spec.dateLine, "রবিবার, ১৫ নভেম্বর ২০২৬");
  assert.equal(spec.tagline, "৫৯টি সংবাদমাধ্যম · এক বোর্ডে");
  assert.equal(spec.nextLine, "পরের বুলেটিন রাত ৯টায়");
  assert.equal(spec.stories[0].section, "অর্থনীতি");
  assert.equal(spec.stories[0].color, SECTION_COLORS.business);
  assert.equal("audio" in spec.stories[0], false);
  assert.equal(bulletinSpec(at, [{ ...draftStory(choice()), audio: "s1.mp3" }]).stories[0].audio, "s1.mp3");
  // Word times go with their clip, never without one.
  const words: [number, number][] = [[0, 0.4]];
  assert.deepEqual(bulletinSpec(at, [{ ...draftStory(choice()), audio: "s1.mp3", words }]).stories[0].words, words);
  assert.equal("words" in bulletinSpec(at, [{ ...draftStory(choice()), words }]).stories[0], false);
});

// ---------- which stories a bulletin takes ----------

const NOW = Date.parse("2026-11-15T08:00:00.000Z");
function story(id: string, title: string, category: NewsItem["category"], outlets = 3, ageMs = 30 * 60_000): Story {
  const at = new Date(NOW - ageMs).toISOString();
  const items = Array.from({ length: outlets }, (_, i) => ({ ...item(i ? `${title} (${i})` : title, `${id}-o${i}`, `Outlet ${i}`, category), link: `https://example.com/${id}/${i}`, publishedAt: at }));
  return { id: items[0].link, lead: items[0], items, outlets, heat: outlets, latest: at };
}

test("the picker: fresh, covered, careful, two a section, no story twice", () => {
  const ranked = [
    story("a", "বাজেট ঘোষণা করলেন অর্থমন্ত্রী", "business", 9),
    story("b", "রেমিট্যান্স বেড়েছে চার মাসে", "business", 8),
    story("c", "শেয়ারবাজারে সূচকের বড় উত্থান", "business", 7),
    story("d", "টস জিতে ব্যাটিংয়ে বাংলাদেশ", "sports", 7),
    story("e", "কলেজছাত্রীকে ধর্ষণের অভিযোগ", "crime", 7),
    story("f", "নির্বাচন নিয়ে সম্পাদকীয়", "opinion", 6),
    story("g", "পুরোনো খবর এখনও ঘুরছে", "national", 6, BULLETIN_FRESH_MS + 60_000),
    story("h", "দুই outlet-এর খবর", "national", 2),
    story("i", "স্টারশিপ ফিরল টাওয়ারে", "tech", 5),
    story("j", "ঢাকায় শীতের আগমন", "national", 4),
    story("k", "বাজেট ঘোষণা করলেন অর্থমন্ত্রী আজ", "politics", 4),
  ];
  const { picks, alternatives } = pickBulletin(ranked, { now: NOW, count: 5 });
  const ids = (list: PostChoice[]) => list.map((c) => c.story.id.split("/")[3]);
  // c is a third business story; e sensitive; f opinion; g stale; h has two outlets; k is a's story again.
  assert.deepEqual(ids(picks), ["a", "b", "d", "i", "j"]);
  assert.deepEqual(ids(alternatives), ["c"]);
  assert.equal(picks[0].item, ranked[0].lead);
  assert.equal(picks[0].outlets, 9);
  assert.deepEqual(ids(pickBulletin(ranked, { now: NOW, count: 3, exclude: new Set([ranked[0].id]) }).picks), ["b", "c", "d"]);
  assert.deepEqual(pickBulletin([], { now: NOW, count: 5 }).picks, []);
});

// ---------- the script writer and the voice, against stand-in services ----------

const ARTICLE = `<html><body><nav><p>মেনু মেনু মেনু মেনু মেনু মেনু মেনু মেনু মেনু মেনু মেনু</p></nav><article>
<p>চলতি অর্থবছরের প্রথম চার মাসে দেশে ১ হাজার ১৪৬ কোটি ডলারের প্রবাসী আয় এসেছে বলে জানিয়েছে বাংলাদেশ ব্যাংক।</p>
<p>এর মধ্যে সবচেয়ে বেশি রেমিট্যান্স এসেছে সৌদি আরব থেকে। কেন্দ্রীয় ব্যাংকের হালনাগাদ প্রতিবেদনে এই তথ্য উঠে এসেছে।</p>
<p>গত বছরের একই সময়ের তুলনায় প্রবাসী আয় বেড়েছে বলেও প্রতিবেদনে উল্লেখ করা হয়েছে, যা অর্থনীতির জন্য স্বস্তির খবর।</p>
</article><footer><p>কপিরাইট ২০২৬ সর্বস্বত্ব সংরক্ষিত সর্বস্বত্ব সংরক্ষিত সর্বস্বত্ব সংরক্ষিত</p></footer></body></html>`;

const GOOD = {
  script: "চার মাসে দেশে এসেছে ১ হাজার ১৪৬ কোটি ডলারের প্রবাসী আয়। সবচেয়ে বেশি এসেছে সৌদি আরব থেকে।",
  short: "চার মাসে ১,১৪৬ কোটি ডলার রেমিট্যান্স",
  visual: { type: "number", label: "চার মাসে প্রবাসী আয়", value: 1146, unit: "কোটি ডলার", chips: ["শীর্ষে সৌদি আরব"] },
};

/** A fetch that serves the article and answers the Claude API with `reply`; `seen` collects the API calls. */
function services(reply: unknown, seen: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [], article = ARTICLE): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("https://api.anthropic.com/")) {
      seen.push({ url, headers: init?.headers as Record<string, string>, body: JSON.parse(String(init?.body)) as Record<string, unknown> });
      return new Response(JSON.stringify({ content: [{ type: "text", text: typeof reply === "string" ? reply : JSON.stringify(reply) }] }), { status: 200 });
    }
    return new Response(article, { status: 200 });
  }) as typeof fetch;
}

async function scripts() {
  await test("the article's own text, without menus and footers", () => {
    const text = articleText(ARTICLE);
    assert.ok(text.includes("১ হাজার ১৪৬ কোটি ডলারের"));
    assert.ok(!text.includes("মেনু"));
    assert.ok(!text.includes("কপিরাইট"));
  });

  await test("figures are read the same in Bangla and Latin digits", () => {
    assert.deepEqual(figures("১,১৪৬ কোটি ও 50,000 টাকা, ২০৩৪ সালে ৩.৫ শতাংশ"), ["1146", "50000", "2034", "3.5"]);
  });

  await test("figures written with হাজার or লাখ are the numbers they mean", () => {
    assert.deepEqual(scaled("১ হাজার ১৪৬ কোটি ডলার").values, ["1146"]);
    assert.deepEqual(scaled("৫০ হাজার টাকা পর্যন্ত").values, ["50000"]);
    assert.deepEqual(scaled("দেড় লাখ নয়, ২ লাখ ৫০ হাজার").values, ["200000", "50000"]);
    assert.deepEqual(figures(scaled("২০৩৪ সালে ৫০ হাজার").rest), ["2034"]);
  });

  await test("a reply becomes a draft only when it is the JSON asked for", () => {
    assert.deepEqual(parseDraft(`Here you go:\n${JSON.stringify(GOOD)}`), GOOD);
    assert.equal(parseDraft("দুঃখিত, পারছি না"), null);
    assert.equal(parseDraft(JSON.stringify({ ...GOOD, visual: { type: "chart" } })), null);
    assert.equal(parseDraft(JSON.stringify({ ...GOOD, script: "" })), null);
    assert.equal(visualOf({ type: "points", items: ["একটাই"] }), null);
    assert.deepEqual(visualOf({ type: "versus", title: "টেস্ট", a: { name: "বাংলাদেশ", code: "ban" }, b: { name: "দক্ষিণ আফ্রিকা", code: "SA" }, facts: [{ k: "টস", v: "বাংলাদেশ" }] }), {
      type: "versus",
      title: "টেস্ট",
      a: { name: "বাংলাদেশ", code: "BAN" },
      b: { name: "দক্ষিণ আফ্রিকা", code: "SA" },
      facts: [{ k: "টস", v: "বাংলাদেশ" }],
    });
  });

  await test("a figure the article doesn't have is caught", () => {
    const article = articleText(ARTICLE);
    assert.deepEqual(unsupportedFigures({ script: GOOD.script, visual: GOOD.visual as never }, article, ""), []);
    assert.deepEqual(unsupportedFigures({ script: "পাঁচ মাসে ১ হাজার ২০০ কোটি ডলার।", visual: { type: "points", items: ["২০২৫ সালে", "সৌদি আরব"] } }, article, ""), ["1200", "2025"]);
  });

  const story = draftStory(choice());

  await test("a script is written from the article, through the Claude API", async () => {
    const seen: Parameters<typeof services>[1] = [];
    const r = await writeScript(story, { apiKey: "test-key", fetchImpl: services(GOOD, seen) });
    assert.equal(r.written, true);
    assert.deepEqual(r.warnings, []);
    assert.equal(r.story.script, GOOD.script);
    assert.equal(r.story.short, GOOD.short);
    assert.equal(r.story.visual.type, "number");
    assert.equal(r.story.headline, story.headline);
    assert.equal(r.story.source, story.source);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].headers["x-api-key"], "test-key");
    assert.equal(seen[0].headers["anthropic-version"], "2026-10-21");
    assert.equal("anthropic-workspace-id" in seen[0].headers, false);
    const messages = seen[0].body.messages as { content: string }[];
    assert.ok(messages[0].content.includes("১ হাজার ১৪৬ কোটি ডলারের"));
    assert.ok(messages[0].content.includes(story.headline));
  });

  await test("the story is kept as it was when the script can't be trusted", async () => {
    const madeUp = { ...GOOD, script: "চার মাসে এসেছে ২ হাজার কোটি ডলার। শীর্ষে সৌদি আরব।" };
    const a = await writeScript(story, { apiKey: "k", fetchImpl: services(madeUp) });
    assert.equal(a.written, false);
    assert.equal(a.story, story);
    assert.match(a.warnings[0], /figures the article doesn't/);
    const b = await writeScript(story, { apiKey: "k", fetchImpl: services("not json") });
    assert.equal(b.written, false);
    const c = await writeScript(story, { apiKey: "k", fetchImpl: services(GOOD, [], "<html><body><p>ছোট</p></body></html>") });
    assert.equal(c.written, false);
    assert.match(c.warnings[0], /couldn't be found/);
    const refused = (async (input: RequestInfo | URL) =>
      String(input).startsWith("https://api.anthropic.com/") ? new Response(JSON.stringify({ error: { message: "credit balance is too low" } }), { status: 400 }) : new Response(ARTICLE)) as typeof fetch;
    const d = await writeScript(story, { apiKey: "k", fetchImpl: refused });
    assert.equal(d.written, false);
    assert.match(d.warnings[0], /400: credit balance is too low/);
  });

  await test("each word's time from the voice's character times", () => {
    const characters = [..."ক খ  গঘ"];
    const starts = characters.map((_, i) => i * 0.1);
    const ends = characters.map((_, i) => i * 0.1 + 0.1);
    assert.deepEqual(wordTimes({ characters, character_start_times_seconds: starts, character_end_times_seconds: ends }), [
      [0, 0.1],
      [0.2, 0.3],
      [0.5, 0.7],
    ]);
  });

  await test("the voice: the clip and its word times, or none when they don't match the text", async () => {
    const text = "ক খ";
    const alignment = { characters: [...text], character_start_times_seconds: [0, 0.1, 0.2], character_end_times_seconds: [0.1, 0.2, 0.4] };
    const calls: { url: string; key: string; body: Record<string, unknown> }[] = [];
    const eleven = (a: unknown) =>
      (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/v1/voices")) return new Response(JSON.stringify({ voices: [{ voice_id: "v0", name: "Roger" }, { voice_id: "v1", name: "Subhajit - Grounded Bengali Storyteller" }] }));
        calls.push({ url, key: (init?.headers as Record<string, string>)["xi-api-key"], body: JSON.parse(String(init?.body)) as Record<string, unknown> });
        return new Response(JSON.stringify({ audio_base64: btoa("mp3!"), alignment: a }));
      }) as typeof fetch;
    assert.equal(await findVoice("k", "Subhajit", eleven(alignment)), "v1");
    assert.equal(await findVoice("k", "Nobody", eleven(alignment)), null);
    const spoken = await speak(text, { apiKey: "k", voiceId: "v1", fetchImpl: eleven(alignment) });
    assert.deepEqual([...spoken.audio], [..."mp3!"].map((c) => c.charCodeAt(0)));
    assert.deepEqual(spoken.words, [
      [0, 0.1],
      [0.2, 0.4],
    ]);
    assert.equal(spoken.duration, 0.4);
    assert.ok(calls[0].url.includes("/v1/text-to-speech/v1/with-timestamps"));
    assert.equal(calls[0].key, "k");
    assert.equal(calls[0].body.model_id, "eleven_v4");
    const off = await speak("ক খ গ", { apiKey: "k", voiceId: "v1", fetchImpl: eleven(alignment) });
    assert.deepEqual(off.words, []);
    const denied = (async () => new Response(JSON.stringify({ detail: { message: "quota exceeded" } }), { status: 401 })) as typeof fetch;
    await assert.rejects(speak(text, { apiKey: "k", voiceId: "v1", fetchImpl: denied }), /401: quota exceeded/);
  });
}

// ---------- the table and the store, on SQLite ----------

async function table() {
  let sqlite: Sqlite;
  try {
    sqlite = (await import("node:sqlite" as string)) as Sqlite;
  } catch {
    console.log("skip  the bulletins table and store (node:sqlite needs Node 22.5 or later)");
    return;
  }
  const file = new sqlite.DatabaseSync(":memory:");
  const dir = path.join(__dirname, "../migrations");
  for (const name of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) file.exec(readFileSync(path.join(dir, name), "utf8"));
  const db: Db = {
    all: async <T>(sql: string, p: SqlValue[] = []) => file.prepare(sql).all(...p) as T[],
    first: async <T>(sql: string, p: SqlValue[] = []) => (file.prepare(sql).get(...p) as T | undefined) ?? null,
    run: async (sql: string, p: SqlValue[] = []) => ({ changes: Number(file.prepare(sql).run(...p).changes) }),
  };
  const slot = "2026-11-15T10:00:00.000Z";
  const stories = [draftStory(choice())];
  const now = Date.parse("2026-11-15T09:00:00.000Z");

  await test("one live bulletin per time of the table", async () => {
    const a = await insertBulletin(db, { kind: "slot", status: "draft", slot, scheduledAt: slot, stories });
    assert.ok(a);
    assert.equal(await insertBulletin(db, { kind: "slot", status: "draft", slot, scheduledAt: slot, stories }), null);
    assert.equal((await bulletinForSlot(db, slot))?.id, a.id);
    assert.deepEqual(a.stories, stories);
    assert.equal(a.version, 1);
    await rejectBulletin(db, a.id, a.version, "panel:test");
    assert.equal(await bulletinForSlot(db, slot), null);
    assert.ok(await insertBulletin(db, { kind: "slot", status: "draft", slot, scheduledAt: slot, stories }));
  });

  await test("only known kinds and states", () => {
    const insert = file.prepare("INSERT INTO bulletins (id, kind, status, scheduled_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)");
    assert.throws(() => insert.run("x", "breaking", "draft", slot, slot, slot), /CHECK/);
    assert.throws(() => insert.run("y", "manual", "queued", slot, slot, slot), /CHECK/);
  });

  await test("a bulletin made by hand, for now or for any time ahead", async () => {
    const soon = await createBulletin(db, { stories }, "panel:test", now);
    assert.equal(soon.kind, "manual");
    assert.equal(soon.slot, null);
    assert.equal(soon.status, "draft");
    assert.equal(soon.scheduledAt, new Date(now).toISOString());
    assert.equal(soon.createdBy, "panel:test");
    // Two for the same minute, and one right on a time of the table: none of them collides.
    const again = await createBulletin(db, { stories, at: slot }, "panel:test", now);
    const third = await createBulletin(db, { stories, at: slot }, "panel:test", now);
    assert.notEqual(again.id, third.id);
    await assert.rejects(createBulletin(db, { stories, at: "2026-11-15T08:00:00.000Z" }, "panel:test", now), BulletinError);
    await assert.rejects(createBulletin(db, { stories: [] }, "panel:test", now), BulletinError);
    await assert.rejects(createBulletin(db, { stories: Array.from({ length: 7 }, () => stories[0]) }, "panel:test", now), BulletinError);
  });

  await test("states: what can follow what", () => {
    assert.ok(canMoveBulletin("draft", "approved"));
    assert.ok(canMoveBulletin("approved", "rendering"));
    assert.ok(canMoveBulletin("rendering", "ready"));
    assert.ok(canMoveBulletin("ready", "posting"));
    assert.ok(canMoveBulletin("failed", "rendering"));
    assert.ok(!canMoveBulletin("draft", "rendering"));
    assert.ok(!canMoveBulletin("posted", "draft"));
    assert.ok(!canMoveBulletin("ready", "draft"));
  });

  await test("edits: until the lock for the table's, any time for one made by hand, and never against an old version", async () => {
    const b = (await bulletinForSlot(db, slot))!;
    const lock = 30;
    assert.equal(bulletinEditable(b, lock, Date.parse("2026-11-15T09:29:00.000Z")), true);
    assert.equal(bulletinEditable(b, lock, Date.parse("2026-11-15T09:30:00.000Z")), false);
    const changed = [{ ...stories[0], script: "নতুন স্ক্রিপ্ট।" }];
    const edited = await editBulletin(db, b.id, b.version, { stories: changed }, "panel:test", lock, now);
    assert.equal(edited.stories[0].script, "নতুন স্ক্রিপ্ট।");
    assert.equal(edited.edited, true);
    assert.equal(edited.locked, true);
    assert.equal(edited.version, b.version + 1);
    await assert.rejects(editBulletin(db, b.id, b.version, { caption: "x" }, "panel:test", lock, now), StaleBulletin);
    await assert.rejects(editBulletin(db, b.id, edited.version, { caption: "x" }, "panel:test", lock, Date.parse("2026-11-15T09:45:00.000Z")), /closed/);
    await assert.rejects(editBulletin(db, b.id, edited.version, { at: "2026-11-15T12:00:00.000Z" }, "panel:test", lock, now), /keeps its time/);
    await assert.rejects(editBulletin(db, b.id, edited.version, { stories: [{ ...stories[0], script: "" }] }, "panel:test", lock, now), /no script/);
    const manual = await createBulletin(db, { stories, at: "2026-11-15T09:10:00.000Z" }, "panel:test", now);
    // Past its own lock, and still its maker's to change and to move.
    const moved = await editBulletin(db, manual.id, manual.version, { at: "2026-11-15T13:20:00.000Z", note: "দুপুরে" }, "panel:test", lock, Date.parse("2026-11-15T09:05:00.000Z"));
    assert.equal(moved.scheduledAt, "2026-11-15T13:20:00.000Z");
    assert.equal(moved.note, "দুপুরে");
  });

  await test("approve, edit again, skip, reopen", async () => {
    const b = (await bulletinForSlot(db, slot))!;
    const approved = await approveBulletin(db, b.id, b.version, "telegram");
    assert.equal(approved.status, "approved");
    assert.equal(approved.decidedBy, "telegram");
    // A changed script has not been signed off: back to a draft.
    const edited = await editBulletin(db, b.id, approved.version, { stories: [{ ...stories[0], script: "আরেকটি স্ক্রিপ্ট।" }] }, "panel:test", 30, now);
    assert.equal(edited.status, "draft");
    assert.equal(edited.decidedBy, null);
    // A caption alone leaves the approval standing.
    const again = await approveBulletin(db, b.id, edited.version, "panel:test");
    const captioned = await editBulletin(db, b.id, again.version, { caption: "আজকের খবর" }, "panel:test", 30, now);
    assert.equal(captioned.status, "approved");
    const skipped = await skipBulletin(db, b.id, captioned.version, "panel:test");
    assert.equal(skipped.status, "skipped");
    await assert.rejects(updateBulletin(db, b.id, skipped.version, { status: "posting" }, "run"), BulletinError);
    const reopened = await reopenBulletin(db, b.id, skipped.version, "panel:test");
    assert.equal(reopened.status, "draft");
    const rows = file.prepare("SELECT action FROM audit WHERE post_id = ? ORDER BY id").all(b.id) as { action: string }[];
    assert.deepEqual(
      rows.map((r) => r.action).slice(-6),
      ["bulletin.approve", "bulletin.edit", "bulletin.approve", "bulletin.edit", "bulletin.skip", "bulletin.reopen"],
    );
  });

  await test("the run's steps: rendering, ready, posted", async () => {
    const b = await createBulletin(db, { stories }, "panel:test", now);
    const approved = await approveBulletin(db, b.id, b.version, "panel:test");
    const rendering = await updateBulletin(db, b.id, approved.version, { status: "rendering" }, "run");
    const ready = await updateBulletin(db, b.id, rendering.version, { status: "ready", duration: 59.3 }, "run");
    assert.equal(ready.duration, 59.3);
    assert.equal(bulletinEditable(ready, 30, now), false);
    const posting = await updateBulletin(db, b.id, ready.version, { status: "posting" }, "run");
    const posted = await updateBulletin(db, b.id, posting.version, { status: "posted", fbPostId: "123_456", permalink: "https://fb.example/reel/1", postedAt: "2026-11-15T09:20:00.000Z" }, "run");
    assert.equal((await getBulletin(db, b.id))?.fbPostId, "123_456");
    assert.equal(posted.status, "posted");
    const listed = await listBulletins(db, { statuses: ["posted"] });
    assert.deepEqual(listed.map((x) => x.id), [b.id]);
  });
}

scripts()
  .then(table)
  .then(() => console.log(`\n${passed} passed`));
