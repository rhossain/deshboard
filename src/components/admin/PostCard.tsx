"use client";

import { useState } from "react";
import { api, ApiError, atDhakaTime, type Card, CONTENT_LABEL, dhakaTime, POLICY_LABEL, relative, type Policy, type SocialPost } from "./api";
import { ItemPicker } from "./ItemPicker";
import { carouselMessage, singleMessage } from "./items";

const STATUS: Record<string, [string, string]> = {
  draft: ["Draft", "bg-gold/15 text-gold"],
  approved: ["Approved", "bg-accent-soft text-accent"],
  posting: ["Posting…", "bg-accent-soft text-accent"],
  posted: ["Posted", "bg-accent text-accent-ink"],
  rejected: ["Rejected", "bg-danger-soft text-danger"],
  skipped: ["Skipped", "bg-surface-2 text-muted"],
  failed: ["Failed", "bg-danger-soft text-danger"],
  dry: ["Trial pick", "bg-surface-2 text-muted"],
};

const OPEN = ["draft", "approved", "failed"];

const btn = "h-9 rounded-full border border-line px-3.5 text-[13px] font-semibold transition hover:bg-surface-2 active:scale-95 disabled:opacity-50";
const btnPrimary = "h-9 rounded-full bg-accent px-4 text-[13px] font-semibold text-accent-ink transition active:scale-95 disabled:opacity-50";
const btnDanger = "h-9 rounded-full border border-danger/40 px-3.5 text-[13px] font-semibold text-danger transition hover:bg-danger-soft active:scale-95 disabled:opacity-50";

