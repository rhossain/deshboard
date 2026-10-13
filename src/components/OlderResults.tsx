"use client";

import { useEffect, useRef, useState } from "react";
import type { Category } from "@/lib/categories";
import { keptDates } from "@/lib/archive";
import type { LangFilter } from "@/lib/filters";
import type { Search } from "@/lib/search";
import { titleKey } from "@/lib/fetchers/utils";
import type { NewsDay, NewsItem, NewsSource } from "@/lib/types";
import { Headline } from "./LatestList";
import { useLocale, useStrings } from "./locale";
import { dhakaDate } from "./time";
import { RefreshIcon } from "./ui";

/** Wait for the reader to stop typing before downloading anything. */
const DEBOUNCE_MS = 500;
/** Each round looks through this many more days... */
const ROUND_DAYS = 7;
/** ...or stops sooner, once it has found this many more headlines... */
const ROUND_FOUND = 20;
/** ...and shows at most this many: a word as common as "র" finds thousands a day. The rest come next round. */
const ROUND_ROWS = 100;

/** Day files kept for the searches after, the most recently used first out: each is a few MB once read. */
const KEEP_FILES = 7;
const days = new Map<string, Promise<NewsItem[] | "missing">>();

/**
 * A day's headlines, or "missing" when the site has no file for it (the archive starts later). Throws when it
 * couldn't be read (offline, a server error): nothing is kept, so trying again downloads it again. Today's
 * file changes with every update, so it isn't kept.
 */
function loadDay(date: string, today: boolean): Promise<NewsItem[] | "missing"> {
  const kept = days.get(date);
  if (kept) {
    days.delete(date);
    days.set(date, kept);
    return kept;
  }
  const day = fetch(`/data/days/${date}.json`).then(async (res) => {
    if (res.status === 404) return "missing" as const;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return ((await res.json()) as NewsDay).items;
  });
  if (!today) {
    days.set(date, day);
    day.catch(() => days.delete(date));
    for (const old of days.keys()) if (days.size > KEEP_FILES) days.delete(old);
  }
  return day;
}

/** An outlet's headline, however its title is spaced or cased: one outlet's same headline at two addresses is one. */
export const articleKey = (it: NewsItem) => `${it.sourceId}\n${titleKey(it.title)}`;

interface Found {
  date: string;
  items: NewsItem[];
}

/**
 * The search, carried on past the board's 48 hours into the day files of the last 30 days (docs/search.md):
 * newest first, a round of days at a time, so a search that finds plenty early downloads little. It starts
 * from today, since the board holds only each outlet's newest 300 (less than a day for the busiest), and
 * leaves out what the board already shows (`boardKeys`: its links, and each outlet's titles, see
 * articleKey). Give it a `key` that changes with the search and filters.
 */
export function OlderResults({
  search,
  boardKeys,
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
  boardKeys: Set<string>;
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
  /** Where the next round starts: a day of `dates`, and how many of its matches have been shown. */
  const [cursor, setCursor] = useState({ day: 0, shown: 0 });
  /** The day that couldn't be read, if the last round stopped at one. */
  const [failed, setFailed] = useState<string>();
  /** The oldest day read so far. */
  const [reached, setReached] = useState<string>();
  const [busy, setBusy] = useState(true);
  // The board's links change as it refreshes, and the search widens once the word list arrives (useSearch);
  // a search in progress carries on with the latest of each rather than starting over.
  const boardRef = useRef(boardKeys);
  const searchRef = useRef(search);
  useEffect(() => {
    boardRef.current = boardKeys;
    searchRef.current = search;
  }, [boardKeys, search]);
  /** Bumped by each new search and each "Search further back", so a superseded round stops. */
  const roundRef = useRef(0);
  /** False once the component has left the page (a new search, another view): stop downloading. */
  const live = useRef(false);
  /** Each headline shown (see articleKey): some outlets publish the same one at two addresses. */
  const shown = useRef(new Set<string>());
  // Fixed when the search starts: past midnight, "Search further back" carries on from the same day.
  const [dates] = useState(() => keptDates(now));

  const run = async (from: { day: number; shown: number }, round: number, already: number) => {
    setBusy(true);
    setFailed(undefined);
    let count = already;
    let rows = 0;
    let at = from;
    while (at.day < dates.length && at.day < from.day + ROUND_DAYS && count < already + ROUND_FOUND && rows < ROUND_ROWS) {
      const date = dates[at.day];
      let items: NewsItem[] | "missing";
      try {
        items = await loadDay(date, at.day === 0);
      } catch {
        if (round !== roundRef.current || !live.current) return;
        // Offline for a moment, or the server failed: "Search further back" tries this day again.
        setFailed(date);
        break;
      }
      if (round !== roundRef.current || !live.current) return;
      // No file for today yet: the day's first build hasn't run. Older days go on.
      if (items === "missing" && at.day === 0) {
        at = { day: 1, shown: 0 };
        continue;
      }
      // No file for this day: the archive starts after it (it is filling up, see archive.ts).
      if (items === "missing") {
        at = { day: dates.length, shown: 0 };
        break;
      }
      const search = searchRef.current;
      const matching: NewsItem[] = [];
      for (const it of items) {
        const key = articleKey(it);
        if (
          boardRef.current.has(it.link) ||
          boardRef.current.has(key) ||
          (lang !== "all" && it.lang !== lang) ||
          (source && it.sourceId !== source) ||
          (category && it.category !== category) ||
          !search.matches(it.title)
        )
          continue;
        matching.push(it);
      }
      // Carrying on into a day already partly shown, from where it stopped.
      const rest = matching.slice(at.shown).filter((it) => !shown.current.has(articleKey(it)));
      const take = rest.slice(0, ROUND_ROWS - rows);
      for (const it of take) shown.current.add(articleKey(it));
      setReached(date);
      count += take.length;
      rows += take.length;
      if (take.length) {
        setFound((f) => {
          const last = f[f.length - 1];
          return last?.date === date ? [...f.slice(0, -1), { date, items: [...last.items, ...take] }] : [...f, { date, items: take }];
        });
      }
      at = take.length < rest.length ? { day: at.day, shown: at.shown + take.length } : { day: at.day + 1, shown: 0 };
    }
    setCursor(at);
    setBusy(false);
  };

  // The first round, once the reader has stopped typing. A new search or filter is a new key (see the
  // board), so it starts over with a fresh component.
  useEffect(() => {
    live.current = true;
    const round = ++roundRef.current;
    const timer = setTimeout(() => void run({ day: 0, shown: 0 }, round, 0), DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      live.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = found.reduce((n, f) => n + f.items.length, 0);
  const more = cursor.day < dates.length;

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
            {failed && <span>{t.olderFailed(dhakaDate(failed, locale))}</span>}
            {total === 0 && !failed && <span>{t.noOlder}</span>}
            {reached && <span>{t.searchedBackTo(dhakaDate(reached, locale))}</span>}
            {more && (
              <button
                type="button"
                onClick={() => void run(cursor, ++roundRef.current, total)}
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
