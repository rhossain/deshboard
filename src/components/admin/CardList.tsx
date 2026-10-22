"use client";

import type { Card } from "./api";

const round = "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm transition disabled:opacity-30 sm:h-8 sm:w-8";

/** A post's cards as a list to put in order and thin out: each with its picture, title and outlet or channel. */
export function CardList({
  cards,
  numbered,
  onMove,
  onRemove,
  least = 0,
  removeTitle = "Remove",
}: {
  cards: Card[];
  numbered: boolean;
  onMove?: (pos: number, by: number) => void;
  onRemove?: (pos: number) => void;
  /** Removing is refused below this many (a carousel keeps two). */
  least?: number;
  removeTitle?: string;
}) {
  return (
    <ol className="space-y-1.5">
      {cards.map((c, pos) => (
        <li key={`${c.link}-${pos}`} className="flex items-center gap-2 rounded-xl border border-line bg-surface px-2 py-1.5">
          {numbered && <span className="w-5 shrink-0 text-center text-xs font-semibold tabular-nums text-muted">{pos + 1}</span>}
          {c.picture ? (
            // An outlet's or YouTube's picture, at its own address.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.picture} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-10 w-16 shrink-0 rounded-md object-cover" />
          ) : (
            <span className="h-10 w-16 shrink-0 rounded-md bg-line/40" aria-hidden />
          )}
          <span lang="bn" className="min-w-0 flex-1 text-[13px] leading-snug">
            <span className="line-clamp-2">{c.title}</span>
            <span className="block truncate text-[11px] text-muted">{c.source}</span>
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
        </li>
      ))}
    </ol>
  );
}