export function StatusBadge({ status }: { status: string }) {
  const [label, style] = STATUS[status] ?? [status, "bg-surface-2 text-muted"];
  return <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${style}`}>{label}</span>;
}

interface Props {
  post: SocialPost;
  now: number;
  live: boolean;
  selected?: boolean;
  onSelect?: (on: boolean) => void;
  /** The post as it now is, after an action (or as the server has it, after a conflict). */
  onChange: (post: SocialPost) => void;
  onError: (message: string) => void;
}

type Mode = "view" | "edit" | "reject";

export function PostCard({ post, now, live, selected, onSelect, onChange, onError }: Props) {
  const [mode, setMode] = useState<Mode>("view");
  const [busy, setBusy] = useState(false);
  const open = OPEN.includes(post.status);
  const faded = ["rejected", "skipped", "dry"].includes(post.status) || !!post.removedAt;

  async function run(fn: () => Promise<SocialPost>, done?: () => void) {
    setBusy(true);
    try {
      onChange(await fn());
      done?.();
    } catch (err) {
      if (err instanceof ApiError && err.post) onChange(err.post);
      onError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const act = (action: string, extra?: Record<string, unknown>) => run(() => api.action(post, action, extra), () => setMode("view"));

  return (
    <article className={`rounded-2xl border bg-surface p-4 shadow-card sm:p-5 ${selected ? "border-accent" : "border-line"} ${faded ? "opacity-70" : ""}`}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {onSelect && open && (
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--accent)]"
            checked={!!selected}
            onChange={(e) => onSelect(e.target.checked)}
            aria-label="Select for a bulk action"
          />
        )}
        <span className="font-display text-xl font-semibold tabular-nums">{dhakaTime(post.scheduledAt)}</span>
        <span className="text-xs text-muted">{relative(post.scheduledAt, now)}</span>
        <span className="text-sm font-semibold">{CONTENT_LABEL[post.content] ?? post.content}</span>
        {post.kind === "breaking" && <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-semibold text-danger">Breaking</span>}
        <StatusBadge status={post.status} />
        {post.removedAt && <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-semibold text-danger">Taken down</span>}
        {post.status === "draft" && <span className="text-xs text-muted">{POLICY_LABEL[post.policy]}</span>}
        {post.status === "approved" && <span className="text-xs text-muted">Goes out at its time</span>}
        {post.edited && <span className="text-xs text-muted">· edited</span>}
      </header>

      {mode === "edit" ? (
        <EditForm post={post} busy={busy} onCancel={() => setMode("view")} onSave={(e) => run(() => api.edit(post, e), () => setMode("view"))} />
      ) : (
        <Preview post={post} />
      )}

      {post.error && <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-xs text-danger">Not posted: {post.error}</p>}
      {post.note && mode === "view" && <p className="mt-2 text-xs text-muted">{post.note.replace(/^ · /, "")}</p>}

      {mode === "reject" && <RejectForm busy={busy} onCancel={() => setMode("view")} onReject={(opts) => act("reject", opts)} />}

      {mode === "view" && (
        <div className="mt-4 flex flex-wrap gap-2">
          {post.status === "draft" && (
            <button className={btnPrimary} disabled={busy} onClick={() => act("approve")}>
              Approve
            </button>
          )}
          {post.status === "failed" && (
            <button className={btnPrimary} disabled={busy} onClick={() => act("approve")}>
              Try again
            </button>
          )}
          {open && (
            <button className={btn} disabled={busy} onClick={() => setMode("edit")}>
              Edit
            </button>
          )}
          {post.status === "draft" && (
            <button className={btnDanger} disabled={busy} onClick={() => setMode("reject")}>
              Reject…
            </button>
          )}
          {open && (
            <button className={btn} disabled={busy} onClick={() => act("skip")}>
              Skip slot
            </button>
          )}
          {open && live && (
            <button
              className={btn}
              disabled={busy}
              onClick={() => {
                if (confirmText(`Post this to the Facebook Page now?`)) act("post-now");
              }}
            >
              Post now
            </button>
          )}
          {(["approved", "rejected", "skipped"].includes(post.status) || (post.status === "draft" && post.locked)) && (
            <button className={btn} disabled={busy} onClick={() => act("reopen")}>
              {post.status === "approved" || post.status === "draft" ? "Back to the picker" : "Undo"}
            </button>
          )}
          {post.status === "posted" && post.fbPostId && (
            <a className={`${btn} inline-flex items-center`} href={`https://www.facebook.com/${post.fbPostId}`} target="_blank" rel="noreferrer">
              View on Facebook ↗
            </a>
          )}
          {post.status === "posted" && post.fbPostId && !post.removedAt && (
            <button
              className={btnDanger}
              disabled={busy}
              onClick={() => {
                if (confirmText("Take this post down from the Facebook Page? This can't be undone.")) act("take-down");
              }}
            >
              Take down
            </button>
          )}
        </div>
      )}
    </article>
  );
}

/** window.confirm, kept in one place (some embedded browsers have none: they go ahead). */
function confirmText(text: string): boolean {
  return typeof window.confirm === "function" ? window.confirm(text) : true;
}

