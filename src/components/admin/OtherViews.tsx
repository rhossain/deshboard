"use client";

import { useEffect, useState } from "react";
import { api, CONTENT_LABEL, dhakaDate, dhakaTime, type Block, type Health, POLICY_LABEL, type Policy, type QueueSettings, type Slot, type SocialPost } from "./api";
import { StatusBadge } from "./PostCard";

const btn = "h-9 rounded-full border border-line px-3.5 text-[13px] font-semibold transition hover:bg-surface-2 active:scale-95 disabled:opacity-50";
const btnPrimary = "h-9 rounded-full bg-accent px-4 text-[13px] font-semibold text-accent-ink transition active:scale-95 disabled:opacity-50";
const box = "rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5";

export function HistoryView({ onError }: { onError: (m: string) => void }) {
  const [days, setDays] = useState(7);
  const [posts, setPosts] = useState<SocialPost[] | null>(null);
  const [filter, setFilter] = useState<"all" | "posted">("posted");

  useEffect(() => {
    let off = false;
    api
      .history(days)
      .then((h) => !off && setPosts(h.posts))
      .catch((e) => onError(e.message));
    return () => {
      off = true;
    };
  }, [days, onError]);

  const shown = (posts ?? []).filter((p) => filter === "all" || p.status === "posted");
  const counts = (posts ?? []).reduce<Record<string, number>>((n, p) => ((n[p.status] = (n[p.status] ?? 0) + 1), n), {});

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {[1, 3, 7, 30].map((d) => (
          <button
            key={d}
            className={d === days ? btnPrimary : btn}
            onClick={() => {
              setPosts(null);
              setDays(d);
            }}
          >
            {d === 1 ? "Today" : `${d} days`}
          </button>
        ))}
        <button className={btn} onClick={() => setFilter(filter === "all" ? "posted" : "all")}>
          {filter === "all" ? "Posted only" : "Everything"}
        </button>
      </div>
      {posts && (
        <p className="text-sm text-muted">
          {Object.entries(counts)
            .map(([s, n]) => `${n} ${s}`)
            .join(" · ") || "Nothing yet."}
        </p>
      )}
      {!posts && <p className="text-sm text-muted">Loading…</p>}
      <ol className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        {shown.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-4 py-3 first:border-t-0">
            <span className="w-24 shrink-0 text-xs tabular-nums text-muted">
              {dhakaDate(p.scheduledAt)} {dhakaTime(p.scheduledAt)}
            </span>
            <span className="w-20 shrink-0 text-xs font-semibold">{CONTENT_LABEL[p.content] ?? p.content}</span>
            <StatusBadge status={p.status} />
            <span lang="bn" className="min-w-0 flex-1 truncate text-sm">
              {p.cards[0]?.title || p.message.split("\n")[0]}
            </span>
            {p.fbPostId && (
              <a className="text-xs font-semibold text-accent hover:underline" href={`https://www.facebook.com/${p.fbPostId}`} target="_blank" rel="noreferrer">
                {p.removedAt ? "taken down" : "on Facebook ↗"}
              </a>
            )}
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted">Reach and clicks per post arrive here once the Page token can read Page Insights.</p>
    </div>
  );
}

const CONTENTS: Slot["content"][] = ["headlines", "news", "video", "roundup"];

