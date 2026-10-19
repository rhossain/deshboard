"use client";

import { useMemo, useState } from "react";
import { api, atDhakaTime, type Card, CONTENT_LABEL, dhakaDate, dhakaDay, dhakaTime, type QueueData, type SocialPost } from "./api";
import { ItemPicker } from "./ItemPicker";
import { singleMessage } from "./items";
import { PostCard } from "./PostCard";

const btn = "h-9 rounded-full border border-line px-3.5 text-[13px] font-semibold transition hover:bg-surface-2 active:scale-95 disabled:opacity-50";
const btnPrimary = "h-9 rounded-full bg-accent px-4 text-[13px] font-semibold text-accent-ink transition active:scale-95 disabled:opacity-50";

/** A slot's place in the day: the post holding it, or what will happen. */
type Row = { at: number; post: SocialPost; older: SocialPost[] } | { at: number; empty: { time: string; content: string } };

const HOLDING = ["draft", "approved", "posting", "posted", "skipped", "failed"];

function rowsFor(data: QueueData, now: number): Map<string, Row[]> {
  const days = new Map<string, Row[]>();
  const push = (row: Row) => {
    const day = dhakaDay(row.at);
    days.set(day, [...(days.get(day) ?? []), row]);
  };
  const today = dhakaDay(now);
  const tomorrow = dhakaDay(now + 86_400_000);
  const bySlot = new Map<string, SocialPost[]>();
  for (const p of data.posts) if (p.slot) bySlot.set(p.slot, [...(bySlot.get(p.slot) ?? []), p]);
  for (const day of [today, tomorrow]) {
    for (const s of data.slots) {
      const at = Date.parse(atDhakaTime(Date.parse(`${day}T12:00:00+06:00`), s.time));
      const posts = (bySlot.get(new Date(at).toISOString()) ?? []).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      bySlot.delete(new Date(at).toISOString());
      const live = posts.find((p) => HOLDING.includes(p.status)) ?? posts.find((p) => p.status === "dry") ?? posts[0];
      if (live) push({ at, post: live, older: posts.filter((p) => p !== live) });
      else push({ at, empty: s });
    }
  }
  // Breaking news, your own posts, and slot posts outside today's table (an older table, yesterday's late ones).
  for (const p of data.posts) {
    if (p.slot && !bySlot.has(p.slot)) continue;
    push({ at: Date.parse(p.scheduledAt), post: p, older: [] });
  }
  for (const rows of days.values()) rows.sort((a, b) => a.at - b.at);
  return new Map([...days].filter(([d]) => d >= today).sort(([a], [b]) => a.localeCompare(b)));
}

interface Props {
  data: QueueData;
  now: number;
  onChange: (post: SocialPost) => void;
  onError: (message: string) => void;
  onReload: () => void;
  onPause: (paused: boolean) => void;
}

