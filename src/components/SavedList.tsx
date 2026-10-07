"use client";

import type { NewsItem, NewsSource } from "@/lib/types";
import { ItemTime } from "./ItemTime";
import type { SavedEntry } from "./saved";
import { formatCount, timeAgo } from "./time";
import { BookmarkIcon, ItemMenu } from "./ui";

/** Headlines the reader saved on this device, most recently saved first. */
export function SavedList({
  entries,
  total,
  sourceById,
  now,
  onToggleSave,
  onShare,
}: {
  /** Saved headlines matching the current filters. */
  entries: SavedEntry[];
  /** All saved headlines, to tell "nothing saved" from "nothing matches". */
  total: number;
  sourceById: Map<string, NewsSource>;
  now: number;
  onToggleSave: (item: NewsItem) => void;
  onShare: (item: NewsItem) => void;
}) {
  if (!total) {
    return (
      <div className="rounded-2xl border border-dashed border-line px-6 py-14 text-center">
        <BookmarkIcon className="mx-auto h-7 w-7 text-muted" />
        <p className="mt-3 font-display text-xl">Nothing saved yet</p>
        <p className="mx-auto mt-1 max-w-xs text-sm text-muted">
          Tap the bookmark beside any headline to keep it here for later. Saved headlines stay on this device.
        </p>
      </div>
    );
  }

  return (
    <section>
      <p className="mb-4 px-1 text-[13px] text-muted">
        {formatCount(total)} saved on this device{entries.length < total && `, ${entries.length} match the filters`}
        .
      </p>
      {entries.length > 0 && (
        <ol className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
          {entries.map(({ item: it, savedAt }) => (
            <li key={it.link} className="flex border-b border-line last:border-b-0">
              <a
                data-headline
                lang={it.lang}
                href={it.link}
                target="_blank"
                rel="noopener noreferrer"
                className="group min-w-0 flex-1 py-3.5 pl-4 transition visited:text-muted active:bg-surface-2 hover:bg-surface-2/60 sm:pl-5"
              >
                <div className="mb-1 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                  <span className="font-semibold text-accent">
                    {sourceById.get(it.sourceId)?.name ?? it.sourceName}
                  </span>
                  <ItemTime item={it} now={now} />
                  <span>· saved {timeAgo(savedAt, now)}</span>
                </div>
                <p className="text-[16px] font-medium leading-[1.55] group-hover:text-accent">{it.title}</p>
              </a>
              <ItemMenu saved onToggleSave={() => onToggleSave(it)} onShare={() => onShare(it)} className="pt-4" />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
