"use client";

import { useEffect, useMemo, useState } from "react";
import { CATEGORIES, type Category } from "@/lib/categories";
import { IG_MAX_HEADLINES } from "@/lib/instagram-post";
import { FB_MAX_CARDS } from "@/lib/post-text";
import { api, dhakaTime, type Platform, PLATFORM_LABEL, relative, type SavedItem } from "./api";
import { cardOf, loadSaved, type PickItem, pickItemOf, pictureFor, type Posted, recentlyPosted } from "./items";
import type { Pick } from "./ItemPicker";

const btn = "h-9 rounded-full border border-line px-3.5 text-[13px] font-semibold transition hover:bg-surface-2 active:scale-95 disabled:opacity-50";
const btnPrimary = "h-9 rounded-full bg-accent px-4 text-[13px] font-semibold text-accent-ink transition active:scale-95 disabled:opacity-50";
const chip = "h-8 shrink-0 rounded-full border px-3 text-[12px] font-semibold transition";
const chipOn = `${chip} border-accent bg-accent-soft text-accent`;
const chipOff = `${chip} border-line text-muted hover:text-foreground`;

const SECTION = new Map(CATEGORIES.map((c) => [c.id, c]));

type Kind = "all" | "headline" | "video";
type Use = "all" | "unused" | "used";

interface Props {
  /** Opens the queue's composer with these cards, on this platform. */
  onStartPost: (picks: Pick[], platform: Platform) => void;
  onError: (message: string) => void;
}

/**
 * The Saved tab: headlines and videos picked on the public board while signed in ("Save for a social post" in its
 * share sheet; functions/api/admin/saved). Choose some and start a post with them — headlines or videos, not both;
 * up to a carousel's worth — or take them off the list. An item that went into a post says so and stays, so a story
 * can go out again another day; the composer's picker offers the same list under its "Saved" chip.
 */