function Preview({ post }: { post: SocialPost }) {
  const carousel = post.cards.length > 1;
  return (
    <div className="mt-3">
      <p lang="bn" className="whitespace-pre-line text-[15px] leading-relaxed">
        {post.message || <span className="text-muted">(no text)</span>}
      </p>
      {carousel ? (
        <ol className="-mx-1 mt-3 flex snap-x gap-2.5 overflow-x-auto px-1 pb-1">
          {post.cards.map((c, i) => (
            <li key={`${c.link}-${i}`} className="w-40 shrink-0 snap-start overflow-hidden rounded-xl border border-line bg-surface-2">
              <Picture src={c.picture} />
              <div className="p-2">
                <p lang="bn" className="line-clamp-3 text-[13px] font-semibold leading-snug">
                  {c.title}
                </p>
                <p lang="bn" className="mt-1 truncate text-[11px] text-muted">
                  {c.source}
                </p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        (post.cards[0] || post.link) && (
          <a href={post.cards[0]?.link ?? post.link} target="_blank" rel="noreferrer" className="mt-3 block rounded-xl border border-line bg-surface-2 p-3 hover:border-accent">
            {post.cards[0]?.title && (
              <p lang="bn" className="text-sm font-semibold leading-snug">
                {post.cards[0].title}
              </p>
            )}
            <p className="mt-1 truncate text-xs text-muted">{post.cards[0]?.link ?? post.link}</p>
          </a>
        )
      )}
    </div>
  );
}

function Picture({ src }: { src?: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) return <div className="aspect-[1.91/1] w-full bg-line/40" />;
  return (
    // Outlets' own pictures, at their own addresses: next/image can't optimise them in a static export.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" className="aspect-[1.91/1] w-full object-cover" onError={() => setBroken(true)} />
  );
}

function EditForm({
  post,
  busy,
  onCancel,
  onSave,
}: {
  post: SocialPost;
  busy: boolean;
  onCancel: () => void;
  onSave: (e: { message?: string; scheduledAt?: string; cards?: Card[]; policy?: Policy }) => void;
}) {
  const [message, setMessage] = useState(post.message);
  // The text follows the cards (numbered list, heading) until the person types in it.
  const [typed, setTyped] = useState(false);
  const [time, setTime] = useState(dhakaTime(post.scheduledAt));
  const [policy, setPolicy] = useState<Policy>(post.policy);
  const [cards, setCards] = useState<Card[]>(post.cards);
  const [picking, setPicking] = useState(false);
  const carousel = !!post.params.child_attachments;
  const videos = post.content === "video" || post.content === "roundup";
  const changedCards = JSON.stringify(cards) !== JSON.stringify(post.cards);

  function update(next: Card[]) {
    setCards(next);
    if (typed) return;
    if (carousel) setMessage(carouselMessage(post.content, next, Date.parse(post.scheduledAt)));
    else if (next[0]) setMessage(singleMessage(next[0]));
  }

  const move = (pos: number, by: number) => {
    const to = pos + by;
    if (to < 0 || to >= cards.length) return;
    const next = [...cards];
    [next[pos], next[to]] = [next[to], next[pos]];
    update(next);
  };

  function save() {
    const e: { message?: string; scheduledAt?: string; cards?: Card[]; policy?: Policy } = {};
    if (message !== post.message) e.message = message;
    if (time !== dhakaTime(post.scheduledAt)) e.scheduledAt = atDhakaTime(post.scheduledAt, time);
    if (policy !== post.policy) e.policy = policy;
    if (changedCards) e.cards = cards;
    if (Object.keys(e).length) onSave(e);
    else onCancel();
  }

  return (
    <div className="mt-3 space-y-3">
      <textarea
        lang="bn"
        value={message}
        onChange={(e) => {
          setMessage(e.target.value);
          setTyped(true);
        }}
        rows={Math.min(12, Math.max(4, message.split("\n").length + 1))}
        className="w-full rounded-xl border border-line bg-surface-2 p-3 text-[15px] leading-relaxed outline-none focus:border-accent"
      />
      {!typed && changedCards && <p className="-mt-1 text-xs text-muted">The text was rewritten to match the cards; edit it if you like.</p>}

      {cards.length > 0 && (
        <ol className="space-y-1.5">
          {cards.map((c, pos) => (
            <li key={`${c.link}-${pos}`} className="flex items-center gap-2 rounded-xl border border-line px-2 py-1.5">
              {c.picture ? (
                // An outlet's or YouTube's picture, at its own address.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.picture} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-10 w-16 shrink-0 rounded-md object-cover" />
              ) : (
                <span className="h-10 w-16 shrink-0 rounded-md bg-line/40" />
              )}
              <span lang="bn" className="min-w-0 flex-1 text-[13px] leading-snug">
                <span className="line-clamp-2">{c.title}</span>
                <span className="text-[11px] text-muted">{c.source}</span>
              </span>
              {carousel && (
                <>
                  <button className="h-8 w-8 shrink-0 rounded-full border border-line text-sm disabled:opacity-30" disabled={pos === 0} onClick={() => move(pos, -1)} aria-label="Move up">
                    ↑
                  </button>
                  <button
                    className="h-8 w-8 shrink-0 rounded-full border border-line text-sm disabled:opacity-30"
                    disabled={pos === cards.length - 1}
                    onClick={() => move(pos, 1)}
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                  <button
                    className="h-8 w-8 shrink-0 rounded-full border border-danger/40 text-sm text-danger disabled:opacity-30"
                    disabled={cards.length <= 2}
                    onClick={() => update(cards.filter((_, i) => i !== pos))}
                    aria-label="Remove this card"
                    title={cards.length <= 2 ? "A carousel needs at least two cards" : "Remove"}
                  >
                    ✕
                  </button>
                </>
              )}
            </li>
          ))}
        </ol>
      )}

      {post.content !== "custom" &&
        (picking ? (
          <ItemPicker
            kind={videos ? "video" : "headline"}
            exclude={cards.map((c) => c.key ?? "")}
            needsPicture={carousel}
            label={carousel ? "Add" : "Use this"}
            onPick={(card) => {
              update(carousel ? [...cards, card] : [card]);
              setPicking(false);
            }}
            onClose={() => setPicking(false)}
          />
        ) : (
          <button className={btn} disabled={carousel && cards.length >= 10} onClick={() => setPicking(true)}>
            {carousel ? `Add a ${videos ? "video" : "headline"}` : `Replace with another ${videos ? "video" : "headline"}`}
          </button>
        ))}

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          Time (Dhaka)
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-9 rounded-lg border border-line bg-surface-2 px-2" />
        </label>
        <label className="flex items-center gap-2">
          <select value={policy} onChange={(e) => setPolicy(e.target.value as Policy)} className="h-9 rounded-lg border border-line bg-surface-2 px-2">
            {(Object.keys(POLICY_LABEL) as Policy[]).map((p) => (
              <option key={p} value={p}>
                {POLICY_LABEL[p]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-xs text-muted">
        Saving locks this post: the picker won&rsquo;t replace it, and it goes out as you leave it. Cards you add are checked (link and picture) just
        before it goes out.
      </p>
      <div className="flex gap-2">
        <button className={btnPrimary} disabled={busy} onClick={save}>
          Save
        </button>
        <button className={btn} disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function RejectForm({
  busy,
  onCancel,
  onReject,
}: {
  busy: boolean;
  onCancel: () => void;
  onReject: (opts: { reason?: string; scopes: string[]; hours: number }) => void;
}) {
  const [reason, setReason] = useState("");
  const [outlet, setOutlet] = useState(false);
  const [section, setSection] = useState(false);
  const [hours, setHours] = useState(24);
  return (
    <div className="mt-4 space-y-3 rounded-xl border border-danger/30 bg-danger-soft/40 p-3">
      <p className="text-sm font-semibold">Reject: the next run drafts something else for this slot.</p>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Why (optional, for the log)"
        className="h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm outline-none focus:border-accent"
      />
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        <span className="text-muted">Leave out its story, and also:</span>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={outlet} onChange={(e) => setOutlet(e.target.checked)} /> its outlet
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={section} onChange={(e) => setSection(e.target.checked)} /> its section
        </label>
        <label className="flex items-center gap-1.5">
          for
          <select value={hours} onChange={(e) => setHours(Number(e.target.value))} className="h-8 rounded-lg border border-line bg-surface px-1">
            <option value={6}>6 hours</option>
            <option value={24}>a day</option>
            <option value={72}>3 days</option>
            <option value={168}>a week</option>
          </select>
        </label>
      </div>
      <div className="flex gap-2">
        <button
          className={btnDanger}
          disabled={busy}
          onClick={() => onReject({ reason: reason.trim() || undefined, scopes: ["story", ...(outlet ? ["outlet"] : []), ...(section ? ["section"] : [])], hours })}
        >
          Reject
        </button>
        <button className={btn} disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
