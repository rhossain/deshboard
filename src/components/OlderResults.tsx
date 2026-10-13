"use client";

import { useEffect, useRef, useState } from "react";
import type { Category } from "@/lib/categories";
import { keptDates } from "@/lib/archive";
import type { LangFilter } from "@/lib/filters";
import type { Search } from "@/lib/search";
import type { NewsDay, NewsItem, NewsSource } from "@/lib/types";
import { Headline } from "./LatestList";
import { useLocale, useStrings } from "./locale";
import { dhakaDate } from "./time";
import { RefreshIcon } from "./ui";

/** Wait for the reader to stop typing before downloading anything. */
const DEBOUNCE_MS = 500;
/** Each round looks through this many more days... */
const ROUND_DAYS = 7;
/** ...or stops sooner, once it has found this many more headlines. */
const ROUND_FOUND = 20;

// Day files, once downloaded, for every search after: a past day hardly changes while the page is open.
const days = new Map<string, Promise<NewsItem[] | null>>();

function loadDay(date: string): Promise<NewsItem[] | null> {
  let day = days.get(date);
  if (!day) {
    day = fetch(`/data/days/${date}.json`)
      .then((res) => (res.ok ? (res.json() as Promise<NewsDay>) : null))
      .then((d) => d?.items ?? null)
      .catch(() => {
        days.delete(date); // Offline for a moment: the next search tries again.
        return null;
      });
    days.set(date, day);
  }
  return day;
}

interface Found {
  date: string;
  items: NewsItem[];
}

/**
 * The search, carried on past the board's 72 hours into the day files of the last 30 days (docs/search.md):
 * newest first, a round of days at a time, so a search that finds plenty early downloads little. It starts
 * from today, since the board holds only each outlet's newest 300 (less than a day for the busiest), and
 * leaves out what the board already shows (`boardLinks`). Give it a `key` that changes with the search
 * and filters.
 */
export function OlderResults({
  search,
  boardLinks,
  lang,
  source,
  category,
  sourceById,
  now,
  savedLinks,
  onToggleSave,
  onShare,
}: {
  search: Search;
  boardLinks: Set<string>;
  lang: LangFilter;
  source: string;
  category: Category | "";
  sourceById: Map<string, NewsSource>;
  now: number;
  savedLinks: Set<string>;
  onToggleSave: (item: NewsItem) => void;
  onShare: (item: NewsItem) => void;
}) {
  const t = useStrings();
  const locale = useLocale();
  const [found, setFound] = useState<Found[]>([]);
  /** How many of `dates` have been looked through. */
  const [searched, setSearched] = useState(0);
  /** The oldest day read so far. */
  const [reached, setReached] = useState<string>();
  const [busy, setBusy] = useState(true);
  // The board's links change as it refreshes; a search in progress shouldn't start over for that.
  const boardRef = useRef(boardLinks);
  useEffect(() => {
    boardRef.current = boardLinks;
  }, [boardLinks]);
  /** Bumped by each new search and each "Search further back", so a superseded round stops. */
  const roundRef = useRef(0);
  /** False once the component has left the page (a new search, another view): stop downloading. */
  const live = useRef(false);
  /** Outlet and title of each headline shown: some outlets publish the same one at two addresses. */
  const shown = useRef(new Set<string>());
  // Fixed when the search starts: past midnight, "Search further back" carries on from the same day.
  const [dates] = useState(() => keptDates(now));

  const run = async (start: number, round: number, already: number) => {
    setBusy(true);
    let count = already;
    let i = start;
    for (; i < dates.length && i < start + ROUND_DAYS && count < already + ROUND_FOUND; i++) {
      const date = dates[i];
      const items = await loadDay(date);
      if (round !== roundRef.current || !live.current) return;
      // No file for today yet: the day's first build hasn't run. Older days go on.
      if (!items && i === 0) continue;
      // No file for this day: the archive starts after it (it is filling up, see archive.ts).
      if (!items) {
        setSearched(dates.length);
        break;
      }
      const matching: NewsItem[] = [];
      for (const it of items) {
        const key = `${it.sourceId}\n${it.title}`;
        if (
          boardRef.current.has(it.link) ||
          shown.current.has(key) ||
          (lang !== "all" && it.lang !== lang) ||
          (source && it.sourceId !== source) ||
          (category && it.category !== category) ||
          !search.matches(it.title)
        )
          continue;
        shown.current.add(key);
        matching.push(it);
      }
      setReached(date);
      count += matching.length;
      if (matching.length) setFound((f) => [...f, { date, items: matching }]);
      setSearched(i + 1);
    }
    setBusy(false);
  };

  // The first round, once the reader has stopped typing. A new search or filter is a new key (see the
  // board), so it starts over with a fresh component.
  useEffect(() => {
    live.current = true;
    const round = ++roundRef.current;
    const timer = setTimeout(() => void run(0, round, 0), DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      live.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = found.reduce((n, f) => n + f.items.length, 0);
  const more = searched < dates.length;

  return (
    <section className="mt-10" aria-busy={busy}>
      <h2 className="flex items-center gap-3 px-1 pb-3 font-display text-xl">{t.olderHeadlines}</h2>
      {found.map(({ date, items }, d) => (
        <div key={date}>
          <h3
            className={`flex items-center gap-3 px-1 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted ${d === 0 ? "" : "pt-6 compact:pt-4"}`}
          >
            {dhakaDate(date, locale)}
            <span className="h-px flex-1 bg-line" />
          </h3>
          {items.map((item, i) => (
            <Headline
              key={item.link}
              row={{ kind: "item", item, first: i === 0, last: i === items.length - 1 }}
              sourceById={sourceById}
              now={now}
              isNew={() => false}
              saved={savedLinks.has(item.link)}
              onToggleSave={onToggleSave}
              onShare={onShare}
            />
          ))}
        </div>
      ))}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 px-1 text-sm text-muted" aria-live="polite">
        {busy ? (
          <span className="flex items-center gap-2">
            <RefreshIcon spinning className="h-4 w-4" />
            {t.searchingOlder}
          </span>
        ) : (
          <>
            {total === 0 && <span>{t.noOlder}</span>}
            {reached && <span>{t.searchedBackTo(dhakaDate(reached, locale))}</span>}
            {more && (
              <button
                type="button"
                onClick={() => void run(searched, ++roundRef.current, total)}
                className="rounded-full border border-line px-3 py-1.5 font-medium text-foreground transition hover:bg-surface-2"
              >
                {t.searchFurther}
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
