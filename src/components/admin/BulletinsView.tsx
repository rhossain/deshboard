"use client";

import { useCallback, useEffect, useState } from "react";
import { bulletinLockAt, type BulletinStory, type BulletinVisual, draftStory, MAX_SCRIPT_CHARS, MAX_STORIES } from "@/lib/bulletin";
import { pickBulletin } from "@/lib/bulletin-pick";
import type { Bulletin, BulletinStatus } from "@/lib/bulletin-store";
import { CATEGORIES } from "@/lib/categories";
import { DATA_DIR, type PackedFeed, unpackFeed } from "@/lib/packed";
import { pageStories } from "@/lib/page-posts";
import { api, atDhakaTime, type BulletinsData, dhakaDate, dhakaTime, type QueueSettings, relative } from "./api";

const btn = "h-9 rounded-full border border-line px-3.5 text-[13px] font-semibold transition hover:bg-surface-2 active:scale-95 disabled:opacity-50";
const btnPrimary = "h-9 rounded-full bg-accent px-4 text-[13px] font-semibold text-accent-ink transition active:scale-95 disabled:opacity-50";
const btnSmall = "h-7 rounded-full border border-line px-2.5 text-[12px] font-semibold transition hover:bg-surface-2 disabled:opacity-40";
const field = "w-full rounded-xl border border-line bg-background px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-70";
const label = "text-[11px] font-semibold uppercase tracking-wide text-muted";

const SECTION = new Map(CATEGORIES.map((c) => [c.id, c.bn]));
const GRAPHIC: Record<BulletinVisual["type"], string> = { number: "Figure", quote: "Quote", versus: "Match", points: "Key points" };
const STATUS: Record<BulletinStatus, { text: string; tone: string }> = {
  draft: { text: "Draft", tone: "border-line text-foreground" },
  approved: { text: "Approved", tone: "border-accent bg-accent-soft text-accent" },
  rendering: { text: "Being made", tone: "border-accent bg-accent-soft text-accent" },
  ready: { text: "Ready", tone: "border-accent bg-accent-soft text-accent" },
  posting: { text: "Posting", tone: "border-accent bg-accent-soft text-accent" },
  posted: { text: "Posted", tone: "border-accent bg-accent-soft text-accent" },
  dry: { text: "Preview sent", tone: "border-line text-muted" },
  rejected: { text: "Rejected", tone: "border-line text-muted" },
  skipped: { text: "Skipped", tone: "border-line text-muted" },
  failed: { text: "Failed", tone: "border-danger bg-danger-soft text-danger" },
};

interface Props {
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}

/** Whether its stories can still be changed: a draft or approved one, and for the table's, until the lock. */
function editable(b: Bulletin, lockMinutes: number, now: number): boolean {
  if (b.status !== "draft" && b.status !== "approved") return false;
  return b.kind === "manual" || now < bulletinLockAt(Date.parse(b.scheduledAt), lockMinutes);
}

function stateLine(b: Bulletin, lockMinutes: number, live: boolean): string {
  const lock = dhakaTime(bulletinLockAt(Date.parse(b.scheduledAt), lockMinutes));
  switch (b.status) {
    case "draft":
      if (b.kind === "manual") return b.locked ? "Made by hand. Its video is made once you approve it." : "Made by hand. Its scripts are being written and arrive with the next run, within 15 minutes.";
      return `Approve by ${lock} or it is skipped. Editable until then.`;
    case "approved":
      return b.kind === "manual" ? "Approved. Its video is made on the next run, within 15 minutes." : `Approved. Its video is made at ${lock}.`;
    case "rendering":
      return "The voice and the video are being made (about ten minutes).";
    case "ready":
      return `The video is on Facebook, scheduled for ${dhakaTime(b.scheduledAt)}. Stop it before then if it shouldn't go out.`;
    case "posting":
      return "Being posted.";
    case "posted":
      return "Posted to the Page.";
    case "dry":
      return live ? "Made and sent to Telegram as a preview; it was not posted." : "Made and sent to Telegram as a preview. Trial: nothing was posted.";
    case "rejected":
      return "Rejected.";
    case "skipped":
      return b.note?.startsWith("Not made") ? "Skipped." : b.decidedBy === "auto" ? "Skipped: nobody approved it in time." : "Skipped.";
    case "failed":
      return b.error ?? "It failed; see the run.";
  }
}

