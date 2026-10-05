"use client";

import { CATEGORIES } from "@/lib/categories";
import type { NewsItem, NewsSource } from "@/lib/types";
import { fullTime, timeAgo } from "./time";

const CATEGORY_LABEL = new Map(CATEGORIES.map((c) => [c.id, c.label]));
const MAX_ITEMS = 300;

const dhakaDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" });

/** ISO dates sort as strings; items without a date go last. */
export function byNewest(a: NewsItem, b: NewsItem): number {
  return (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "");
}

function groupLabel(iso: string, now: number): string {
  const t = new Date(iso).getTime();
  if (now - t < 3600_000) return "Last hour";
  const day = dhakaDay.format(t);
  if (day === dhakaDay.format(now)) return "Earlier today";
  if (day === dhakaDay.format(now - 86400_000)) return "Yesterday";
  return "Older";
}

export function LatestList({
  items,
  sourceById,
  now,
}: {
  items: NewsItem[];
  sourceById: Map<string, NewsSource>;
  now: number;
}) {
  const dated = items.filter((i) => i.publishedAt).sort(byNewest);
  const undated = items.length - dated.length;

  const groups: { label: string; items: NewsItem[] }[] = [];
  for (const it of dated.slice(0, MAX_ITEMS)) {
    const label = groupLabel(it.publishedAt!, now);
    const last = groups.at(-1);
    if (last?.label === label) last.items.push(it);
    else groups.push({ label, items: [it] });
  }

  return (
    <section className="mt-2">
      {groups.map((g) => (
        <div key={g.label} className="mb-6">
          <h2 className="mb-2 flex items-center gap-3 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            {g.label}
            <span className="h-px flex-1 bg-line" />
          </h2>
          <ol className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
            {g.items.map((it) => (
              <li key={it.link} className="border-b border-line last:border-b-0">
                <a
                  href={it.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex gap-4 px-4 py-3.5 transition active:bg-surface-2 hover:bg-surface-2/60 sm:px-5"
                >
                  <time
                    dateTime={it.publishedAt}
                    title={fullTime(it.publishedAt)}
                    className="hidden w-24 shrink-0 pt-1 text-xs tabular-nums text-muted sm:block"
                  >
                    {timeAgo(it.publishedAt, now)}
                  </time>
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-x-2 text-xs">
                      <span className="font-semibold text-accent">
                        {sourceById.get(it.sourceId)?.name ?? it.sourceName}
                      </span>
                      {it.category !== "other" && (
                        <span className="text-muted">· {CATEGORY_LABEL.get(it.category)}</span>
                      )}
                      <span className="text-muted sm:hidden">· {timeAgo(it.publishedAt, now)}</span>
                    </div>
                    <p className="text-[16px] font-medium leading-[1.55] group-hover:text-accent">{it.title}</p>
                  </div>
                </a>
              </li>
            ))}
          </ol>
        </div>
      ))}
      {dated.length === 0 && (
        <p className="rounded-2xl border border-dashed border-line px-4 py-12 text-center text-sm text-muted">
          No headlines match.
        </p>
      )}
      {undated > 0 && (
        <p className="px-1 text-center text-xs leading-relaxed text-muted">
          {undated.toLocaleString()} headlines from homepage-scraped sources have no timestamp — find them in “By
          source”.
        </p>
      )}
    </section>
  );
}
