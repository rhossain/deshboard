"use client";

import { useState } from "react";
import type { Story } from "@/lib/stories";
import type { NewsItem, NewsSource } from "@/lib/types";
import { ItemTime } from "./ItemTime";
import { timeAgo } from "./time";
import { ChevronIcon, NewDot } from "./ui";

/** Other outlets' headlines shown before "Show all". */
const PREVIEW = 3;
const PAGE = 30;

/** Stories reported by several outlets, most widely covered first. */
export function TopStories({
  stories,
  sourceById,
  now,
  isNew,
  emptyHint,
}: {
  stories: Story[];
  sourceById: Map<string, NewsSource>;
  now: number;
  isNew: (item: NewsItem) => boolean;
  /** Shown instead of the list when there are no stories. */
  emptyHint: string;
}) {
  const [limit, setLimit] = useState(PAGE);

  if (!stories.length) {
    return (
      <p className="rounded-2xl border border-dashed border-line px-6 py-14 text-center text-sm text-muted">
        {emptyHint}
      </p>
    );
  }

  return (
    <section>
      <p className="mb-4 px-1 text-[13px] text-muted">
        The same event reported by several outlets, grouped by matching headlines. The more outlets, the higher it
        ranks.
      </p>
      <ol className="grid items-start gap-4 sm:gap-5 lg:grid-cols-2">
        {stories.slice(0, limit).map((s, i) => (
          <StoryCard key={s.id} story={s} rank={i + 1} sourceById={sourceById} now={now} isNew={isNew} />
        ))}
      </ol>
      {stories.length > limit && (
        <button
          type="button"
          onClick={() => setLimit((n) => n + PAGE)}
          className="mx-auto mt-6 flex h-11 items-center gap-1.5 rounded-full border border-line bg-surface px-5 text-sm font-semibold text-accent shadow-card transition active:scale-95"
        >
          Show more stories
          <ChevronIcon className="h-4 w-4" />
        </button>
      )}
    </section>
  );
}

function StoryCard({
  story,
  rank,
  sourceById,
  now,
  isNew,
}: {
  story: Story;
  rank: number;
  sourceById: Map<string, NewsSource>;
  now: number;
  isNew: (item: NewsItem) => boolean;
}) {
  const [open, setOpen] = useState(false);
  const [lead, ...others] = story.items;
  const shown = open ? others : others.slice(0, PREVIEW);
  const name = (it: NewsItem) => sourceById.get(it.sourceId)?.name ?? it.sourceName;

  return (
    <li className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <a
        href={lead.link}
        target="_blank"
        rel="noopener noreferrer"
        className="group block px-4 pb-3.5 pt-4 transition visited:text-muted active:bg-surface-2 hover:bg-surface-2/60 sm:px-5"
      >
        <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className="font-display text-sm font-semibold tabular-nums text-gold">{rank}</span>
          <span className="rounded-full bg-accent-soft px-2.5 py-0.5 font-semibold text-accent">
            {story.outlets} outlets
          </span>
          {story.latest && <span className="text-muted">updated {timeAgo(story.latest, now)}</span>}
        </div>
        <p className="text-[18px] font-semibold leading-[1.5] group-hover:text-accent">
          {story.items.some(isNew) && <NewDot className="mr-2 -mt-0.5" />}
          {lead.title}
        </p>
        <p className="mt-1 text-xs text-muted">
          <span className="font-semibold text-accent">{name(lead)}</span>
          {itemTimeLabel(lead, now)}
        </p>
      </a>
      <ul className="border-t border-line">
        {shown.map((it) => (
          <li key={it.link} className="border-b border-line last:border-b-0">
            <a
              href={it.link}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex gap-3 px-4 py-2.5 text-[14px] leading-[1.5] transition visited:text-muted active:bg-surface-2 hover:bg-surface-2/60 sm:px-5"
            >
              <span className="w-28 shrink-0 truncate pt-px text-xs font-semibold text-accent">{name(it)}</span>
              <span className="min-w-0 group-hover:text-accent">
                {isNew(it) && <NewDot className="mr-1.5 -mt-0.5" />}
                {it.title}
              </span>
            </a>
          </li>
        ))}
      </ul>
      {others.length > PREVIEW && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-h-11 w-full items-center justify-center gap-1.5 border-t border-line text-sm font-semibold text-accent transition active:bg-surface-2"
        >
          {open ? "Show less" : `All ${others.length + 1} outlets`}
          <ChevronIcon className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
        </button>
      )}
    </li>
  );
}

function itemTimeLabel(item: NewsItem, now: number) {
  if (!item.publishedAt && !item.seenAt) return null;
  return (
    <>
      {" · "}
      <ItemTime item={item} now={now} />
    </>
  );
}