/** The graphic's text, by its kind. What isn't listed (a match's sides and facts) is kept as it is. */
function GraphicFields({ visual, disabled, onChange }: { visual: BulletinVisual; disabled: boolean; onChange: (v: BulletinVisual) => void }) {
  const input = (value: string, set: (v: string) => void, placeholder: string) => (
    <input className={field} value={value} disabled={disabled} placeholder={placeholder} onChange={(e) => set(e.target.value)} />
  );
  if (visual.type === "number") {
    return (
      <div className="grid gap-2 sm:grid-cols-3">
        {input(visual.label, (label) => onChange({ ...visual, label }), "What the figure is")}
        {input(String(visual.value), (v) => onChange({ ...visual, value: v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : v }), "The figure")}
        {input(visual.unit, (unit) => onChange({ ...visual, unit }), "Unit")}
      </div>
    );
  }
  if (visual.type === "quote") {
    return (
      <div className="grid gap-2 sm:grid-cols-[2fr_1fr]">
        {input(visual.text, (text) => onChange({ ...visual, text }), "The quotation")}
        {input(visual.by, (by) => onChange({ ...visual, by }), "Who said it")}
      </div>
    );
  }
  if (visual.type === "versus") {
    return (
      <div className="space-y-2">
        {input(visual.title, (title) => onChange({ ...visual, title }), "Match and place")}
        <p className="text-xs text-muted">
          {visual.a.name} vs {visual.b.name}
          {visual.facts?.length ? ` · ${visual.facts.map((f) => `${f.k}: ${f.v}`).join(" · ")}` : ""}
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {input(visual.title ?? "", (title) => onChange({ ...visual, title: title || undefined }), "Heading")}
      <textarea
        className={`${field} min-h-[4.5rem]`}
        value={visual.items.join("\n")}
        disabled={disabled}
        placeholder="Two or three short facts, one a line"
        onChange={(e) => onChange({ ...visual, items: e.target.value.split("\n").slice(0, 3) })}
      />
    </div>
  );
}

function StoryEditor({
  story,
  index,
  count,
  disabled,
  onChange,
  onMove,
  onRemove,
}: {
  story: BulletinStory;
  index: number;
  count: number;
  disabled: boolean;
  onChange: (s: BulletinStory) => void;
  onMove: (by: number) => void;
  onRemove: () => void;
}) {
  const words = story.script.trim() ? story.script.trim().split(/\s+/).length : 0;
  return (
    <li className="rounded-2xl border border-line bg-background p-3 sm:p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[13px] font-bold text-accent">{index + 1}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold text-muted">
            {SECTION.get(story.section) ?? story.section} · {story.source}
            {story.more ? ` +${story.more}` : ""}
          </p>
          <a href={story.link} target="_blank" rel="noreferrer" className="block text-[15px] font-semibold leading-snug hover:underline">
            {story.headline}
          </a>
        </div>
        {!disabled && (
          <div className="flex shrink-0 gap-1">
            <button type="button" className={btnSmall} disabled={index === 0} onClick={() => onMove(-1)} aria-label="Move up">
              ↑
            </button>
            <button type="button" className={btnSmall} disabled={index === count - 1} onClick={() => onMove(1)} aria-label="Move down">
              ↓
            </button>
            <button type="button" className={btnSmall} disabled={count <= 1} onClick={onRemove} aria-label="Remove this story">
              ✕
            </button>
          </div>
        )}
      </div>
      <div className="mt-3 space-y-3">
        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <span className={label}>Script (what the voice says)</span>
            <span className={`text-[11px] ${words > 34 || story.script.length > MAX_SCRIPT_CHARS ? "font-semibold text-danger" : "text-muted"}`}>
              {words} words · {story.script.length}/{MAX_SCRIPT_CHARS}
            </span>
          </div>
          <textarea
            className={`${field} min-h-[5.5rem] text-[15px] leading-relaxed`}
            value={story.script}
            disabled={disabled}
            maxLength={MAX_SCRIPT_CHARS}
            onChange={(e) => onChange({ ...story, script: e.target.value })}
          />
        </div>
        <div>
          <span className={`${label} mb-1 block`}>Line in the headline list</span>
          <input className={field} value={story.short} disabled={disabled} maxLength={120} onChange={(e) => onChange({ ...story, short: e.target.value })} />
        </div>
        <div>
          <span className={`${label} mb-1 block`}>Graphic: {GRAPHIC[story.visual.type]}</span>
          <div className="">
            <GraphicFields visual={story.visual} disabled={disabled} onChange={(visual) => onChange({ ...story, visual })} />
          </div>
        </div>
      </div>
    </li>
  );
}

function BulletinCard({ bulletin, settings, live, now, onChange, onError }: { bulletin: Bulletin; settings: QueueSettings; live: boolean; now: number; onChange: (b: Bulletin) => void; onError: (m: string) => void }) {
  const [stories, setStories] = useState(bulletin.stories);
  const [busy, setBusy] = useState<string | null>(null);
  const upcoming = Date.parse(bulletin.scheduledAt) > now - 3600_000;
  const [open, setOpen] = useState(upcoming && ["draft", "approved", "failed"].includes(bulletin.status));
  const canEdit = editable(bulletin, settings.bulletinLockMinutes, now) && (bulletin.kind === "slot" || bulletin.locked);
  const dirty = JSON.stringify(stories) !== JSON.stringify(bulletin.stories);
  const status = STATUS[bulletin.status];

  // The server's copy changed (a run, Telegram, another tab) while nothing here was being edited.
  const [seen, setSeen] = useState(bulletin.version);
  if (seen !== bulletin.version) {
    setSeen(bulletin.version);
    setStories(bulletin.stories);
  }

  async function run(name: string, fn: () => Promise<Bulletin>) {
    setBusy(name);
    try {
      onChange(await fn());
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  const clean = () => stories.map((s) => (s.visual.type === "points" ? { ...s, visual: { ...s.visual, items: s.visual.items.map((x) => x.trim()).filter(Boolean) } } : s));
  const save = () => run("save", () => api.editBulletin(bulletin, { stories: clean() }));
  const act = (action: string) => run(action, () => api.bulletinAction(bulletin, action));

  return (
    <article className="rounded-3xl border border-line bg-surface p-4 shadow-card sm:p-5">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className="text-lg font-bold tabular-nums">{dhakaTime(bulletin.scheduledAt)}</h3>
        <span className="text-sm text-muted">
          {dhakaDate(bulletin.scheduledAt)} · {relative(bulletin.scheduledAt, now)}
          {bulletin.kind === "manual" ? " · made by hand" : ""}
        </span>
        <span className={`ml-auto rounded-full border px-2.5 py-0.5 text-[12px] font-semibold ${status.tone}`}>{status.text}</span>
      </header>
      <p className={`mt-2 text-sm ${bulletin.status === "failed" ? "text-danger" : "text-muted"}`}>{stateLine(bulletin, settings.bulletinLockMinutes, live)}</p>
      {bulletin.note && <p className="mt-2 rounded-xl bg-surface-2 px-3 py-2 text-[13px] text-muted">{bulletin.note}</p>}
      {bulletin.permalink && (
        <a className="mt-2 inline-block text-sm font-semibold text-accent hover:underline" href={bulletin.permalink} target="_blank" rel="noreferrer">
          Open on Facebook
        </a>
      )}

      <button type="button" className="mt-3 text-[13px] font-semibold text-accent" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? "Hide" : "Show"} the {bulletin.stories.length} {bulletin.stories.length === 1 ? "story" : "stories"}
        {bulletin.duration ? ` · ${Math.round(bulletin.duration)} s` : ""}
      </button>

      {open && (
        <ol className="mt-3 space-y-3">
          {stories.map((s, i) => (
            <StoryEditor
              key={`${s.key}-${i}`}
              story={s}
              index={i}
              count={stories.length}
              disabled={!canEdit || busy !== null}
              onChange={(next) => setStories((list) => list.map((x, j) => (j === i ? next : x)))}
              onMove={(by) =>
                setStories((list) => {
                  const next = [...list];
                  const [moved] = next.splice(i, 1);
                  next.splice(i + by, 0, moved);
                  return next;
                })
              }
              onRemove={() => setStories((list) => list.filter((_, j) => j !== i))}
            />
          ))}
        </ol>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {dirty && (
          <>
            <button type="button" className={btnPrimary} disabled={busy !== null} onClick={save}>
              {busy === "save" ? "Saving…" : "Save changes"}
            </button>
            <button type="button" className={btn} disabled={busy !== null} onClick={() => setStories(bulletin.stories)}>
              Discard
            </button>
          </>
        )}
        {!dirty && bulletin.status === "draft" && (bulletin.kind === "slot" || bulletin.locked) && (
          <>
            <button type="button" className={btnPrimary} disabled={busy !== null} onClick={() => act("approve")}>
              {busy === "approve" ? "Approving…" : "Approve"}
            </button>
            {bulletin.kind === "slot" && (
              <button type="button" className={btn} disabled={busy !== null} onClick={() => act("reject")} title="The next run drafts another, with other stories">
                Reject
              </button>
            )}
            <button type="button" className={btn} disabled={busy !== null} onClick={() => act("skip")}>
              {bulletin.kind === "slot" ? "Skip" : "Discard it"}
            </button>
          </>
        )}
        {!dirty && bulletin.status === "approved" && (
          <>
            <button type="button" className={btn} disabled={busy !== null} onClick={() => act("reopen")}>
              Back to draft
            </button>
            <button type="button" className={btn} disabled={busy !== null} onClick={() => act("skip")}>
              Skip
            </button>
          </>
        )}
        {bulletin.status === "ready" && (
          <button type="button" className={btn} disabled={busy !== null} onClick={() => act("stop")} title="Takes the scheduled video off Facebook">
            {busy === "stop" ? "Stopping…" : "Stop it"}
          </button>
        )}
        {!dirty && ["rejected", "skipped", "failed"].includes(bulletin.status) && upcoming && (
          <button type="button" className={btn} disabled={busy !== null} onClick={() => act("reopen")}>
            Reopen as a draft
          </button>
        )}
      </div>
      {dirty && bulletin.status === "approved" && <p className="mt-2 text-xs text-muted">Saving changed scripts takes the approval back: approve it again afterwards.</p>}
    </article>
  );
}

/** Stories for a new bulletin, picked in the browser from the board's own file as the run picks them. */
async function candidates(count: number): Promise<{ picks: BulletinStory[]; others: BulletinStory[] }> {
  const res = await fetch(`${DATA_DIR}/news.json`, { cache: "no-store" });
  if (!res.ok) throw new Error(`the board's headlines couldn't be loaded (${res.status})`);
  const feed = unpackFeed((await res.json()) as PackedFeed);
  const now = Date.now();
  const { picks, alternatives } = pickBulletin(pageStories(feed.results.flatMap((r) => r.items), now), { now, count });
  return { picks: picks.map(draftStory), others: alternatives.map(draftStory) };
}

function NewBulletin({ settings, onMade, onCancel, onError }: { settings: QueueSettings; onMade: (b: Bulletin) => void; onCancel: () => void; onError: (m: string) => void }) {
  const [pool, setPool] = useState<BulletinStory[] | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [when, setWhen] = useState<"now" | "time">("now");
  const [time, setTime] = useState("");
  const [write, setWrite] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    candidates(settings.bulletinStories)
      .then(({ picks, others }) => {
        setPool([...picks, ...others]);
        setChosen(picks.map((s) => s.key));
      })
      .catch((e) => {
        onError((e as Error).message);
        onCancel();
      });
    // Once, when the panel opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (key: string) => setChosen((list) => (list.includes(key) ? list.filter((k) => k !== key) : list.length < MAX_STORIES ? [...list, key] : list));

  async function create() {
    if (!pool) return;
    setBusy(true);
    try {
      let at: string | undefined;
      if (when === "time") {
        if (!/^\d\d:\d\d$/.test(time)) throw new Error("Choose a time.");
        const today = atDhakaTime(Date.now(), time);
        // A time already past today means tomorrow's.
        at = Date.parse(today) > Date.now() + 5 * 60_000 ? today : new Date(Date.parse(today) + 86_400_000).toISOString();
      }
      const stories = chosen.map((k) => pool.find((s) => s.key === k)).filter((s): s is BulletinStory => !!s);
      onMade(await api.createBulletin({ stories, at, write }));
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-3xl border border-accent/40 bg-surface p-4 shadow-card sm:p-5">
      <h3 className="text-base font-bold">New bulletin</h3>
      <p className="mt-1 text-sm text-muted">Outside the day&rsquo;s table: for now, or for any time you choose. These are the board&rsquo;s most covered fresh stories; tick up to {MAX_STORIES}, in the order you want them.</p>
      {!pool ? (
        <p className="mt-4 text-sm text-muted">Reading the board…</p>
      ) : pool.length === 0 ? (
        <p className="mt-4 text-sm text-muted">The board has no fresh story covered by three outlets right now.</p>
      ) : (
        <ul className="mt-4 space-y-1.5">
          {pool.map((s) => {
            const n = chosen.indexOf(s.key);
            return (
              <li key={s.key}>
                <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-3 py-2.5 ${n >= 0 ? "border-accent bg-accent-soft" : "border-line"}`}>
                  <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--accent)]" checked={n >= 0} onChange={() => toggle(s.key)} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold leading-snug">{s.headline}</span>
                    <span className="text-[12px] text-muted">
                      {SECTION.get(s.section) ?? s.section} · {s.source}
                      {s.more ? ` +${s.more}` : ""}
                    </span>
                  </span>
                  {n >= 0 && <span className="shrink-0 text-[12px] font-bold text-accent">{n + 1}</span>}
                </label>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <fieldset className="space-y-1.5 text-sm">
          <legend className={`${label} mb-1`}>When</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name="when" checked={when === "now"} onChange={() => setWhen("now")} /> As soon as it is approved
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="when" checked={when === "time"} onChange={() => setWhen("time")} /> At
            <input type="time" className="rounded-lg border border-line bg-background px-2 py-1" value={time} onFocus={() => setWhen("time")} onChange={(e) => setTime(e.target.value)} />
            <span className="text-muted">Dhaka</span>
          </label>
        </fieldset>
        <fieldset className="space-y-1.5 text-sm">
          <legend className={`${label} mb-1`}>Scripts</legend>
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1" checked={write} onChange={(e) => setWrite(e.target.checked)} />
            <span>
              Have the scripts written from the articles
              <span className="block text-xs text-muted">{write ? "They arrive with the next run, within 15 minutes; then you edit and approve." : "The scripts start as the headlines, for you to write now."}</span>
            </span>
          </label>
        </fieldset>
      </div>
      <div className="mt-4 flex gap-2">
        <button type="button" className={btnPrimary} disabled={busy || !pool || chosen.length === 0} onClick={create}>
          {busy ? "Making…" : `Make the bulletin (${chosen.length})`}
        </button>
        <button type="button" className={btn} disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  );
}

function BulletinSettings({ settings, onSaved, onError }: { settings: QueueSettings; onSaved: (s: QueueSettings) => void; onError: (m: string) => void }) {
  const [times, setTimes] = useState((settings.bulletinTimes ?? ["10:00", "16:00", "21:00"]).join(", "));
  const [lead, setLead] = useState(String(settings.bulletinLeadMinutes));
  const [lock, setLock] = useState(String(settings.bulletinLockMinutes));
  const [count, setCount] = useState(String(settings.bulletinStories));
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const list = times.split(/[,\s]+/).map((t) => (/^\d:\d\d$/.test(t) ? `0${t}` : t)).filter(Boolean);
      onSaved(await api.settings({ bulletinTimes: list, bulletinLeadMinutes: Number(lead), bulletinLockMinutes: Number(lock), bulletinStories: Number(count) }));
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const number = (value: string, set: (v: string) => void, min: number, max: number) => (
    <input type="number" className={field} value={value} min={min} max={max} onChange={(e) => set(e.target.value)} />
  );
  return (
    <details className="rounded-3xl border border-line bg-surface p-4 sm:p-5">
      <summary className="cursor-pointer text-sm font-semibold">Times and timing</summary>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className={`${label} mb-1 block`}>Bulletins a day (Dhaka, 24-hour, separated by commas)</span>
          <input className={field} value={times} onChange={(e) => setTimes(e.target.value)} />
        </label>
        <label>
          <span className={`${label} mb-1 block`}>Draft made, minutes before</span>
          {number(lead, setLead, 30, 360)}
        </label>
        <label>
          <span className={`${label} mb-1 block`}>Edits close, minutes before</span>
          {number(lock, setLock, 10, 60)}
        </label>
        <label>
          <span className={`${label} mb-1 block`}>Stories a bulletin</span>
          {number(count, setCount, 3, 6)}
        </label>
      </div>
      <p className="mt-3 text-xs text-muted">Edits always close at least ten minutes after the draft is made: the voice and the video need the rest. A value outside its range goes back to the usual one.</p>
      <button type="button" className={`${btnPrimary} mt-3`} disabled={busy} onClick={save}>
        {busy ? "Saving…" : "Save"}
      </button>
    </details>
  );
}

/**
 * The Bulletins tab (docs/bulletin.md): the day's video bulletins and those made by hand. A draft's scripts, headline
 * lines and graphics are edited here and signed off; the video is then made by the run and sent to Telegram. "New
 * bulletin" makes one outside the table, for now or for any time.
 */
export function BulletinsView({ onError, onNotice }: Props) {
  const [data, setData] = useState<BulletinsData | null>(null);
  const [making, setMaking] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(() => {
    api
      .bulletins()
      .then((d) => {
        setData(d);
        setNow(Date.now());
      })
      .catch((e) => onError((e as Error).message));
  }, [onError]);
  useEffect(() => {
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 60_000);
    return () => clearInterval(timer);
  }, [load]);

  if (!data) return <p className="text-sm text-muted">Loading the bulletins…</p>;
  const replace = (b: Bulletin) => setData((d) => (d ? { ...d, bulletins: d.bulletins.some((x) => x.id === b.id) ? d.bulletins.map((x) => (x.id === b.id ? b : x)) : [...d.bulletins, b] } : d));
  const ahead = data.bulletins.filter((b) => Date.parse(b.scheduledAt) > now - 3600_000 || ["draft", "approved", "rendering"].includes(b.status)).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const before = data.bulletins.filter((b) => !ahead.includes(b)).sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-muted">
        <span className="flex-1">
          {data.live ? "Bulletins are live: an approved one is posted to the Page at its time." : "Trial: bulletins are made and sent to Telegram as previews; nothing is posted to the Page."} A draft is made {data.settings.bulletinLeadMinutes} minutes
          before each time and must be approved {data.settings.bulletinLockMinutes} minutes before.
        </span>
        <button type="button" className={btn} onClick={load}>
          Refresh
        </button>
        {!making && (
          <button type="button" className={btnPrimary} onClick={() => setMaking(true)}>
            New bulletin
          </button>
        )}
      </div>

      {making && (
        <NewBulletin
          settings={data.settings}
          onError={onError}
          onCancel={() => setMaking(false)}
          onMade={(b) => {
            replace(b);
            setMaking(false);
            onNotice(b.locked ? "The bulletin is made: write its scripts, then approve it." : "The bulletin is made. Its scripts arrive with the next run, within 15 minutes.");
          }}
        />
      )}

      {ahead.length === 0 && !making && <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">No bulletin is waiting. The next draft appears an hour before its time, or make one now.</p>}
      {ahead.map((b) => (
        <BulletinCard key={b.id} bulletin={b} settings={data.settings} live={data.live} now={now} onChange={replace} onError={onError} />
      ))}

      {before.length > 0 && <h3 className="pt-2 text-sm font-semibold text-muted">Earlier</h3>}
      {before.map((b) => (
        <BulletinCard key={b.id} bulletin={b} settings={data.settings} live={data.live} now={now} onChange={replace} onError={onError} />
      ))}

      <BulletinSettings key={JSON.stringify(data.settings)} settings={data.settings} onSaved={(settings) => setData((d) => (d ? { ...d, settings } : d))} onError={onError} />
    </div>
  );
}
