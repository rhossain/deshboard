/**
 * Video bulletins' rules (src/lib/bulletin.ts) and their table (migrations/0005_bulletin.sql): npm run test:bulletin.
 * The table is checked on Node's built-in SQLite (Node 22.5 or later); that part is skipped, with a note, before that.
 */
import { readFileSync } from "node:fs";
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
import type { PostChoice } from "../src/lib/page-posts";
import { DEFAULT_SETTINGS, queueSettings } from "../src/lib/social-settings";
import type { NewsItem } from "../src/lib/types";

/** What the test uses of node:sqlite, which the project's Node types don't describe yet. */
interface Sqlite {
  DatabaseSync: new (file: string) => {
    exec(sql: string): void;
    prepare(sql: string): { run(...values: (string | number | null)[]): unknown };
  };
}

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
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
});

async function table() {
  let sqlite: Sqlite;
  try {
    sqlite = (await import("node:sqlite" as string)) as Sqlite;
  } catch {
    console.log("skip  the bulletins table (node:sqlite needs Node 22.5 or later)");
    return;
  }
  const db = new sqlite.DatabaseSync(":memory:");
  db.exec(readFileSync(path.join(__dirname, "../migrations/0005_bulletin.sql"), "utf8"));
  const insert = db.prepare(
    "INSERT INTO bulletins (id, kind, status, slot, scheduled_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  const now = "2026-11-15T09:00:00.000Z";
  const slot = "2026-11-15T10:00:00.000Z";
  test("one live bulletin per time of the table", () => {
    insert.run("a", "slot", "draft", slot, slot, now, now);
    assert.throws(() => insert.run("b", "slot", "draft", slot, slot, now, now), /UNIQUE/);
    db.exec("UPDATE bulletins SET status = 'rejected' WHERE id = 'a'");
    insert.run("b", "slot", "draft", slot, slot, now, now);
  });
  test("bulletins made by hand need no slot, at any time", () => {
    insert.run("m1", "manual", "draft", null, "2026-11-15T07:20:00.000Z", now, now);
    insert.run("m2", "manual", "approved", null, "2026-11-15T07:20:00.000Z", now, now);
  });
  test("only known kinds and states", () => {
    assert.throws(() => insert.run("x", "breaking", "draft", null, slot, now, now), /CHECK/);
    assert.throws(() => insert.run("y", "manual", "queued", null, slot, now, now), /CHECK/);
  });
}

table().then(() => console.log(`\n${passed} passed`));