export function SavedView({ onStartPost, onError }: Props) {
  const [items, setItems] = useState<SavedItem[] | null>(null);
  const [posted, setPosted] = useState<Map<string, Posted>>(new Map());
  const [kind, setKind] = useState<Kind>("all");
  const [use, setUse] = useState<Use>("all");
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = (fresh = false) => {
    loadSaved(fresh)
      .then((list) => {
        setItems(list);
        setNow(Date.now());
      })
      .catch((e) => onError((e as Error).message));
    recentlyPosted(fresh).then(setPosted);
  };
  useEffect(() => {
    load(true);
    // Once, when the tab opens; "Refresh" asks again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shown = useMemo(
    () => (items ?? []).filter((s) => (kind === "all" || s.kind === kind) && (use === "all" || (use === "used") === !!s.usedAt)),
    [items, kind, use],
  );
  const chosenItems = (items ?? []).filter((s) => chosen.has(s.id));
  const chosenKind = chosenItems[0]?.kind;
  const most = FB_MAX_CARDS;

  const toggle = (s: SavedItem) =>
    setChosen((c) => {
      const next = new Set(c);
      if (next.has(s.id)) next.delete(s.id);
      else if (next.size < most) next.add(s.id);
      return next;
    });

  async function start(platform: Platform) {
    setBusy("start");
    try {
      const picks: PickItem[] = chosenItems.map(pickItemOf);
      const pictures = await Promise.all(picks.map(pictureFor));
      onStartPost(
        picks.map((item, i) => ({ card: cardOf(item, pictures[i]), item })),
        platform,
      );
      setChosen(new Set());
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function remove(s: SavedItem) {
    setBusy(s.id);
    try {
      await api.unsave(s.id);
      setItems((list) => list?.filter((x) => x.id !== s.id) ?? null);
      setChosen((c) => {
        const next = new Set(c);
        next.delete(s.id);
        return next;
      });
      void loadSaved(true);
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const counts = { headline: (items ?? []).filter((s) => s.kind === "headline").length, video: (items ?? []).filter((s) => s.kind === "video").length };

  return (
    <div className="space-y-4">
      <p className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-muted">
        While you are signed in here, the board&rsquo;s <strong className="text-foreground">Share</strong> sheet (on any headline or video) has a{" "}
        <strong className="text-foreground">Save</strong> button: what you save there lands on this list, to go into a post. Choose some and start a post, or pick
        them in the composer under <strong className="text-foreground">★ Saved</strong>.
      </p>

      <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        {(
          [
            ["all", `All (${(items ?? []).length})`],
            ["headline", `Headlines (${counts.headline})`],
            ["video", `Videos (${counts.video})`],
          ] as [Kind, string][]
        ).map(([id, label]) => (
          <button key={id} type="button" className={kind === id ? chipOn : chipOff} aria-pressed={kind === id} onClick={() => setKind(id)}>
            {label}
          </button>
        ))}
        <span className="w-2 shrink-0" aria-hidden />
        {(
          [
            ["all", "Any"],
            ["unused", "Not in a post yet"],
            ["used", "Went into a post"],
          ] as [Use, string][]
        ).map(([id, label]) => (
          <button key={id} type="button" className={use === id ? chipOn : chipOff} aria-pressed={use === id} onClick={() => setUse(id)}>
            {label}
          </button>
        ))}
        <span className="w-2 shrink-0" aria-hidden />
        <button type="button" className={chipOff} onClick={() => load(true)}>
          Refresh
        </button>
      </div>

      {!items && <p className="text-sm text-muted">Loading…</p>}
      {items && items.length === 0 && (
        <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
          Nothing saved yet. Open the board, tap Share on a headline or video, and Save.
        </p>
      )}
      {items && items.length > 0 && shown.length === 0 && <p className="text-sm text-muted">Nothing matches these filters.</p>}

      {shown.length > 0 && (
        <ol className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
          {shown.map((s) => {
            const on = chosen.has(s.id);
            const otherKind = !!chosenKind && chosenKind !== s.kind;
            const full = !on && chosen.size >= most;
            const sec = s.section ? SECTION.get(s.section as Category) : undefined;
            const went = posted.get(s.key);
            const published = Date.parse(s.publishedAt ?? "");
            return (
              <li key={s.id} className={`flex items-start gap-3 border-b border-line px-4 py-3 last:border-b-0 ${on ? "bg-accent-soft/60" : ""}`}>
                <label className="flex cursor-pointer items-center pt-1" title={otherKind ? "A post has headlines or videos, not both" : full ? `Up to ${most} in a post` : undefined}>
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={otherKind || full || busy === "start"}
                    onChange={() => toggle(s)}
                    aria-label={`Choose “${s.title.slice(0, 60)}”`}
                    className="h-5 w-5 accent-[var(--accent)]"
                  />
                </label>
                {s.kind === "video" && s.picture && (
                  // YouTube's thumbnail, at YouTube's address.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.picture} alt="" loading="lazy" className="h-12 w-20 shrink-0 rounded-lg object-cover" />
                )}
                <div className="min-w-0 flex-1">
                  <a href={s.link} target="_blank" rel="noreferrer" lang="bn" className="line-clamp-2 text-sm font-semibold leading-snug hover:underline">
                    {s.title}
                  </a>
                  <p className="mt-0.5 truncate text-[11px] text-muted">
                    <span className="rounded-md bg-surface-2 px-1.5 py-0.5 font-semibold uppercase tracking-wide">{s.kind}</span> <span lang="bn">{s.source}</span>
                    {sec && sec.id !== "other" && <span lang="bn"> · {sec.bn}</span>}
                    {published ? ` · published ${relative(new Date(published).toISOString(), now)}` : ""}
                    {` · saved ${relative(s.savedAt, now)}`}
                  </p>
                  <p className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
                    {s.usedAt && (
                      <span className="rounded-full bg-accent-soft px-2 py-0.5 font-semibold text-accent" title={s.postId ? `Post ${s.postId}` : undefined}>
                        In a post · {dhakaTime(s.usedAt)}
                      </span>
                    )}
                    {went && <span className="rounded-full bg-gold/15 px-2 py-0.5 font-semibold text-gold">Posted {dhakaTime(went.at)} · {PLATFORM_LABEL[went.platform]}</span>}
                  </p>
                </div>
                <button type="button" className={`${btn} shrink-0`} disabled={busy === s.id} onClick={() => remove(s)} title="Take it off the saved list (any post it went into keeps it)">
                  {busy === s.id ? "…" : "Remove"}
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {chosen.size > 0 && (
        <div className="sticky bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface p-3 shadow-card lg:bottom-4">
          <span className="text-sm font-semibold">
            {chosen.size} {chosenKind === "video" ? (chosen.size === 1 ? "video" : "videos") : chosen.size === 1 ? "headline" : "headlines"} chosen
          </span>
          <button type="button" className={btnPrimary} disabled={busy === "start"} onClick={() => start("facebook")}>
            {busy === "start" ? "Opening…" : "New Facebook post"}
          </button>
          <button
            type="button"
            className={btn}
            disabled={busy === "start" || chosenKind === "video" || chosen.size > IG_MAX_HEADLINES}
            title={chosenKind === "video" ? "Instagram takes headlines only" : chosen.size > IG_MAX_HEADLINES ? `Instagram takes up to ${IG_MAX_HEADLINES} headlines` : undefined}
            onClick={() => start("instagram")}
          >
            New Instagram post
          </button>
          <button type="button" className={btn} disabled={busy === "start"} onClick={() => setChosen(new Set())}>
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