export function QueueView({ data, now, onChange, onError, onReload, onPause }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showPast, setShowPast] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const days = useMemo(() => rowsFor(data, now), [data, now]);
  const lead = data.settings.draftLeadMinutes * 60_000;
  const chosen = data.posts.filter((p) => selected.has(p.id));

  async function bulk(action: string, extra?: Record<string, unknown>) {
    setBusy(true);
    try {
      const { results } = await api.bulk(action, chosen, extra);
      const failed = results.filter((r) => !r.ok);
      if (failed.length) onError(`${failed.length} of ${results.length} not done: ${failed[0].error}`);
      setSelected(new Set());
      onReload();
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 space-y-6">
      {!data.live && (
        <p className="rounded-2xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm">
          <strong>Trial run.</strong> The Page still posts the old way; the queue makes drafts and &ldquo;trial picks&rdquo; beside it, and posts nothing.
          Approving and editing work, so you can try them; switching on is one setting (FB_QUEUE=on).
        </p>
      )}
      {data.settings.paused && (
        <p className="rounded-2xl border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-danger">
          <strong>Posting is paused.</strong> Drafts are still made; nothing goes out, and posts whose time passes are skipped.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button className={data.settings.paused ? btnPrimary : btn} onClick={() => onPause(!data.settings.paused)}>
          {data.settings.paused ? "Resume posting" : "Pause posting"}
        </button>
        <button className={btn} onClick={() => setAdding((a) => !a)}>
          {adding ? "Close" : "Add a post"}
        </button>
        <button className={btn} onClick={() => setShowPast((s) => !s)}>
          {showPast ? "Hide earlier today" : "Show earlier today"}
        </button>
        <button className={btn} onClick={onReload}>
          Refresh
        </button>
      </div>

      {adding && <AddPost onDone={(p) => (onChange(p), setAdding(false))} onError={onError} />}

      {[...days].map(([day, rows]) => (
        <section key={day}>
          <h2 className="mb-3 font-display text-lg font-semibold">{dhakaDay(now) === day ? `Today, ${dhakaDate(now)}` : dhakaDate(Date.parse(`${day}T12:00:00+06:00`))}</h2>
          <div className="space-y-3">
            {rows
              .filter((r) => showPast || r.at > now - 2 * 3600_000 || ("post" in r && ["draft", "approved", "failed", "posting"].includes(r.post.status)))
              .map((r) =>
                "post" in r ? (
                  <div key={r.post.id}>
                    <PostCard
                      post={r.post}
                      now={now}
                      live={data.live}
                      lockMinutes={data.settings.editLockMinutes}
                      selected={selected.has(r.post.id)}
                      onSelect={(on) => setSelected((s) => (on ? new Set(s).add(r.post.id) : new Set([...s].filter((x) => x !== r.post.id))))}
                      onChange={onChange}
                      onError={onError}
                    />
                    {r.older.length > 0 && (
                      <p className="mt-1 px-2 text-xs text-muted">
                        Before this: {r.older.map((o) => `${o.status}${o.note ? ` (${o.note.replace(/^ · /, "").slice(0, 60)})` : ""}`).join(", ")}
                      </p>
                    )}
                  </div>
                ) : (
                  <EmptySlot key={r.at} at={r.at} now={now} lead={lead} content={r.empty.content} />
                ),
              )}
          </div>
        </section>
      ))}

      {chosen.length > 0 && (
        <div className="sticky bottom-[max(env(safe-area-inset-bottom),1rem)] z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface p-3 shadow-card">
          <span className="text-sm font-semibold">{chosen.length} selected</span>
          <button className={btnPrimary} disabled={busy} onClick={() => bulk("approve")}>
            Approve all
          </button>
          <button className={btn} disabled={busy} onClick={() => bulk("reject", { reason: "rejected in bulk" })}>
            Reject all
          </button>
          <button className={btn} disabled={busy} onClick={() => bulk("skip")}>
            Skip all
          </button>
          <button className={btn} disabled={busy} onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      )}
    </div>
  );
}

function EmptySlot({ at, now, lead, content }: { at: number; now: number; lead: number; content: string }) {
  const draftAt = at - lead;
  const text =
    now < draftAt
      ? `Draft at ${dhakaTime(draftAt)}`
      : now < at + 45 * 60_000
        ? "No draft yet: nothing passes the rules right now; the next run looks again"
        : "Nothing went out";
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-dashed border-line px-4 py-3 text-sm">
      <span className="font-display text-lg font-semibold tabular-nums text-muted">{dhakaTime(at)}</span>
      <span className="font-semibold text-muted">{CONTENT_LABEL[content] ?? content}</span>
      <span className="text-xs text-muted">{text}</span>
    </div>
  );
}

function AddPost({ onDone, onError }: { onDone: (p: SocialPost) => void; onError: (m: string) => void }) {
  const [mode, setMode] = useState<"pick" | "write">("pick");
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [time, setTime] = useState(() => dhakaTime(Date.now() + 30 * 60_000));
  const [chosen, setChosen] = useState<{ card: Card; content: "news" | "video" } | null>(null);
  const [busy, setBusy] = useState(false);

  function when(): string {
    const at = Date.parse(atDhakaTime(Date.now(), time));
    // A time earlier than now means tomorrow at that time.
    return new Date(at < Date.now() - 5 * 60_000 ? at + 86_400_000 : at).toISOString();
  }

  async function save() {
    setBusy(true);
    try {
      const scheduledAt = when();
      onDone(
        mode === "pick" && chosen
          ? await api.createFromItem({ card: chosen.card, content: chosen.content, message, scheduledAt })
          : await api.create({ message, link: link || undefined, scheduledAt }),
      );
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const tab = (m: "pick" | "write", label: string) => (
    <button
      onClick={() => setMode(m)}
      className={`h-8 rounded-full border px-3 text-[12px] font-semibold ${mode === m ? "border-accent bg-accent-soft text-accent" : "border-line"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-3 rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div className="flex gap-2">
        {tab("pick", "From the board")}
        {tab("write", "Write your own")}
      </div>

      {mode === "pick" && !chosen && (
        <ItemPicker
          kind="any"
          label="Choose"
          onPick={(card, item) => {
            setChosen({ card, content: item.kind === "video" ? "video" : "news" });
            setMessage(singleMessage(card));
          }}
          onClose={() => setMode("write")}
        />
      )}
      {mode === "pick" && chosen && (
        <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 p-2">
          {chosen.card.picture && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={chosen.card.picture} alt="" referrerPolicy="no-referrer" className="h-12 w-20 shrink-0 rounded-md object-cover" />
          )}
          <span lang="bn" className="min-w-0 flex-1 text-sm">
            <span className="line-clamp-2 font-semibold">{chosen.card.title}</span>
            <span className="text-xs text-muted">{chosen.card.source}</span>
          </span>
          <button className={btn} onClick={() => setChosen(null)}>
            Change
          </button>
        </div>
      )}

      {(mode === "write" || chosen) && (
        <>
          <textarea
            lang="bn"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            placeholder="What to say"
            className="w-full rounded-xl border border-line bg-surface-2 p-3 text-[15px] outline-none focus:border-accent"
          />
          {mode === "write" && (
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://bartaboard.com/… (optional)"
              className="h-10 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm outline-none focus:border-accent"
            />
          )}
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              At (Dhaka)
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-9 rounded-lg border border-line bg-surface-2 px-2" />
            </label>
            <button className={btnPrimary} disabled={busy || !message.trim()} onClick={save}>
              Add to the queue
            </button>
          </div>
          <p className="text-xs text-muted">It goes out at its time, as written; its link is checked just before.</p>
        </>
      )}
    </div>
  );
}