export function SettingsView({
  settings,
  slots,
  blocks,
  onSaved,
  onError,
  onBlocksChanged,
}: {
  settings: QueueSettings;
  slots: Slot[];
  blocks: Block[];
  onSaved: (s: QueueSettings) => void;
  onError: (m: string) => void;
  onBlocksChanged: () => void;
}) {
  const [draft, setDraft] = useState<QueueSettings>(settings);
  const [table, setTable] = useState<Slot[]>(settings.slots ?? slots);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const sorted = [...table].filter((s) => /^\d\d:\d\d$/.test(s.time)).sort((a, b) => a.time.localeCompare(b.time));
      const sameAsDefault = JSON.stringify(sorted) === JSON.stringify(slots) && !settings.slots;
      onSaved(await api.settings({ ...draft, slots: sameAsDefault ? null : sorted }));
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const policySelect = (value: Policy, set: (p: Policy) => void) => (
    <select value={value} onChange={(e) => set(e.target.value as Policy)} className="h-9 rounded-lg border border-line bg-surface-2 px-2 text-sm">
      {(Object.keys(POLICY_LABEL) as Policy[]).map((p) => (
        <option key={p} value={p}>
          {POLICY_LABEL[p]}
        </option>
      ))}
    </select>
  );

  return (
    <div className="mt-6 space-y-5">
      <section className={box}>
        <h2 className="font-display text-lg font-semibold">How posts go out</h2>
        <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="font-semibold">Slot drafts nobody touched</span>
            {policySelect(draft.slotPolicy, (slotPolicy) => setDraft({ ...draft, slotPolicy }))}
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-semibold">Breaking news</span>
            {policySelect(draft.breakingPolicy, (breakingPolicy) => setDraft({ ...draft, breakingPolicy }))}
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-semibold">Draft each slot this long ahead</span>
            <select
              value={draft.draftLeadMinutes}
              onChange={(e) => setDraft({ ...draft, draftLeadMinutes: Number(e.target.value) })}
              className="h-9 rounded-lg border border-line bg-surface-2 px-2"
            >
              {[30, 45, 60, 90, 120].map((m) => (
                <option key={m} value={m}>
                  {m < 60 ? `${m} minutes` : `${m / 60} hour${m > 60 ? "s" : ""}`}
                </option>
              ))}
            </select>
            <span className="text-xs text-muted">Headlines are only picked while still being reported, so earlier drafts change more before their time.</span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-semibold">Lock edits before a post goes out</span>
            <select
              value={draft.editLockMinutes}
              onChange={(e) => setDraft({ ...draft, editLockMinutes: Number(e.target.value) })}
              className="h-9 rounded-lg border border-line bg-surface-2 px-2"
            >
              {[0, 5, 10, 15].map((m) => (
                <option key={m} value={m}>
                  {m === 0 ? "No lock (until it goes)" : `${m} minutes before`}
                </option>
              ))}
            </select>
            <span className="text-xs text-muted">From then the picker stops refreshing it too: what you see is what goes out. Reject and skip stay open.</span>
          </label>
          <label className="flex items-center gap-2 self-start pt-6">
            <input type="checkbox" checked={draft.paused} onChange={(e) => setDraft({ ...draft, paused: e.target.checked })} />
            <span className="font-semibold">Posting paused</span>
          </label>
        </div>
      </section>

      <section className={box}>
        <h2 className="font-display text-lg font-semibold">The day&rsquo;s slots (Dhaka time)</h2>
        <ol className="mt-4 space-y-2">
          {table.map((s, i) => (
            <li key={i} className="flex items-center gap-2">
              <input
                type="time"
                value={s.time}
                onChange={(e) => setTable(table.map((x, j) => (j === i ? { ...x, time: e.target.value } : x)))}
                className="h-9 rounded-lg border border-line bg-surface-2 px-2 text-sm"
              />
              <select
                value={s.content}
                onChange={(e) => setTable(table.map((x, j) => (j === i ? { ...x, content: e.target.value as Slot["content"] } : x)))}
                className="h-9 rounded-lg border border-line bg-surface-2 px-2 text-sm"
              >
                {CONTENTS.map((c) => (
                  <option key={c} value={c}>
                    {CONTENT_LABEL[c]}
                  </option>
                ))}
              </select>
              <button className="h-9 w-9 rounded-full border border-line text-sm" onClick={() => setTable(table.filter((_, j) => j !== i))} aria-label="Remove slot">
                ×
              </button>
            </li>
          ))}
        </ol>
        <div className="mt-3 flex gap-2">
          <button className={btn} onClick={() => setTable([...table, { time: "12:00", content: "headlines" }])}>
            Add a slot
          </button>
          <button className={btn} onClick={() => setTable(slots)}>
            Back to the default
          </button>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button className={btnPrimary} disabled={busy} onClick={save}>
          Save settings
        </button>
      </div>

      <section className={box}>
        <h2 className="font-display text-lg font-semibold">Left out for now</h2>
        <p className="mt-1 text-sm text-muted">What rejections asked the picker to leave out, until when.</p>
        {blocks.length === 0 && <p className="mt-3 text-sm text-muted">Nothing.</p>}
        <ul className="mt-3 space-y-2">
          {blocks.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm">
              <span className="font-semibold">{b.type}</span>
              <span lang="bn" className="min-w-0 flex-1 truncate text-muted">
                {typeof b.value === "string" ? b.value : `${b.value.keys.length} headlines${b.value.words.length ? ` · ${b.value.words.slice(0, 4).join(" ")}` : ""}`}
                {b.reason ? ` — ${b.reason}` : ""}
              </span>
              <span className="text-xs text-muted">{b.until ? `until ${dhakaDate(b.until)} ${dhakaTime(b.until)}` : "for good"}</span>
              <button
                className={btn}
                onClick={() =>
                  api
                    .unblock(b.id)
                    .then(onBlocksChanged)
                    .catch((e) => onError(e.message))
                }
              >
                Lift
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function HealthView({ onError }: { onError: (m: string) => void }) {
  const [health, setHealth] = useState<Health | null>(null);
  useEffect(() => {
    api
      .health()
      .then(setHealth)
      .catch((e) => onError(e.message));
  }, [onError]);
  if (!health) return <p className="mt-6 text-sm text-muted">Loading…</p>;
  const stale = health.lastRunMinutesAgo === null || health.lastRunMinutesAgo > 35;
  const item = (ok: boolean, title: string, text: string) => (
    <li className="flex items-start gap-3 border-t border-line px-4 py-3 first:border-t-0">
      <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${ok ? "bg-accent" : "bg-danger"}`} />
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted">{text}</p>
      </div>
    </li>
  );
  return (
    <div className="mt-6 space-y-5">
      <ul className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        {item(!stale, "The deploy's runs", health.lastRunMinutesAgo === null ? "No run recorded yet." : `Last run ${health.lastRunMinutesAgo} minutes ago (every 15 minutes).`)}
        {item(true, "Mode", health.live ? "Live: the queue posts to the Page." : "Trial: the Page posts the old way; the queue runs beside it and posts nothing.")}
        {item(health.facebook.ok, "Facebook", health.facebook.ok ? `The token can post to ${health.facebook.page}.` : `Not working: ${health.facebook.error}`)}
        {item(health.telegram, "Telegram", health.telegram ? "Drafts and alerts go to your Telegram (@bartaboard_bot)." : "Not set up.")}
      </ul>
      <section className={box}>
        <h2 className="font-display text-lg font-semibold">Recent runs</h2>
        <ol className="mt-3 space-y-3">
          {health.runs.map((r, i) => (
            <li key={i} className="text-sm">
              <p className="font-semibold">
                {dhakaDate(r.at)} {dhakaTime(r.at)} · {r.step} {r.ok ? "" : "· failed"}
              </p>
              <ul className="mt-1 list-disc pl-5 text-xs text-muted">
                {(Array.isArray(r.summary) ? (r.summary as string[]) : []).map((l, j) => (
                  <li key={j} lang="bn">
                    {l}
                  </li>
                ))}
                {Array.isArray(r.summary) && r.summary.length === 0 && <li>nothing to do</li>}
              </ul>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
