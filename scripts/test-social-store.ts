/**
 * The admin's store (src/lib/social-store.ts) against the real schema (migrations/), on Node's built-in SQLite in
 * place of D1: npm run test:social. Needs Node 22.5 or later (node:sqlite); skipped, with a note, before that.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import type { Db, SqlValue } from "../src/lib/social-db";
import {
  activeBlocks,
  addBlock,
  auditLog,
  canMove,
  insertPost,
  listPosts,
  MoveError,
  postedRecords,
  postForSlot,
  readSettings,
  StaleError,
  updatePost,
  writeSetting,
} from "../src/lib/social-store";
import type { PostRecord } from "../src/lib/page-posts";
import { blockSets, MISSED_MS, queueAction, sameStories, slotsToDraft } from "../src/lib/social-queue";
import { DEFAULT_SETTINGS, editable, queueSettings } from "../src/lib/social-settings";
import { ActionError, approve, createFromItem, createManual, edit, postNow, reject, reopen, skip } from "../src/lib/social-actions";
import { getPost, recordRun } from "../src/lib/social-store";
import { previewOf, reviewButtons, reviewText } from "../src/lib/telegram-review";
import { getMedia, hasMedia, MEDIA_PART, pruneMedia, putMedia } from "../src/lib/social-store";
import { headlinesHeading as pageHeading } from "../src/lib/page-posts";
import { headlinesHeading, IG_DEFAULT_TIMES, instagramCaption, instagramSlots, postImages, slideSetOf } from "../src/lib/instagram-post";
import { queueLive, takeDown } from "../src/lib/social-actions";
import { publishToInstagram } from "../src/lib/instagram-graph";

type Sqlite = {
  DatabaseSync: new (file: string) => {
    exec(sql: string): void;
    prepare(sql: string): { all(...p: SqlValue[]): unknown[]; get(...p: SqlValue[]): unknown; run(...p: SqlValue[]): { changes: number | bigint } };
  };
};

async function main() {
  let sqlite: Sqlite;
  try {
    sqlite = (await import("node:sqlite" as string)) as Sqlite;
  } catch {
    console.log(`- skipped: node:sqlite needs Node 22.5+ (this is ${process.version})`);
    return;
  }
  const file = new sqlite.DatabaseSync(":memory:");
  const dir = path.join(process.cwd(), "migrations");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) file.exec(readFileSync(path.join(dir, f), "utf8"));
  const db: Db = {
    all: async <T>(sql: string, p: SqlValue[] = []) => file.prepare(sql).all(...p) as T[],
    first: async <T>(sql: string, p: SqlValue[] = []) => (file.prepare(sql).get(...p) as T | undefined) ?? null,
    run: async (sql: string, p: SqlValue[] = []) => ({ changes: Number(file.prepare(sql).run(...p).changes) }),
  };

  let passed = 0;
  const test = async (name: string, fn: () => Promise<void>) => {
    await fn();
    passed++;
    console.log(`✓ ${name}`);
  };

  const slot = "2026-10-19T04:30:00.000Z";
  const record: PostRecord = {
    kind: "slot",
    content: "headlines",
    slot,
    at: slot,
    title: "সকালের শীর্ষ ৫ খবর",
    link: "https://bartaboard.com/bn/",
    sourceId: "prothomalo",
    category: "other",
    keys: ["k1", "k2"],
    words: [],
    mode: "on",
  };

  const draft = await insertPost(db, {
    kind: "slot",
    content: "headlines",
    status: "draft",
    slot,
    scheduledAt: slot,
    message: "সকালের শীর্ষ ৫ খবর",
    link: "https://bartaboard.com/bn/",
    params: { message: "x", link: "https://bartaboard.com/bn/" },
    cards: [{ link: "https://bartaboard.com/s/1", title: "শিরোনাম", source: "প্রথম আলো", key: "k1" }],
    record,
  });

  await test("a draft is stored and read back whole", async () => {
    assert.ok(draft);
    assert.equal(draft.status, "draft");
    assert.equal(draft.version, 1);
    assert.equal(draft.cards[0].source, "প্রথম আলো");
    assert.equal(draft.record?.keys.length, 2);
    assert.equal(draft.policy, "auto_unless_rejected");
    assert.match(draft.id, /^p_[0-9a-z]+$/);
  });

  await test("a second live post for the same slot is refused", async () => {
    const again = await insertPost(db, { kind: "slot", content: "headlines", status: "draft", slot, scheduledAt: slot });
    assert.equal(again, null);
    assert.equal((await postForSlot(db, slot))?.id, draft!.id);
  });

  const approved = await updatePost(db, draft!.id, 1, { status: "approved", locked: true, decidedBy: "telegram" }, "telegram", "approve");

  await test("an approval bumps the version and is audited", async () => {
    assert.equal(approved.status, "approved");
    assert.equal(approved.version, 2);
    assert.equal(approved.locked, true);
    const log = await auditLog(db, { postId: draft!.id });
    assert.equal(log[0].action, "approve");
    assert.equal(log[0].actor, "telegram");
  });

  await test("a change against an old version is refused", async () => {
    await assert.rejects(updatePost(db, draft!.id, 1, { message: "late edit" }, "panel:a@b"), StaleError);
    await assert.rejects(updatePost(db, draft!.id, 1, { status: "rejected" }, "panel:a@b"), StaleError);
  });

  await test("a status can only move along the allowed paths", async () => {
    assert.ok(canMove("draft", "approved"));
    assert.ok(!canMove("posted", "draft"));
    assert.ok(canMove("posting", "dry"), "a trial run's claim ends as a trial pick");
    await assert.rejects(updatePost(db, draft!.id, 2, { status: "posted" }, "deploy"), MoveError);
  });

  await test("approved posts count for the picking rules; dry ones only on a dry run", async () => {
    await insertPost(db, {
      kind: "breaking",
      content: "news",
      status: "dry",
      scheduledAt: "2026-10-19T06:00:00.000Z",
      record: { ...record, kind: "breaking", slot: undefined, mode: "dry" },
    });
    assert.equal((await postedRecords(db, "2026-10-18T00:00:00.000Z")).length, 1);
    assert.equal((await postedRecords(db, "2026-10-18T00:00:00.000Z", true)).length, 2);
    assert.equal((await postedRecords(db, "2026-10-20T00:00:00.000Z")).length, 0);
  });

  await test("a rejected draft frees its slot for another", async () => {
    const rejected = await updatePost(db, draft!.id, 2, { status: "rejected" }, "panel:a@b", "reject");
    assert.equal(rejected.status, "rejected");
    const next = await insertPost(db, { kind: "slot", content: "headlines", status: "draft", slot, scheduledAt: slot });
    assert.ok(next);
    assert.equal((await listPosts(db, { from: "2026-10-19T00:00:00.000Z", to: "2026-10-20T00:00:00.000Z" })).length, 3);
    assert.equal((await listPosts(db, { statuses: ["draft"] })).length, 1);
  });

  await test("a Facebook post is recorded once", async () => {
    const at = "2026-10-18T10:00:00.000Z";
    const first = await insertPost(db, { kind: "slot", content: "news", status: "posted", scheduledAt: at, fbPostId: "123_456" });
    const dup = await insertPost(db, { kind: "slot", content: "news", status: "posted", scheduledAt: at, fbPostId: "123_456" });
    assert.ok(first);
    assert.equal(dup, null);
  });

  await test("settings keep their JSON values and are audited", async () => {
    await writeSetting(db, "paused", true, "panel:a@b");
    await writeSetting(db, "slots", [{ time: "08:00", content: "headlines" }], "panel:a@b");
    await writeSetting(db, "paused", false, "panel:a@b");
    assert.deepEqual(await readSettings(db), { paused: false, slots: [{ time: "08:00", content: "headlines" }] });
    assert.equal((await auditLog(db)).filter((e) => e.action === "setting").length, 3);
  });

  await test("blocks run out", async () => {
    const story = { keys: ["k1"], words: ["বন্যা"] };
    await addBlock(db, { type: "story", value: story, until: "2026-10-20T00:00:00.000Z", reason: "not this story", postId: draft!.id }, "telegram");
    await addBlock(db, { type: "outlet", value: "dailystar", until: null, reason: null, postId: null }, "panel:a@b");
    const before = await activeBlocks(db, "2026-10-19T12:00:00.000Z");
    assert.equal(before.length, 2);
    assert.deepEqual(before[0].value, story);
    assert.equal((await activeBlocks(db, "2026-10-21T00:00:00.000Z")).length, 1);
  });

  // The queue's rules (src/lib/social-queue.ts).
  const t = Date.parse("2026-10-19T10:00:00.000Z"); // 16:00 Dhaka
  const at = (min: number) => new Date(t + min * 60_000).toISOString();
  const opts = { publishLead: 0, paused: false };

  await test("a draft goes out at its time, not before; an hour late it is skipped", async () => {
    const post = { status: "draft" as const, policy: "auto_unless_rejected" as const, scheduledAt: at(0) };
    assert.equal(queueAction(post, t - 60_000, opts), "wait");
    assert.equal(queueAction(post, t, opts), "publish");
    assert.equal(queueAction(post, t + MISSED_MS - 60_000, opts), "publish");
    assert.equal(queueAction(post, t + MISSED_MS + 60_000, opts), "miss");
  });

  await test("in review mode it goes 20 minutes ahead, scheduled", async () => {
    const post = { status: "approved" as const, policy: "auto" as const, scheduledAt: at(0) };
    assert.equal(queueAction(post, t - 25 * 60_000, { publishLead: 20 * 60_000, paused: false }), "wait");
    assert.equal(queueAction(post, t - 20 * 60_000, { publishLead: 20 * 60_000, paused: false }), "publish");
  });

  await test("manual drafts and a paused queue hold; approval lets a manual one go", async () => {
    assert.equal(queueAction({ status: "draft", policy: "manual", scheduledAt: at(0) }, t, opts), "hold");
    assert.equal(queueAction({ status: "approved", policy: "manual", scheduledAt: at(0) }, t, opts), "publish");
    assert.equal(queueAction({ status: "approved", policy: "auto", scheduledAt: at(0) }, t, { publishLead: 0, paused: true }), "hold");
  });

  await test("a slot's draft is due from the lead before it until it is missed", async () => {
    const slots = [{ time: "16:00", content: "headlines" as const }, { time: "17:30", content: "video" as const }];
    const lead = 40 * 60_000;
    // The run nearest before the lead: a run at 15:15 (45 minutes ahead, drafting at about 15:17) makes 16:00's draft;
    // one at 15:00 doesn't.
    assert.deepEqual(slotsToDraft(t - 46 * 60_000, slots, lead), []);
    assert.deepEqual(slotsToDraft(t - 43 * 60_000, slots, lead).map((s) => s.time), ["16:00"]);
    // 16:00's window runs until it is missed (16:45); 17:30's opens with the 16:45 run.
    assert.deepEqual(slotsToDraft(t + 44 * 60_000, slots, lead).map((s) => s.time), ["16:00"]);
    assert.deepEqual(slotsToDraft(t + MISSED_MS + 60_000, slots, lead).map((s) => s.time), ["17:30"]);
  });

  await test("blocks become sets; a story's keys decide sameness", async () => {
    const b = blockSets([
      { id: 1, type: "story", value: { keys: ["a", "b"], words: [] }, until: null, reason: null, postId: null },
      { id: 2, type: "outlet", value: "jugantor", until: null, reason: null, postId: null },
      { id: 3, type: "word", value: "রাশিফল", until: null, reason: null, postId: null },
    ]);
    assert.ok(b.keys.has("b") && b.outlets.has("jugantor"));
    assert.ok(b.hasWord("আজকের রাশিফল") && !b.hasWord("বন্যা"));
    assert.ok(sameStories({ keys: ["x", "y"] }, { keys: ["y", "x"] }));
    assert.ok(!sameStories({ keys: ["x"] }, { keys: ["x", "y"] }));
  });

  await test("settings fall back to the defaults when missing or malformed", async () => {
    assert.deepEqual(queueSettings({}), DEFAULT_SETTINGS);
    const s = queueSettings({ paused: true, slotPolicy: "manual", draftLeadMinutes: 5, slots: [{ time: "08:00", content: "video" }, { time: "25:00", content: "video" }] });
    assert.equal(s.paused, true);
    assert.equal(s.slotPolicy, "manual");
    assert.equal(s.draftLeadMinutes, 40);
    assert.deepEqual(s.slots, [{ time: "08:00", content: "video" }]);
  });

  // What a person can do (src/lib/social-actions.ts).
  const ctx = { db, actor: "panel:a@b", fb: null };
  const ahead = (h: number) => new Date(Math.ceil(Date.now() / 900_000) * 900_000 + h * 3600_000).toISOString();
  const slot2 = ahead(3);
  const carousel = await insertPost(db, {
    kind: "slot",
    content: "headlines",
    status: "draft",
    slot: slot2,
    scheduledAt: slot2,
    message: "রাতের শীর্ষ ৫ খবর",
    params: { message: "রাতের শীর্ষ ৫ খবর", link: "https://bartaboard.com/bn/", child_attachments: JSON.stringify([{ link: "a" }, { link: "b" }, { link: "c" }]) },
    cards: [{ link: "a", title: "A", source: "x" }, { link: "b", title: "B", source: "y" }, { link: "c", title: "C", source: "z" }],
    record: { ...record, slot: slot2, at: slot2, keys: ["s1", "s2"], words: ["নির্বাচন"], sourceId: "jugantor", category: "politics" },
  });

  await test("an edit changes the text and the order, and locks the draft", async () => {
    const e = await edit(ctx, carousel!.id, 1, { message: "  নতুন লেখা  ", order: [2, 0, 1] });
    assert.equal(e.message, "নতুন লেখা");
    assert.equal(e.params.message, "নতুন লেখা");
    assert.deepEqual(e.cards.map((c) => c.title), ["C", "A", "B"]);
    assert.deepEqual(JSON.parse(e.params.child_attachments).map((c: { link: string }) => c.link), ["c", "a", "b"]);
    assert.ok(e.locked && e.edited);
    await assert.rejects(edit(ctx, carousel!.id, e.version, { order: [0, 0, 1] }), ActionError);
    await assert.rejects(edit(ctx, carousel!.id, e.version, { message: "   " }), ActionError);
  });

  await test("an action against an old version is refused with the post as it is now", async () => {
    await assert.rejects(approve(ctx, carousel!.id, 1), (err: ActionError) => err.status === 409 && err.post?.version === 2);
  });

  await test("a rejection blocks the story (and the outlet and section when asked) for a while", async () => {
    const r = await reject(ctx, carousel!.id, 2, { reason: "not today", scopes: ["story", "outlet", "section"], hours: 6 });
    assert.equal(r.status, "rejected");
    const now = new Date().toISOString();
    const blocks = (await activeBlocks(db, now)).filter((b) => b.postId === carousel!.id);
    assert.deepEqual(blocks.map((b) => b.type).sort(), ["outlet", "section", "story"]);
    assert.deepEqual(blocks.find((b) => b.type === "story")!.value, { keys: ["s1", "s2"], words: ["নির্বাচন"] });
    assert.equal((await activeBlocks(db, new Date(Date.now() + 7 * 3600_000).toISOString())).filter((b) => b.postId === carousel!.id).length, 0);
  });

  await test("reopen undoes a rejection, and the picker may refresh it again", async () => {
    const o = await reopen(ctx, carousel!.id, 3);
    assert.equal(o.status, "draft");
    assert.equal(o.locked, false);
    const sk = await skip(ctx, carousel!.id, o.version);
    assert.equal(sk.status, "skipped");
  });

  await test("a post of one's own is approved for its time; a bad link or empty text is refused", async () => {
    const m = await createManual(ctx, { message: "Bartaboard-এ এখন ভিডিও", link: "https://bartaboard.com/bn/videos/" });
    assert.equal(m.status, "approved");
    assert.equal(m.content, "custom");
    assert.equal(m.params.link, "https://bartaboard.com/bn/videos/");
    await assert.rejects(createManual(ctx, { message: "x", link: "javascript:alert(1)" }), ActionError);
    await assert.rejects(createManual(ctx, { message: " " }), ActionError);
  });

  await test("posting now is refused while the queue is on trial, and without Facebook", async () => {
    const m = await createManual(ctx, { message: "test" });
    await assert.rejects(postNow(ctx, m.id, 1), (err: ActionError) => err.status === 503);
    await recordRun(db, "shadow", true, []);
    await assert.rejects(postNow({ ...ctx, fb: { token: "t", pageId: "1" } }, m.id, 1), (err: ActionError) => err.status === 409);
    assert.equal((await getPost(db, m.id))!.status, "approved");
  });

  await test("a draft's Telegram message has its buttons, each within Telegram's 64 bytes, and says what was done", async () => {
    const d = await insertPost(db, { kind: "slot", content: "video", status: "draft", slot: "2026-10-19T11:30:00.000Z", scheduledAt: "2026-10-19T11:30:00.000Z", message: "ভিডিও", link: "https://bartaboard.com/s/v1", cards: [{ link: "https://bartaboard.com/s/v1", title: "ভিডিও", source: "সময় টিভি" }] });
    const o = { site: "https://bartaboard.com", trial: true };
    const data = reviewButtons(d!, o).flat().map((b) => b.callback_data).filter(Boolean) as string[];
    assert.deepEqual(data.map((x) => x.split(":")[0]), ["approve", "reject", "skip"]);
    assert.ok(data.every((x) => new TextEncoder().encode(x).length <= 64));
    assert.match(reviewText(d!, o), /17:30 · a video/);
    assert.match(reviewText(d!, o), /Trial run/);
    const a = await approve({ db, actor: "telegram", fb: null }, d!.id, d!.version);
    assert.match(reviewText(a, { ...o, trial: false }), /Approved here: goes out at 17:30/);
    assert.deepEqual(reviewButtons(a, o).flat().map((b) => b.callback_data?.split(":")[0] ?? "url"), ["reopen", "reject", "url"]);
  });

  await test("a carousel's cards can be removed, added and swapped; Facebook's payload follows", async () => {
    const pic = (n: number) => `https://img.example/${n}.jpg`;
    const c = (n: number) => ({ link: `https://bartaboard.com/s/261019-${n}`, title: `শিরোনাম ${n}`, source: `উৎস ${n}`, picture: pic(n), key: `key${n}`, sourceId: `src${n}` });
    const slot3 = ahead(4);
    const p = await insertPost(db, {
      kind: "slot", content: "headlines", status: "draft", slot: slot3, scheduledAt: slot3, message: "x",
      params: { message: "x", link: "https://bartaboard.com/bn/", child_attachments: JSON.stringify([1, 2, 3, 4, 5].map((n) => ({ link: c(n).link }))) },
      cards: [1, 2, 3, 4, 5].map(c), record: { ...record, slot: slot3, at: slot3, keys: ["key1", "key2"] },
    });
    // Remove card 2, add a new one at the end.
    const e = await edit(ctx, p!.id, 1, { cards: [c(1), c(3), c(4), c(5), c(9)], message: "নতুন" });
    assert.deepEqual(e.cards.map((x) => x.title), ["শিরোনাম 1", "শিরোনাম 3", "শিরোনাম 4", "শিরোনাম 5", "শিরোনাম 9"]);
    const children = JSON.parse(e.params.child_attachments) as Record<string, string>[];
    assert.deepEqual(children[4], { link: c(9).link, name: "শিরোনাম 9", description: "উৎস 9", picture: pic(9) });
    assert.ok(e.record!.keys.includes("key9") && e.record!.keys.includes("key2"));
    assert.ok(e.locked && e.edited);
    // Down to two is allowed; one, or a card without a picture, or a link off the site, is not.
    const two = await edit(ctx, p!.id, e.version, { cards: [c(1), c(9)] });
    assert.equal(two.cards.length, 2);
    await assert.rejects(edit(ctx, p!.id, two.version, { cards: [c(1)] }), ActionError);
    await assert.rejects(edit(ctx, p!.id, two.version, { cards: [c(1), { ...c(2), picture: undefined }] }), /picture/);
    await assert.rejects(edit(ctx, p!.id, two.version, { cards: [c(1), { ...c(2), link: "https://evil.example/x" }] }), /bartaboard\.com/);
  });

  await test("one headline or video from the site becomes its own approved post", async () => {
    const card = { link: "https://bartaboard.com/s/youtu.be/abc123", title: "ভিডিও খবর", source: "সময় টিভি", key: "abc123", sourceId: "somoy" };
    const p = await createFromItem(ctx, { card, content: "video" });
    assert.equal(p.status, "approved");
    assert.equal(p.kind, "manual");
    assert.equal(p.content, "video");
    assert.equal(p.message, "ভিডিও খবর\n\nসময় টিভি");
    assert.equal(p.params.link, card.link);
    assert.deepEqual(p.record?.keys, ["abc123"]);
    assert.ok(p.record?.slot === undefined);
    await assert.rejects(createFromItem(ctx, { card: { ...card, link: "https://youtube.com/watch?v=x" }, content: "video" }), ActionError);
  });

  await test("edits close 5 minutes before a post goes out; approving and skipping don't", async () => {
    const soon = new Date(Date.now() + 4 * 60_000).toISOString();
    const later = new Date(Date.now() + 6 * 60_000).toISOString();
    assert.ok(!editable(soon, 5) && editable(later, 5) && editable(soon, 0));
    const p = await createManual(ctx, { message: "x", scheduledAt: later });
    const e = await edit(ctx, p.id, p.version, { message: "y" });
    assert.equal(e.message, "y");
    await assert.rejects(edit(ctx, p.id, e.version, { scheduledAt: soon }), /at least 5 minutes from now/);
    const q = await createManual(ctx, { message: "x", scheduledAt: soon });
    await assert.rejects(edit(ctx, q.id, q.version, { message: "too late" }), (err: ActionError) => err.status === 409 && /editing closed/.test(err.message));
    assert.equal((await skip(ctx, q.id, q.version)).status, "skipped");
    // A longer or no lock, from the settings.
    await writeSetting(db, "editLockMinutes", 0, "panel:a@b");
    const r = await createManual(ctx, { message: "x", scheduledAt: soon });
    assert.equal((await edit(ctx, r.id, r.version, { message: "fine" })).message, "fine");
    await writeSetting(db, "editLockMinutes", 5, "panel:a@b");
    assert.equal(queueSettings({ editLockMinutes: 99 }).editLockMinutes, 5);
  });


  // Instagram (docs/instagram.md).

  await test("Instagram's heading is the Page's, at every hour", async () => {
    for (let h = 0; h < 24; h++) {
      const at = Date.parse(`2026-10-20T${String(h).padStart(2, "0")}:10:00Z`);
      assert.equal(headlinesHeading(at, 5), pageHeading(at, 5));
    }
  });

  await test("an Instagram caption lists the headlines, the site and the tags, within 2,200 characters", async () => {
    const at = Date.parse("2026-10-20T07:00:00Z");
    const cards = [1, 2, 3].map((n) => ({ link: `https://bartaboard.com/s/${n}`, title: `শিরোনাম ${n}`, source: `উৎস ${n}` }));
    const caption = instagramCaption(cards, at);
    assert.match(caption, /^দুপুরের শীর্ষ ৩ খবর\n\n১\. শিরোনাম 1 — উৎস 1/);
    assert.match(caption, /bartaboard\.com \(লিংক বায়োতে\)/);
    assert.match(caption, /#Bartaboard$/);
    assert.match(instagramCaption([cards[0]], at), /^শিরোনাম 1\n\nউৎস 1\n/);
    const long = instagramCaption(Array.from({ length: 9 }, (_, n) => ({ ...cards[0], title: "ক".repeat(400) + n })), at);
    assert.ok(long.length <= 2200 && long.endsWith("#Bartaboard"));
    const set = slideSetOf({ cards: [{ ...cards[0], section: "politics", outlets: 7 }, { ...cards[1], section: "other" }], scheduledAt: new Date(at).toISOString() });
    assert.deepEqual(set.cards.map((c) => c.section), ["রাজনীতি", undefined]);
    assert.equal(set.cards[0].outlets, 7);
    assert.deepEqual(instagramSlots(null).map((s) => s.time), IG_DEFAULT_TIMES);
    assert.ok(IG_DEFAULT_TIMES.length === 5 && instagramSlots(["09:00"]).every((s) => s.content === "headlines"));
  });

  await test("Instagram's times are a setting of their own: valid, sorted, without repeats", async () => {
    assert.equal(queueSettings({}).instagramTimes, null);
    assert.deepEqual(queueSettings({ instagramTimes: ["19:00", "08:30", "bad", "19:00", "25:00"] }).instagramTimes, ["08:30", "19:00"]);
    assert.equal(queueSettings({ instagramTimes: [] }).instagramTimes, null);
  });

  await test("Facebook and Instagram each hold a slot; each platform is live or on trial by its own runs", async () => {
    const at = ahead(9);
    const fbPost = await insertPost(db, { kind: "slot", content: "headlines", status: "draft", slot: at, scheduledAt: at });
    const igPost = await insertPost(db, { platform: "instagram", kind: "slot", content: "headlines", status: "draft", slot: at, scheduledAt: at });
    assert.ok(fbPost && igPost);
    assert.equal(await insertPost(db, { platform: "instagram", kind: "slot", content: "headlines", status: "draft", slot: at, scheduledAt: at }), null);
    assert.equal((await postForSlot(db, at, "instagram"))?.id, igPost.id);
    assert.ok(!(await listPosts(db, { from: at })).some((p) => p.platform === "instagram"));
    assert.ok((await listPosts(db, { platform: "instagram", from: at })).every((p) => p.platform === "instagram"));
    assert.ok((await listPosts(db, { platform: "any", from: at })).length >= 2);
    await recordRun(db, "queue", true, []);
    await recordRun(db, "instagram-dry", true, []);
    assert.equal(await queueLive(db, "facebook"), true);
    assert.equal(await queueLive(db, "instagram"), false);
    await recordRun(db, "instagram", true, []);
    assert.equal(await queueLive(db, "facebook"), true);
    assert.equal(await queueLive(db, "instagram"), true);
  });

  await test("an Instagram post's cards need no picture, up to nine; a change of cards or time asks for new pictures", async () => {
    const c = (n: number) => ({ link: `https://bartaboard.com/s/261020-${n}`, title: `শিরোনাম ${n}`, source: `উৎস ${n}`, key: `ig${n}` });
    const at = ahead(10);
    const images = JSON.stringify(["https://bartaboard.com/ig/abc-0.jpg", "https://bartaboard.com/ig/abc-1.jpg"]);
    const p = await insertPost(db, {
      platform: "instagram", kind: "slot", content: "headlines", status: "draft", slot: at, scheduledAt: at, message: "x",
      params: { message: "x", link: "https://bartaboard.com/bn/", child_attachments: "[]", images, imagesKey: "abc" },
      cards: [1, 2, 3].map(c), record: { ...record, slot: at, at },
    });
    const captioned = await edit(ctx, p!.id, p!.version, { message: "নতুন ক্যাপশন" });
    assert.equal(postImages(captioned).length, 2, "a new caption keeps the pictures");
    const e = await edit(ctx, p!.id, captioned.version, { cards: [c(1), c(3), c(4)] });
    assert.deepEqual(postImages(e), []);
    assert.equal(e.params.imagesKey, undefined);
    await assert.rejects(edit(ctx, p!.id, e.version, { cards: Array.from({ length: 10 }, (_, n) => c(n)) }), /2 to 9/);
    await assert.rejects(edit(ctx, p!.id, e.version, { message: "ক".repeat(2201) }), /2200/);
    assert.match(reviewText(e, { site: "https://bartaboard.com", trial: true }), /📸 Instagram/);
    assert.match(reviewText(e, { site: "https://bartaboard.com", trial: true }), /IG_POSTING=dry/);
    assert.match(reviewText(e, { site: "https://bartaboard.com", trial: true }), /pictures are drawn by the next run/);
    assert.equal(previewOf({ ...e, params: { ...e.params, images } }), "https://bartaboard.com/ig/abc-0.jpg");
  });

  await test("Instagram takes headlines from the board, not videos or text alone; its posts can't be taken down from here", async () => {
    const card = { link: "https://bartaboard.com/s/261020-x1", title: "একটি শিরোনাম", source: "প্রথম আলো", key: "x1", sourceId: "prothomalo", section: "politics" };
    const p = await createFromItem(ctx, { card, content: "news", platform: "instagram" });
    assert.equal(p.platform, "instagram");
    assert.match(p.message, /^একটি শিরোনাম\n\nপ্রথম আলো\n\n.*bartaboard\.com/);
    assert.ok(Date.parse(p.scheduledAt) > Date.now() + 15 * 60_000, "time for its picture to be drawn");
    await assert.rejects(createFromItem(ctx, { card, content: "video", platform: "instagram" }), /headlines only/);
    await assert.rejects(createManual(ctx, { message: "x", platform: "instagram" }), /pictures/);
    const posted = await updatePost(db, p.id, p.version, { status: "posting" }, "deploy");
    const done = await updatePost(db, p.id, posted.version, { status: "posted", fbPostId: "1789", permalink: "https://www.instagram.com/p/abc/" }, "deploy");
    assert.equal(done.permalink, "https://www.instagram.com/p/abc/");
    await assert.rejects(takeDown({ ...ctx, fb: { token: "t", pageId: "1" } }, done.id, done.version), /delete it there/);
  });

  await test("a picture is stored in parts and read back whole; old ones are pruned", async () => {
    const big = "A".repeat(MEDIA_PART * 2 + 17);
    await putMedia(db, "k1-0", big);
    assert.ok(await hasMedia(db, "k1-0"));
    assert.equal((await getMedia(db, "k1-0"))?.base64, big);
    await putMedia(db, "k1-0", "QUJD");
    assert.equal((await getMedia(db, "k1-0"))?.base64, "QUJD");
    assert.equal(await hasMedia(db, "nope"), false);
    assert.equal(await getMedia(db, "nope"), null);
    assert.equal(await pruneMedia(db, new Date(Date.now() + 1000).toISOString()), 1);
    assert.equal(await hasMedia(db, "k1-0"), false);
  });


  await test("an Instagram carousel is made in Instagram's three steps: pictures, carousel with caption, publish", async () => {
    const calls: { method: string; path: string; params: Record<string, string> }[] = [];
    const real = globalThis.fetch;
    let n = 0;
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      const u = new URL(String(url));
      const params = Object.fromEntries(init?.body ? new URLSearchParams(String(init.body)) : u.searchParams);
      const method = init?.method ?? "GET";
      calls.push({ method, path: u.pathname.replace(/^\/v[\d.]+/, ""), params });
      const body =
        params.fields === "access_token" ? { access_token: "PAGE" }
        : params.fields?.startsWith("instagram_business_account") ? { instagram_business_account: { id: "IG1", username: "bartaboard" } }
        : params.fields === "status_code,status" ? { status_code: "FINISHED" }
        : params.fields === "permalink" ? { permalink: "https://www.instagram.com/p/xyz/" }
        : u.pathname.endsWith("/media_publish") ? { id: "M1" }
        : { id: `C${++n}` };
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    try {
      const made = await publishToInstagram({ token: "SYS", pageId: "P1" }, { images: ["https://bartaboard.com/ig/a-0.jpg", "https://bartaboard.com/ig/a-1.jpg"], caption: "ক্যাপশন" });
      assert.equal(made.id, "M1");
      assert.equal(made.permalink, "https://www.instagram.com/p/xyz/");
      const posts = calls.filter((c) => c.method === "POST");
      assert.deepEqual(posts.map((c) => c.path), ["/IG1/media", "/IG1/media", "/IG1/media", "/IG1/media_publish"]);
      assert.deepEqual(posts[0].params, { access_token: "PAGE", image_url: "https://bartaboard.com/ig/a-0.jpg", is_carousel_item: "true" });
      assert.equal(posts[2].params.media_type, "CAROUSEL");
      assert.equal(posts[2].params.children, "C1,C2");
      assert.equal(posts[2].params.caption, "ক্যাপশন");
      assert.equal(posts[3].params.creation_id, "C3");
      await assert.rejects(publishToInstagram({ token: "SYS", pageId: "P1" }, { images: [], caption: "x" }), /1 to 10/);
    } finally {
      globalThis.fetch = real;
    }
  });

  console.log(`\n${passed} passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
