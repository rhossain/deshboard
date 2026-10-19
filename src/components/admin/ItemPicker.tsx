"use client";

import { useEffect, useMemo, useState } from "react";
import type { Card } from "./api";
import { relative } from "./api";
import { cardOf, loadItems, type PickItem, pictureFor } from "./items";

const chip = "h-8 rounded-full border px-3 text-[12px] font-semibold transition";

interface Props {
  /** Which items to offer: headlines, videos, or both (the choice is then the person's). */
  kind: "headline" | "video" | "any";
  /** Items already in the post (their keys), shown as such. */
  exclude?: string[];
  /** The card must have a picture (a carousel card). */
  needsPicture?: boolean;
  label?: string;
  onPick: (card: Card, item: PickItem) => void;
  onClose: () => void;
}

/** A search over the board's headlines and videos right now; picking one makes its card. */
export function ItemPicker({ kind, exclude = [], needsPicture, label = "Add", onPick, onClose }: Props) {
  const [items, setItems] = useState<PickItem[] | null>(null);
  const [query, setQuery] = useState("");
  const [show, setShow] = useState<"headline" | "video">(kind === "video" ? "video" : "headline");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let off = false;
    loadItems().then((all) => !off && setItems(all));
    return () => {
      off = true;
    };
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items ?? [])
      .filter((it) => it.kind === show)
      .filter((it) => !q || it.title.toLowerCase().includes(q) || it.source.toLowerCase().includes(q) || it.sourceId.includes(q))
      .slice(0, 60);
  }, [items, query, show]);

  async function pick(it: PickItem) {
    setBusyKey(it.key);
    setProblem(null);
    const picture = await pictureFor(it);
    setBusyKey(null);
    if (needsPicture && !picture) {
      setProblem(`"${it.title.slice(0, 50)}…" has no picture, and a carousel card needs one: pick another.`);
      return;
    }
    onPick(cardOf(it, picture), it);
  }

  return (
    <div className="mt-3 rounded-2xl border border-accent/40 bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search headlines, outlets, channels…"
          className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-3 text-sm outline-none focus:border-accent"
        />
        <button className={`${chip} border-line`} onClick={onClose}>
          Close
        </button>
      </div>
      {kind === "any" && (
        <div className="mt-2 flex gap-2">
          {(["headline", "video"] as const).map((k) => (
            <button key={k} onClick={() => setShow(k)} className={`${chip} ${show === k ? "border-accent bg-accent-soft text-accent" : "border-line"}`}>
              {k === "headline" ? "Headlines" : "Videos"}
            </button>
          ))}
        </div>
      )}
      {problem && <p className="mt-2 rounded-xl bg-danger-soft px-3 py-2 text-xs text-danger">{problem}</p>}
      {!items && <p className="mt-3 text-sm text-muted">Loading the board…</p>}
      {items && shown.length === 0 && <p className="mt-3 text-sm text-muted">Nothing matches.</p>}
      <ol className="mt-2 max-h-[55vh] divide-y divide-line overflow-y-auto">
        {shown.map((it) => {
          const there = exclude.includes(it.key);
          return (
            <li key={`${it.kind}-${it.key}`} className="flex items-center gap-3 py-2">
              {it.kind === "video" && it.picture && (
                // YouTube's thumbnail, at YouTube's address.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.picture} alt="" loading="lazy" className="h-12 w-20 shrink-0 rounded-lg object-cover" />
              )}
              <div className="min-w-0 flex-1">
                <p lang="bn" className="line-clamp-2 text-sm font-semibold leading-snug">
                  {it.title}
                </p>
                <p className="mt-0.5 text-[11px] text-muted">
                  <span lang="bn">{it.source}</span>
                  {it.time ? ` · ${relative(new Date(it.time).toISOString(), now)}` : ""}
                </p>
              </div>
              <button
                disabled={there || busyKey === it.key}
                onClick={() => pick(it)}
                className="h-8 shrink-0 rounded-full bg-accent px-3 text-[12px] font-semibold text-accent-ink disabled:bg-surface-2 disabled:text-muted"
              >
                {there ? "In post" : busyKey === it.key ? "…" : label}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
