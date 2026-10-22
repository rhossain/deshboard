"use client";

import type { Card } from "./api";
import type { PictureVerdict } from "./pictures";

const round = "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm transition disabled:opacity-30 sm:h-8 sm:w-8";

/** A post's cards as a list to put in order and thin out: each with its picture, title and outlet or channel. */
export function CardList({
  cards,
  numbered,
  onMove,
  onRemove,
  least = 0,
  removeTitle = "Remove",
  checks,
}: {
  cards: Card[];
  numbered: boolean;
  onMove?: (pos: number, by: number) => void;
  onRemove?: (pos: number) => void;
  /** Removing is refused below this many (a carousel keeps two). */
  least?: number;
  removeTitle?: string;
  /** What was found out about each card's picture, by its link (usePictureChecks); shown under the card. */
  checks?: Map<string, PictureVerdict>;
}) {
  return (
    <ol className="space-y-1.5">
      {cards.map((c, pos) => {
        const v = checks?.get(c.link);
        const tone = v?.level === "bad" ? "border-danger/50 bg-danger-soft/40" : v?.level === "warn" ? "border-gold/50 bg-gold/10" : "border-line bg-surface";
        const ring = v?.level === "bad" ? "ring-2 ring-danger" : v?.level === "warn" ? "ring-2 ring-gold" : "";
        return (
          <li key={`${c.link}-${pos}`} className={`rounded-xl border px-2 py-1.5 ${tone}`}>
            <div className="flex items-center gap-2">
              {numbered && <span className="w-5 shrink-0 text-center text-xs font-semibold tabular-nums text-muted">{pos + 1}</span>}
              {c.picture ? (
                // An outlet's or YouTube's picture, at its own address; opens full size, to look at it.
                <a href={c.picture} target="_blank" rel="noreferrer" className={`shrink-0 rounded-md ${ring}`} title={v?.width ? `${v.width}×${v.height} — open the picture` : "Open the picture"}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.picture} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-10 w-16 rounded-md object-cover" />
                </a>
              ) : (
                <span className={`flex h-10 w-16 shrink-0 items-center justify-center rounded-md bg-line/40 text-[10px] font-semibold text-muted ${ring}`} aria-hidden>
                  {v ? "none" : ""}
                </span>
              )}
              <span lang="bn" className="min-w-0 flex-1 text-[13px] leading-snug">
                <span className="line-clamp-2">{c.title}</span>
                <span className="block truncate text-[11px] text-muted">
                  {c.source}
                  {v?.level === "ok" && v.width ? ` · ${v.width}×${v.height}` : ""}
                </span>
              </span>
          {onMove && cards.length > 1 && (
            <>
              <button type="button" className={`${round} border-line`} disabled={pos === 0} onClick={() => onMove(pos, -1)} aria-label="Move up">
                ↑
              </button>
              <button type="button" className={`${round} border-line`} disabled={pos === cards.length - 1} onClick={() => onMove(pos, 1)} aria-label="Move down">
                ↓
              </button>
            </>
          )}
              {onRemove && (
                <button
                  type="button"
                  className={`${round} border-danger/40 text-danger`}
                  disabled={cards.length <= least}
                  onClick={() => onRemove(pos)}
                  aria-label={removeTitle}
                  title={cards.length <= least ? `A carousel needs at least ${least} cards` : removeTitle}
                >
                  ✕
                </button>
              )}
            </div>
            {v && v.level !== "ok" && (
              <p role={v.level === "bad" ? "alert" : "status"} className={`mt-1.5 flex items-start gap-1.5 text-[12px] leading-snug ${v.level === "bad" ? "text-danger" : "text-gold"}`}>
                <span aria-hidden>{v.level === "bad" ? "⛔" : "⚠️"}</span>
                <span>
                  <strong>{v.level === "bad" ? "Picture problem." : "Picture could be better."}</strong> {v.note}
                </span>
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
