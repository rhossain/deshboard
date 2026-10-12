"use client";

import { useState } from "react";
import type { Story } from "@/lib/stories";
import type { NewsItem, NewsSource } from "@/lib/types";
import { ItemTime } from "./ItemTime";
import { useLocale, useStrings } from "./locale";
import { formatCount, timeAgo } from "./time";
import { ChevronIcon, ItemMenu, NewDot } from "./ui";
import { Highlight } from "./Highlight";

/** Other outlets' headlines shown before "Show all". */
const PREVIEW = 3;
const PAGE = 30;

/** Stories reported by several outlets, most widely covered first. */
export function TopStories({
  stories,
  sourceById,
  now,
  isNew,
  savedLinks,
  onToggleSave,
  onShare,
  emptyHint,
}: {
  stories: Story[];
  sourceById: Map<string, NewsSource>;
  now: number;
  isNew: (item: NewsItem) => boolean;
  savedLinks: Set<string>;
  onToggleSave: (item: NewsItem) => void;
  onShare: (item: NewsItem) => void;
  /** Shown instead of the list when there are no stories. */
  emptyHint: string;
}) {
  const [limit, setLimit] = useState(PAGE);
  const t = useStrings();

  if (!stories.length) {
    return (
      <p className="rounded-2xl border border-dashed border-line px-6 py-14 text-center text-sm text-muted">
        {emptyHint}
      </p>
    );
  }

  return (
    <section>
      <h2 className="sr-only">{t.topStories}</h2>
      <p className="mb-4 px-1 text-[13px] text-muted">
        {t.topExplainer}
      </p>
      <ol className="grid items-start gap-4 sm:gap-5 lg:grid-cols-2 compact:gap-3">
        {stories.slice(0, limit).map((s, i) => (
          <StoryCard
            key={s.id}
            story={s}
            rank={i + 1}
            sourceById={sourceById}
            now={now}
            isNew={isNew}
            savedLinks={savedLinks}
            onToggleSave={onToggleSave}
            onShare={onShare}
          />
        ))}
      </ol>
      {stories.length > limit && (
        <button
          type="button"
          onClick={() => setLimit((n) => n + PAGE)}
          className="mx-auto mt-6 flex h-11 items-center gap-1.5 rounded-full border border-line bg-surface px-5 text-sm font-semibold text-accent shadow-card transition active:scale-95"
        >
          {t.moreStories}
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
  savedLinks,
  onToggleSave,
  onShare,
}: {
  story: Story;
  rank: number;
  sourceById: Map<string, NewsSource>;
  now: number;
  isNew: (item: NewsItem) => boolean;
  savedLinks: Set<string>;
  onToggleSave: (item: NewsItem) => void;
  onShare: (item: NewsItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const t = useStrings();
  const locale = useLocale();
  const [lead, ...others] = story.items;
  const shown = open ? others : others.slice(0, PREVIEW);
  const name = (it: NewsItem) => sourceById.get(it.sourceId)?.name ?? it.sourceName;

  return (
    <li className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <div className="flex">
        <a
          data-headline
          lang={lead.lang}
          href={lead.link}
          target="_blank"
          rel="noopener noreferrer"
          className="group block min-w-0 flex-1 pb-3.5 pl-4 pt-4 transition visited:text-muted active:bg-surface-2 hover:bg-surface-2/60 sm:pl-5 compact:pb-2.5 compact:pt-3"
        >
          <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs compact:mb-1">
            <span className="font-display text-sm font-semibold tabular-nums text-gold">{formatCount(rank, locale)}</span>
            <span className="rounded-full bg-accent-soft px-2.5 py-0.5 font-semibold text-accent">
              {t.outlets(formatCount(story.outlets, locale))}
            </span>
            {story.latest && <span className="text-muted">{t.storyUpdated(timeAgo(story.latest, now, locale))}</span>}
          </div>
          <p className="text-[18px] font-semibold leading-[1.5] group-hover:text-accent compact:text-[16px] compact:leading-[1.45]">
            {story.items.some(isNew) && <NewDot className="mr-2 -mt-0.5" />}
            <Highlight text={lead.title} />
          </p>
          <p className="mt-1 text-xs text-muted">
            <span className="font-semibold text-accent">{name(lead)}</span>
            {itemTimeLabel(lead, now)}
          </p>
        </a>
        <ItemMenu
          saved={savedLinks.has(lead.link)}
          onToggleSave={() => onToggleSave(lead)}
          onShare={() => onShare(lead)}
          className="pt-4 compact:pt-3"
        />
      </div>
      <ul className="border-t border-line">
        {shown.map((it) => (
          <li key={it.link} className="flex border-b border-line last:border-b-0">
            <a
              data-headline
              lang={it.lang}
              href={it.link}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex min-w-0 flex-1 gap-3 py-2.5 pl-4 text-[14px] leading-[1.5] transition visited:text-muted active:bg-surface-2 hover:bg-surface-2/60 sm:pl-5 compact:py-1.5 compact:text-[13px]"
            >
              <span className="w-28 shrink-0 truncate pt-px text-xs font-semibold text-accent">{name(it)}</span>
              <span className="min-w-0 group-hover:text-accent">
                {isNew(it) && <NewDot className="mr-1.5 -mt-0.5" />}
                <Highlight text={it.title} />
              </span>
            </a>
            <ItemMenu
              saved={savedLinks.has(it.link)}
              onToggleSave={() => onToggleSave(it)}
              onShare={() => onShare(it)}
              className="pt-2 compact:pt-1"
            />
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
          {open ? t.showLess : t.allOutlets(formatCount(others.length + 1, locale))}
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
