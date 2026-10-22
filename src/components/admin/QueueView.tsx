"use client";

import { useMemo, useState } from "react";
import { api, atDhakaTime, CONTENT_LABEL, dhakaDate, dhakaDay, dhakaTime, type QueueData, type SocialPost } from "./api";
import { Composer } from "./Composer";
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

type Filter = "all" | "draft" | "approved" | "posted" | "failed" | "skipped";
const FILTERS: [Filter, string][] = [
  ["all", "All"],
  ["draft", "To review"],
  ["approved", "Approved"],
  ["posted", "Posted"],
  ["failed", "Failed"],
  ["skipped", "Skipped"],
];
const IN_FILTER: Record<Filter, string[]> = {
  all: [],
  draft: ["draft"],
  approved: ["approved", "posting"],
  posted: ["posted"],
  failed: ["failed"],
  skipped: ["skipped", "rejected", "dry"],
};

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
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState(false);
  const days = useMemo(() => rowsFor(data, now), [data, now]);
  // The run nearest before the lead makes the draft (src/lib/social-queue.ts RUN_SLACK_MS).
  const lead = data.settings.draftLeadMinutes * 60_000 + 5 * 60_000;
  const chosen = data.posts.filter((p) => selected.has(p.id));

  // Today at a glance.
  const today = dhakaDay(now);
  const counts = useMemo(() => {
    const n: Record<Filter, number> = { all: 0, draft: 0, approved: 0, posted: 0, failed: 0, skipped: 0 };
    for (const r of days.get(today) ?? []) {
      if (!("post" in r)) continue;
      n.all++;
      for (const f of FILTERS.map(([id]) => id)) if (f !== "all" && IN_FILTER[f].includes(r.post.status)) n[f]++;
    }
    return n;
  }, [days, today]);

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

  const shows = (r: Row) => {
    if (filter !== "all") return "post" in r && IN_FILTER[filter].includes(r.post.status);
    return showPast || r.at > now - 2 * 3600_000 || ("post" in r && ["draft", "approved", "failed", "posting"].includes(r.post.status));
  };

  const drafts = data.posts.filter((p) => p.status === "draft" && Date.parse(p.scheduledAt) > now - 45 * 60_000);

  return (
    <div className="space-y-5">
      {!data.live &&
        (data.platform === "instagram" ? (
          <p className="rounded-2xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm">
            <strong>Trial run.</strong> Instagram gets nothing yet: drafts and their pictures are made, and posts that come due become &ldquo;trial
            picks&rdquo;. Approving and editing work, so you can try them; switching on is one setting (IG_POSTING=on).
          </p>
        ) : (
          <p className="rounded-2xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm">
            <strong>Trial run.</strong> The Page still posts the old way; the queue makes drafts and &ldquo;trial picks&rdquo; beside it, and posts nothing.
            Approving and editing work, so you can try them; switching on is one setting (FB_QUEUE=on).
          </p>
        ))}
      {data.settings.paused && (
        <p className="rounded-2xl border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-danger">
          <strong>Posting is paused.</strong> Drafts are still made; nothing goes out, and posts whose time passes are skipped.
        </p>
      )}

      {/* Today at a glance: each count filters the list. */}
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-5 sm:px-0">
        {(
          [
            ["draft", "To review", counts.draft, "text-gold"],
            ["approved", "Approved", counts.approved, "text-accent"],
            ["posted", "Posted", counts.posted, "text-foreground"],
            ["failed", "Failed", counts.failed, counts.failed ? "text-danger" : "text-muted"],
            ["skipped", "Skipped", counts.skipped, "text-muted"],
          ] as [Filter, string, number, string][]
        ).map(([id, label, n, tone]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(filter === id ? "all" : id)}
            aria-pressed={filter === id}
            className={`min-w-[7rem] shrink-0 rounded-2xl border px-3 py-2.5 text-left transition sm:min-w-0 ${filter === id ? "border-accent bg-accent-soft/60" : "border-line bg-surface hover:bg-surface-2"}`}
          >
            <span className={`block font-display text-2xl font-semibold tabular-nums ${tone}`}>{n}</span>
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted">{label} today</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={adding ? btn : btnPrimary} onClick={() => setAdding((a) => !a)}>
          {adding ? "Close the new post" : "Add a post"}
        </button>
        <button type="button" className={data.settings.paused ? btnPrimary : btn} onClick={() => onPause(!data.settings.paused)}>
          {data.settings.paused ? "Resume posting" : "Pause posting"}
        </button>
        <button type="button" className={btn} onClick={() => setShowPast((s) => !s)} disabled={filter !== "all"}>
          {showPast ? "Hide earlier today" : "Show earlier today"}
        </button>
        <button type="button" className={btn} onClick={onReload}>
          Refresh
        </button>
        {drafts.length > 1 && (
          <button
            type="button"
            className={btn}
            onClick={() => setSelected(new Set(drafts.map((p) => p.id)))}
          >
            Select all {drafts.length} drafts
          </button>
        )}
      </div>

      {adding && <Composer platform={data.platform} onDone={(p) => (onChange(p), setAdding(false), setFilter("all"))} onError={onError} onClose={() => setAdding(false)} />}

      <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="group" aria-label="Show">
        {FILTERS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            aria-pressed={filter === id}
            className={`h-8 shrink-0 rounded-full border px-3 text-[12px] font-semibold transition ${filter === id ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:text-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {[...days].map(([day, rows]) => {
        const shown = rows.filter(shows);
        if (!shown.length && filter !== "all") return null;
        return (
          <section key={day}>
            <h2 className="mb-3 font-display text-lg font-semibold">{today === day ? `Today, ${dhakaDate(now)}` : dhakaDate(Date.parse(`${day}T12:00:00+06:00`))}</h2>
            {!shown.length && <p className="text-sm text-muted">Nothing here.</p>}
            <div className="space-y-3">
              {shown.map((r) =>
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
        );
      })}
      {filter !== "all" && ![...days.values()].some((rows) => rows.some(shows)) && <p className="text-sm text-muted">No {FILTERS.find(([id]) => id === filter)![1].toLowerCase()} posts today or tomorrow.</p>}

      {chosen.length > 0 && (
        <div className="sticky bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface p-3 shadow-card lg:bottom-4">
          <span className="text-sm font-semibold">{chosen.length} selected</span>
          <button type="button" className={btnPrimary} disabled={busy} onClick={() => bulk("approve")}>
            Approve all
          </button>
          <button type="button" className={btn} disabled={busy} onClick={() => bulk("reject", { reason: "rejected in bulk" })}>
            Reject all
          </button>
          <button type="button" className={btn} disabled={busy} onClick={() => bulk("skip")}>
            Skip all
          </button>
          <button type="button" className={btn} disabled={busy} onClick={() => setSelected(new Set())}>
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
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-dashed border-line px-4 py-3 text-sm">
      <span className="font-display text-lg font-semibold tabular-nums text-muted">{dhakaTime(at)}</span>
      <span className="font-semibold text-muted">{CONTENT_LABEL[content] ?? content}</span>
      <span className="basis-full text-xs text-muted sm:basis-auto">{text}</span>
    </div>
  );
}
