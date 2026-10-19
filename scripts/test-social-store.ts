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
import { DEFAULT_SETTINGS, queueSettings } from "../src/lib/social-settings";
import { ActionError, approve, createFromItem, createManual, edit, postNow, reject, reopen, skip } from "../src/lib/social-actions";
import { getPost, recordRun } from "../src/lib/social-store";
import { reviewButtons, reviewText } from "../src/lib/telegram-review";

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
    const lead = 60 * 60_000;
    assert.deepEqual(slotsToDraft(t - 61 * 60_000, slots, lead), []);
    assert.deepEqual(slotsToDraft(t - 60 * 60_000, slots, lead).map((s) => s.time), ["16:00"]);
    assert.deepEqual(slotsToDraft(t + 31 * 60_000, slots, lead).map((s) => s.time), ["16:00", "17:30"]);
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
    assert.equal(s.draftLeadMinutes, 60);
    assert.deepEqual(s.slots, [{ time: "08:00", content: "video" }]);
  });

  // What a person can do (src/lib/social-actions.ts).
  const ctx = { db, actor: "panel:a@b", fb: null };
  const slot2 = "2026-10-19T13:00:00.000Z";
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
    const slot3 = "2026-10-19T16:30:00.000Z";
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

  console.log(`\n${passed} passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
