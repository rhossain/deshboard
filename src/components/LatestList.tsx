"use client";

import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { CATEGORIES } from "@/lib/categories";
import { itemTime } from "@/lib/stories";
import type { NewsItem, NewsSource } from "@/lib/types";
import { ItemTime } from "./ItemTime";
import { ItemMenu, NewDot } from "./ui";

const CATEGORY_LABEL = new Map(CATEGORIES.map((c) => [c.id, c.label]));

const dhakaDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" });

/** ISO dates sort as strings; items without a time (publish or first seen) go last. */
export function byNewest(a: NewsItem, b: NewsItem): number {
  return (itemTime(b) ?? "").localeCompare(itemTime(a) ?? "");
}

function groupLabel(iso: string, now: number): string {
  const t = new Date(iso).getTime();
  if (now - t < 3600_000) return "Last hour";
  const day = dhakaDay.format(t);
  if (day === dhakaDay.format(now)) return "Earlier today";
  if (day === dhakaDay.format(now - 86400_000)) return "Yesterday";
  return "Older";
}

/** The list flattened for the virtualizer: a heading row per group, then its headlines. */
type Row =
  | { kind: "heading"; label: string; first: boolean }
  | { kind: "item"; item: NewsItem; first: boolean; last: boolean };

/** Rows are measured once rendered; these only place the ones not yet seen. */
const ESTIMATE = { heading: 56, item: 96 };

/**
 * Thousands of headlines, so only the rows near the screen are in the page. The list scrolls with
 * the window: `scrollMargin` is where it starts in the page, kept current as the header above it
 * changes height.
 */
export function LatestList({
  items,
  sourceById,
  now,
  isNew,
  savedLinks,
  onToggleSave,
  onShare,
}: {
  items: NewsItem[];
  sourceById: Map<string, NewsSource>;
  now: number;
  isNew: (item: NewsItem) => boolean;
  savedLinks: Set<string>;
  onToggleSave: (item: NewsItem) => void;
  onShare: (item: NewsItem) => void;
}) {
  const { rows, dated, undated } = useMemo(() => {
    const dated = items.filter(itemTime).sort(byNewest);
    const rows: Row[] = [];
    let label: string | undefined;
    dated.forEach((item, i) => {
      const next = groupLabel(itemTime(item)!, now);
      if (next !== label) {
        rows.push({ kind: "heading", label: next, first: label === undefined });
        label = next;
      }
      const after = dated[i + 1];
      const last = !after || groupLabel(itemTime(after)!, now) !== next;
      rows.push({ kind: "item", item, first: rows.at(-1)!.kind === "heading", last });
    });
    return { rows, dated: dated.length, undated: items.length - dated.length };
  }, [items, now]);

  const listRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    const measure = () => {
      const top = (listRef.current?.getBoundingClientRect().top ?? 0) + window.scrollY;
      setScrollMargin((prev) => (prev === top ? prev : top));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    return () => observer.disconnect();
  }, []);

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: (i) => ESTIMATE[rows[i].kind],
    getItemKey: (i) => {
      const row = rows[i];
      return row.kind === "heading" ? `h:${row.label}` : row.item.link;
    },
    overscan: 8,
    scrollMargin,
  });
  const visible = virtualizer.getVirtualItems();

  return (
    <section className="mt-2">
      <div ref={listRef} className="relative" style={{ height: virtualizer.getTotalSize() }}>
        <div
          className="absolute inset-x-0 top-0"
          style={{ transform: `translateY(${(visible[0]?.start ?? 0) - scrollMargin}px)` }}
        >
          {visible.map((v) => {
            const row = rows[v.index];
            return (
              <div key={v.key} data-index={v.index} ref={virtualizer.measureElement}>
                {row.kind === "heading" ? (
                  <h2
                    className={`flex items-center gap-3 px-1 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted ${row.first ? "" : "pt-6"}`}
                  >
                    {row.label}
                    <span className="h-px flex-1 bg-line" />
                  </h2>
                ) : (
                  <Headline
                    row={row}
                    sourceById={sourceById}
                    now={now}
                    isNew={isNew}
                    saved={savedLinks.has(row.item.link)}
                    onToggleSave={onToggleSave}
                    onShare={onShare}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
      {dated === 0 && (
        <p className="rounded-2xl border border-dashed border-line px-4 py-12 text-center text-sm text-muted">
          No headlines match.
        </p>
      )}
      {undated > 0 && (
        <p className="px-1 pt-6 text-center text-xs leading-relaxed text-muted">
          {undated.toLocaleString()} headlines from homepage-scraped sources have no time yet — find them in “By
          source”. New ones are timed from when they first appear on the homepage.
        </p>
      )}
    </section>
  );
}

/** One headline; the first and last of a group round off the group's card. */
function Headline({
  row,
  sourceById,
  now,
  isNew,
  saved,
  onToggleSave,
  onShare,
}: {
  row: Extract<Row, { kind: "item" }>;
  sourceById: Map<string, NewsSource>;
  now: number;
  isNew: (item: NewsItem) => boolean;
  saved: boolean;
  onToggleSave: (item: NewsItem) => void;
  onShare: (item: NewsItem) => void;
}) {
  const it = row.item;
  const edge = `${row.first ? "rounded-t-2xl border-t" : ""} ${row.last ? "rounded-b-2xl" : ""}`;
  return (
    <div className={`flex overflow-hidden border-x border-b border-line bg-surface ${edge}`}>
      <a
        data-headline
        href={it.link}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex min-w-0 flex-1 gap-4 py-3.5 pl-4 transition visited:text-muted active:bg-surface-2 hover:bg-surface-2/60 sm:pl-5"
      >
        <ItemTime item={it} now={now} className="hidden w-24 shrink-0 pt-1 text-xs tabular-nums text-muted sm:block" />
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-x-2 text-xs">
            <span className="font-semibold text-accent">{sourceById.get(it.sourceId)?.name ?? it.sourceName}</span>
            {it.category !== "other" && <span className="text-muted">· {CATEGORY_LABEL.get(it.category)}</span>}
            <span className="text-muted sm:hidden">
              · <ItemTime item={it} now={now} />
            </span>
          </div>
          <p className="text-[16px] font-medium leading-[1.55] group-hover:text-accent">
            {isNew(it) && <NewDot className="mr-2 -mt-0.5" />}
            {it.title}
          </p>
        </div>
      </a>
      <ItemMenu saved={saved} onToggleSave={() => onToggleSave(it)} onShare={() => onShare(it)} className="pt-4" />
    </div>
  );
}
