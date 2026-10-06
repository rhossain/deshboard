"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { CATEGORIES, type Category } from "@/lib/categories";
import { type Filters, filtersToSearch, type LangFilter, type Order, parseFilters, type View } from "@/lib/filters";
import { sourceProblem } from "@/lib/problems";
import { dedupeByLink } from "@/lib/fetchers/utils";
import { categoryPath, categoryTitle, SITE_TITLE } from "@/lib/site";
import { isFetched } from "@/lib/sources";
import { findStories, itemTime } from "@/lib/stories";
import type { Theme } from "@/lib/theme";
import type { NewsFeed, NewsItem, NewsSeed, NewsSource, SourceResult } from "@/lib/types";
import { useCardPrefs, useIsPhone } from "./card-prefs";
import { CategoryTabs } from "./CategoryTabs";
import { useLastVisit } from "./last-visit";
import { byNewest, LatestList } from "./LatestList";
import { Logo } from "./Logo";
import { useSaved } from "./saved";
import { SavedList } from "./SavedList";
import { ShareOptions, shareUrl } from "./ShareOptions";
import { Logos, SourceCard } from "./SourceCard";
import { TopStories } from "./TopStories";
import { setTheme, useTheme } from "./theme";
import { fullTime, timeAgo } from "./time";
import {
  AutoThemeIcon,
  BookmarkIcon,
  ChevronIcon,
  ClockIcon,
  CloseIcon,
  GridIcon,
  MoonIcon,
  RefreshIcon,
  SearchIcon,
  Segmented,
  SlidersIcon,
  StackIcon,
  SunIcon,
} from "./ui";

/** How often new headlines are published (the timer that starts .github/workflows/deploy.yml). */
const UPDATE_EVERY_MS = 15 * 60 * 1000;
/** The build takes about a minute and Hostinger then copies it, so look for it this long after it's due. */
const PUBLISH_LAG_MS = 2 * 60 * 1000;
/** While an update is overdue, look again this often. */
const RETRY_MS = 60 * 1000;
/** Scrolled less than this, new headlines replace the board at once: nothing the reader is on moves. */
const AT_TOP_PX = 200;
/** How long a Refresh result stays in the status line. */
const NOTICE_MS = 6000;
/** Top stories need this many outlets, unless no story has that many. */
const TOP_MIN_OUTLETS = 3;

const VIEW_OPTIONS: { value: View; label: string }[] = [
  { value: "sources", label: "By source" },
  { value: "top", label: "Top stories" },
  { value: "latest", label: "Latest" },
  { value: "saved", label: "Saved" },
];
const VIEW_ICON: Record<View, typeof GridIcon> = {
  sources: GridIcon,
  top: StackIcon,
  latest: ClockIcon,
  saved: BookmarkIcon,
};
const VIEW_KEYS: Record<string, View> = { "1": "sources", "2": "top", "3": "latest", "4": "saved" };

const SHORTCUTS: [string, string][] = [
  ["/", "Search headlines"],
  ["j / k", "Next / previous headline"],
  ["Enter", "Open the headline"],
  ["s", "Save or unsave the headline"],
  ["1 – 4", "By source, Top stories, Latest, Saved"],
  ["r", "Refresh"],
  ["Esc", "Clear the search, close a panel"],
  ["?", "Show these shortcuts"],
];
const ORDER_OPTIONS: { value: Order; label: string }[] = [
  { value: "default", label: "Editor's order" },
  { value: "newest", label: "Newest first" },
];
const LANG_OPTIONS: { value: LangFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "bn", label: "বাংলা" },
  { value: "en", label: "English" },
];

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: "system", label: "Auto" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const dhakaClock = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit" });

/** When the next update should land: "next around 19:07", or "due any minute" once it's late. */
function nextUpdate(generatedAt: string, now: number): string {
  const due = Date.parse(generatedAt) + UPDATE_EVERY_MS;
  return due > now ? `next around ${dhakaClock.format(due)}` : "next due any minute";
}

const dhakaDate = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Dhaka",
  weekday: "long",
  day: "numeric",
  month: "long",
});

/**
 * The headlines collected by the last build (`npm run fetch`), as a static file next to the page.
 * `priority: "low"` when the page already shows headlines, so it doesn't hold up the logos and fonts.
 */
export async function loadFeed(signal?: AbortSignal, priority: RequestPriority = "auto"): Promise<NewsFeed> {
  const res = await fetch("/data/news.json", { cache: "no-cache", signal, priority });
  if (!res.ok) throw new Error(res.status === 404 ? "no headlines have been collected yet" : `server returned ${res.status}`);
  return (await res.json()) as NewsFeed;
}

const byId = (feed: NewsFeed) => new Map(feed.results.map((r) => [r.sourceId, r]));

/** A newer feed from the automatic refresh, with how many of its headlines the board doesn't show yet. */
type Pending = { feed: NewsFeed; fresh: number };

/** Every headline link in the page, in reading order, skipping folded cards. */
function headlineLinks(): HTMLAnchorElement[] {
  const links = document.querySelectorAll<HTMLAnchorElement>("main a[data-headline]");
  return [...links].filter((a) => !a.closest("[inert]"));
}

/** Moves keyboard focus to the next (1) or previous (-1) headline. */
function focusHeadline(step: 1 | -1) {
  const links = headlineLinks();
  const at = links.indexOf(document.activeElement as HTMLAnchorElement);
  const toolbarBottom = document.querySelector("[data-toolbar]")?.getBoundingClientRect().bottom ?? 0;
  const next = at >= 0 ? links[at + step] : links.find((a) => a.getBoundingClientRect().top > toolbarBottom);
  next?.focus();
  next?.scrollIntoView({ block: "center" });
}

/** The query string the page was opened with ("" while prerendering, where there is none). */
const openedWith = typeof window === "undefined" ? "" : window.location.search;
const noSubscribe = () => () => {};

/**
 * The board with the view and filters from the URL (shared links). The static page is prerendered
 * with the defaults (and a section page's `category`); when the URL asks for something else, the
 * board starts over with it right after hydration.
 */
export function NewsBoardFromUrl({
  sources,
  seed,
  category,
}: {
  sources: NewsSource[];
  seed?: NewsSeed;
  category?: Category;
}) {
  const search = useSyncExternalStore(noSubscribe, () => openedWith, () => "");
  const initial = useMemo(() => {
    const filters = parseFilters(Object.fromEntries(new URLSearchParams(search)), new Set(sources.map((s) => s.id)));
    return category ? { ...filters, category } : filters;
  }, [search, sources, category]);
  return <NewsBoard key={search} sources={sources} initial={initial} seed={seed} />;
}

/**
 * `sources` is every listed portal in display order.
 * `initial` is the view and filters from the URL.
 * `seed` is a few headlines per source baked into the page (see seedResults), shown until the feed loads.
 */
export function NewsBoard({ sources, initial, seed }: { sources: NewsSource[]; initial: Filters; seed?: NewsSeed }) {
  // Latest result per source; on refresh each one is replaced as its new result arrives.
  const [results, setResults] = useState<Map<string, SourceResult>>(() => (seed ? byId(seed) : new Map()));
  const [generatedAt, setGeneratedAt] = useState<string | null>(seed?.generatedAt ?? null);
  const [logos, setLogos] = useState<Pick<NewsFeed, "logos" | "logoShapes">>(() => ({
    logos: seed?.logos ?? {},
    logoShapes: seed?.logoShapes ?? {},
  }));
  const [loading, setLoading] = useState(!seed);
  // The seed is only part of its build's feed, so the first load replaces it even from the same build.
  const partialRef = useRef(!!seed);
  // The whole feed's section counts, from the seed, until the whole feed is here.
  const [seedCounts, setSeedCounts] = useState(seed?.counts);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>(initial.view);
  const [order, setOrder] = useState<Order>(initial.order);
  const [lang, setLang] = useState<LangFilter>(initial.lang);
  const [query, setQuery] = useState(initial.query);
  const [onlySource, setOnlySource] = useState<string>(initial.source);
  const [category, setCategory] = useState<Category | "">(initial.category);
  const [onlyNew, setOnlyNew] = useState(false);
  const [showFailures, setShowFailures] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [sharing, setSharing] = useState<NewsItem | null>(null);
  // An automatic refresh that brought new headlines, held back until the reader asks for it.
  const [pending, setPending] = useState<Pending | null>(null);
  const quietRef = useRef<AbortController | null>(null);
  const resultsRef = useRef(results);
  const generatedAtRef = useRef(generatedAt);
  // What the last Refresh found, shown for a few seconds in the status line.
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const searchRef = useRef<HTMLInputElement>(null);
  // With a seed, the clock starts at its build time so the prerendered page and hydration agree.
  const [now, setNow] = useState(() => (seed ? Date.parse(seed.generatedAt) : Date.now()));
  const controllerRef = useRef<AbortController | null>(null);
  const isPhone = useIsPhone();
  const [cardPrefs, updateCardPrefs] = useCardPrefs();

  const show = useCallback((feed: NewsFeed) => {
    setResults(byId(feed));
    setLogos({ logos: feed.logos, logoShapes: feed.logoShapes });
    setSeedCounts(undefined);
    setGeneratedAt(feed.generatedAt);
    setNow(Date.now());
  }, []);

  /**
   * Load the feed. State is only set from callbacks, so this is safe to call from an effect.
   * `manual` (the Refresh button): say whether there was anything newer, since often there isn't.
   */
  const start = useCallback(
    (manual = false) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      // Only the Refresh button, or a page without a seed, is waiting on it.
      loadFeed(controller.signal, manual || !partialRef.current ? "auto" : "low").then(
        (feed) => {
          const newer = feed.generatedAt !== generatedAtRef.current;
          if (newer || partialRef.current) show(feed);
          partialRef.current = false;
          if (manual) {
            clearTimeout(noticeTimer.current);
            setNotice(
              newer ? "Showing the latest headlines" : `Already up to date · ${nextUpdate(feed.generatedAt, Date.now())}`,
            );
            noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_MS);
          }
          setError(null);
          setLoading(false);
        },
        (err: unknown) => {
          if (controller.signal.aborted) return;
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        },
      );
    },
    [show],
  );

  /** The Refresh button and `r`. */
  const load = useCallback(() => {
    quietRef.current?.abort();
    setPending(null);
    setLoading(true);
    start(true);
  }, [start]);

  useEffect(() => {
    resultsRef.current = results;
    generatedAtRef.current = generatedAt;
  }, [results, generatedAt]);

  /**
   * The automatic refresh fetches in the background. Headlines don't move under the reader: if any
   * are new while they're scrolled down the page, a button offers them; otherwise they apply at once.
   */
  const refreshQuietly = useCallback(() => {
    quietRef.current?.abort();
    const controller = new AbortController();
    quietRef.current = controller;
    loadFeed(controller.signal, "low").then(
      (feed) => {
        if (feed.generatedAt === generatedAtRef.current) return; // No new build since the last look.
        const known = new Set([...resultsRef.current.values()].flatMap((r) => r.items.map((it) => it.link)));
        const fresh = feed.results.reduce((n, r) => n + r.items.filter((it) => !known.has(it.link)).length, 0);
        if (fresh && !document.hidden && window.scrollY > AT_TOP_PX) {
          setPending({ feed, fresh });
        } else {
          show(feed);
          setPending(null);
        }
      },
      () => {}, // A failed background refresh changes nothing; the next one tries again.
    );
  }, [show]);

  const showPending = () => {
    if (!pending) return;
    show(pending.feed);
    setPending(null);
    window.scrollTo({ top: 0 });
  };

  useEffect(() => {
    start();
    const tick = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      controllerRef.current?.abort();
      quietRef.current?.abort();
      clearInterval(tick);
      clearTimeout(noticeTimer.current);
    };
  }, [start]);

  // Look for the next build when it should have landed, then every minute until it has. Browsers
  // pause timers in background tabs, so also look when the page comes back into view or online.
  const newest = pending?.feed.generatedAt ?? generatedAt;
  useEffect(() => {
    if (!newest) return;
    const due = Date.parse(newest) + UPDATE_EVERY_MS + PUBLISH_LAG_MS;
    let timer: ReturnType<typeof setTimeout>;
    const check = () => {
      clearTimeout(timer);
      refreshQuietly();
      timer = setTimeout(check, RETRY_MS);
    };
    const checkIfDue = () => {
      if (!document.hidden && Date.now() >= due) check();
    };
    timer = setTimeout(check, Math.max(due - Date.now(), 0));
    document.addEventListener("visibilitychange", checkIfDue);
    window.addEventListener("online", checkIfDue);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", checkIfDue);
      window.removeEventListener("online", checkIfDue);
    };
  }, [newest, refreshQuietly]);

  // Mirror the view and filters in the URL, so the page can be bookmarked or shared as it is. A
  // section with a page of its own (/news/sports/) uses that address and title.
  useEffect(() => {
    const path = categoryPath(category);
    const search = filtersToSearch({ view, lang, source: onlySource, category: path ? "" : category, query, order });
    const url = (path ?? "/") + search;
    if (url !== window.location.pathname + window.location.search) window.history.replaceState(null, "", url);
    document.title = path && category ? categoryTitle(category) : SITE_TITLE;
  }, [view, lang, onlySource, category, query, order]);

  // Two outlets can list the same article (e.g. a homepage linking a sister site), so keep the first.
  const allItems = useMemo(() => dedupeByLink([...results.values()].flatMap((r) => r.items)), [results]);
  const statuses = useMemo(() => [...results.values()], [results]);
  const hasData = results.size > 0;

  const sourceById = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources]);
  const statusById = results;

  // Headlines since the reader's last visit (none on a first visit).
  const lastVisit = useLastVisit();
  const isNew = useCallback((it: NewsItem) => !!lastVisit && (itemTime(it) ?? "") > lastVisit, [lastVisit]);
  const newCount = useMemo(() => allItems.filter(isNew).length, [allItems, isNew]);

  // The search filters behind the typing: the box keeps up while the results catch up.
  const searchQuery = useDeferredValue(query);

  // Everything except the category filter, so the chips can show counts.
  const matching = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allItems.filter(
      (it) =>
        (lang === "all" || it.lang === lang) &&
        (!onlySource || it.sourceId === onlySource) &&
        (!onlyNew || isNew(it)) &&
        (!q || it.title.toLowerCase().includes(q)),
    );
  }, [allItems, lang, onlySource, onlyNew, isNew, searchQuery]);

  // While only the seed is here, the unfiltered counts come with it, so the tabs don't widen when the
  // whole feed arrives.
  const unfiltered = !onlyNew && lang === "all" && !onlySource && !searchQuery.trim();
  const categoryCounts = useMemo(() => {
    if (seedCounts && unfiltered) return new Map(Object.entries(seedCounts) as [Category, number][]);
    const counts = new Map<Category, number>();
    for (const it of matching) counts.set(it.category, (counts.get(it.category) ?? 0) + 1);
    return counts;
  }, [matching, seedCounts, unfiltered]);
  const matchingCount = useMemo(() => [...categoryCounts.values()].reduce((a, b) => a + b, 0), [categoryCounts]);

  const filtered = useMemo(
    () => (category ? matching.filter((it) => it.category === category) : matching),
    [matching, category],
  );

  // Each source's headlines newest first; undated ones keep their page order at the end.
  const itemsBySource = useMemo(() => {
    const map = new Map<string, NewsItem[]>();
    for (const it of filtered) {
      const list = map.get(it.sourceId);
      if (list) list.push(it);
      else map.set(it.sourceId, [it]);
    }
    for (const list of map.values()) list.sort(byNewest);
    return map;
  }, [filtered]);

  const fetchedCount = useMemo(() => sources.filter(isFetched).length, [sources]);

  // Default: the configured source order. "Newest": the source with the most recent headline first.
  // Either way, sources that are not fetched or failed go last.
  const visibleSources = useMemo(() => {
    const latest = (id: string) => {
      const first = itemsBySource.get(id)?.[0];
      return (first && itemTime(first)) ?? "";
    };
    const broken = (s: NewsSource) => (sourceProblem(s, statusById.get(s.id)) ? 1 : 0);
    return sources
      .filter((s) => (lang === "all" || s.lang === lang) && (!onlySource || s.id === onlySource))
      .sort((a, b) => broken(a) - broken(b) || (order === "newest" ? latest(b.id).localeCompare(latest(a.id)) : 0));
  }, [sources, lang, onlySource, itemsBySource, statusById, order]);

  // Stories are grouped across all outlets in the chosen language (deferred: grouping takes a moment
  // and sources stream in one by one); the other filters then pick stories with a matching headline.
  const storyItems = useDeferredValue(allItems);
  const allStories = useMemo(
    () =>
      view === "top"
        ? findStories(lang === "all" ? storyItems : storyItems.filter((it) => it.lang === lang), { now })
        : [],
    [view, storyItems, lang, now],
  );
  const stories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const matches = allStories.filter((st) =>
      st.items.some(
        (it) =>
          (!onlySource || it.sourceId === onlySource) &&
          (!category || it.category === category) &&
          (!onlyNew || isNew(it)) &&
          (!q || it.title.toLowerCase().includes(q)),
      ),
    );
    const big = matches.filter((st) => st.outlets >= TOP_MIN_OUTLETS);
    return big.length ? big : matches;
  }, [allStories, searchQuery, onlySource, category, onlyNew, isNew]);

  // Saved headlines go through the same filters, except "new".
  const { saved, savedLinks, toggleSaved } = useSaved();
  const savedMatching = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return saved.filter(
      ({ item: it }) =>
        (lang === "all" || it.lang === lang) &&
        (!onlySource || it.sourceId === onlySource) &&
        (!category || it.category === category) &&
        (!q || it.title.toLowerCase().includes(q)),
    );
  }, [saved, lang, onlySource, category, searchQuery]);

  const okCount = statuses.filter((s) => s.ok).length;
  const failures = statuses.filter((s) => !s.ok);
  const filtering = !!searchQuery.trim() || !!category || onlyNew;

  // Filters that live in the sheet on phones; shown as removable pills so they are never hidden state.
  const activeFilters = [
    onlyNew && { key: "new", label: "New only", clear: () => setOnlyNew(false) },
    lang !== "all" && { key: "lang", label: lang === "bn" ? "বাংলা" : "English", clear: () => setLang("all") },
    onlySource && {
      key: "source",
      label: sourceById.get(onlySource)?.name ?? onlySource,
      clear: () => setOnlySource(""),
    },
    view === "sources" &&
      order !== "default" && { key: "order", label: "Newest first", clear: () => setOrder("default") },
  ].filter((f): f is { key: string; label: string; clear: () => void } => !!f);

  const resetFilters = () => {
    setOnlyNew(false);
    setLang("all");
    setOnlySource("");
    setOrder("default");
  };

  /** Saves a card's open/closed state, and its lead headline so later ones can be marked new. */
  const setCollapsed = useCallback(
    (ids: string[], collapsed: boolean) =>
      updateCardPrefs((p) => {
        for (const id of ids) {
          p.collapsed[id] = collapsed;
          const lead = itemsBySource.get(id)?.[0]?.link;
          if (lead) p.seen[id] = lead;
        }
      }),
    [updateCardPrefs, itemsBySource],
  );
  const toggleCard = useCallback((id: string, collapsed: boolean) => setCollapsed([id], collapsed), [setCollapsed]);

  // Labels follow the language filter: Bangla names when only Bangla sources are shown.
  const bn = lang === "bn";
  const categoryTabs = [
    { id: "", label: bn ? "সব" : "All", href: "/", count: matchingCount },
    ...CATEGORIES.map((c) => ({
      id: c.id,
      label: bn ? c.bn : c.label,
      title: bn ? c.label : c.bn,
      href: categoryPath(c.id) ?? `/?cat=${c.id}`,
      count: categoryCounts.get(c.id) ?? 0,
    })),
  ];

  /** Selects a category; from deep in the page, jumps back to the top of the results. */
  const pickCategory = (id: Category | "") => {
    setCategory(id);
    const main = document.querySelector("main");
    const toolbar = document.querySelector("[data-toolbar]");
    if (!main || !toolbar) return;
    const top = main.getBoundingClientRect().top + window.scrollY - toolbar.getBoundingClientRect().height;
    if (window.scrollY > top) window.scrollTo({ top, behavior: "instant" });
  };

  // Phones get the system share menu straight away; elsewhere (or if it's unavailable), the share sheet.
  const shareItem = useCallback(
    (item: NewsItem) => {
      if (isPhone && typeof navigator.share === "function") {
        navigator.share({ title: item.title, url: shareUrl(item) }).catch(() => {});
      } else {
        setSharing(item);
      }
    },
    [isPhone],
  );

  const changeView = useCallback((v: View) => {
    setView(v);
    window.scrollTo({ top: 0 });
  }, []);

  // Keyboard shortcuts (see SHORTCUTS). Ignored while typing or while a panel is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      const typing = (e.target as HTMLElement).closest("input, textarea, select, [contenteditable]");
      if (typing || document.querySelector("dialog[open]")) return;
      // Shift+/ is "?" on most layouts, but some report it as "/" with Shift held.
      const key = e.key === "/" && e.shiftKey ? "?" : e.key;
      if (key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (key === "j" || key === "k") {
        e.preventDefault();
        focusHeadline(key === "j" ? 1 : -1);
      } else if (key === "s") {
        const focused = document.activeElement?.closest<HTMLAnchorElement>("a[data-headline]");
        const link = focused?.href;
        const item = link && (allItems.find((it) => it.link === link) ?? saved.find((e) => e.item.link === link)?.item);
        if (item) toggleSaved(item);
      } else if (key === "r") {
        load();
      } else if (key === "?") {
        setShortcutsOpen(true);
      } else if (VIEW_KEYS[key]) {
        changeView(VIEW_KEYS[key]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [allItems, saved, toggleSaved, load, changeView]);

  const orderControl = <Segmented label="Order" value={order} onChange={setOrder} options={ORDER_OPTIONS} full />;
  const languageControl = <Segmented label="Language" value={lang} onChange={setLang} options={LANG_OPTIONS} full />;
  const sourceSelect = (
    <select
      value={onlySource}
      onChange={(e) => setOnlySource(e.target.value)}
      className="h-11 w-full appearance-none rounded-xl border border-line bg-surface px-3.5 pr-9 text-sm font-medium outline-none focus:border-accent md:h-10"
      aria-label="Filter by source"
    >
      <option value="">All sources</option>
      {sources
        .filter((s) => lang === "all" || s.lang === lang)
        .map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
            {isFetched(s) ? "" : " (unavailable)"}
          </option>
        ))}
    </select>
  );
  const sourceControl = (
    <div className="relative">
      {sourceSelect}
      <ChevronIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
    </div>
  );

  return (
    <Logos value={logos}>
      <div className="min-h-dvh pb-28 md:pb-16">
        {/* Fetch progress */}
        <div className="fixed inset-x-0 top-0 z-40 h-0.5" aria-hidden>
          <div
            className={`h-full bg-accent transition-all duration-500 ${loading ? "opacity-100" : "opacity-0"}`}
            style={{ width: loading ? "40%" : "100%" }}
          />
        </div>

        {/* Masthead */}
        <header className="mx-auto max-w-7xl px-4 pt-[max(env(safe-area-inset-top),1.25rem)] sm:px-6 sm:pt-10">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold" suppressHydrationWarning>
                {dhakaDate.format(now)}
              </p>
              <h1 className="mt-1.5 text-[32px] sm:text-5xl">
                <Logo />
                <span className="sr-only">
                  : {(categoryPath(category) && CATEGORIES.find((c) => c.id === category)?.label) || "Latest"} news
                  from Bangladesh
                </span>
              </h1>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <ThemeButton />
              <button
                type="button"
                onClick={() => load()}
                disabled={loading}
                aria-label={loading ? "Loading headlines" : "Check for new headlines"}
                title="Headlines are collected about every 15 minutes"
                className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-foreground px-3.5 text-sm font-semibold text-background shadow-card transition active:scale-95 disabled:opacity-70 sm:px-5"
              >
                <RefreshIcon spinning={loading} className="h-[18px] w-[18px]" />
                <span className="hidden sm:inline">{loading ? "Loading…" : "Refresh"}</span>
              </button>
            </div>
          </div>

          {/* Status */}
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-muted">
            <span className="inline-flex items-center gap-1.5" aria-live="polite">
              <span className="relative flex h-2 w-2">
                {loading && <span className="absolute inset-0 animate-ping rounded-full bg-accent opacity-60" />}
                <span className="relative h-2 w-2 rounded-full bg-accent" />
              </span>
              {loading ? (
                <span>Loading headlines…</span>
              ) : notice ? (
                <span className="font-medium text-foreground">{notice}</span>
              ) : generatedAt ? (
                <span title={fullTime(generatedAt)}>
                  Updated {timeAgo(generatedAt, now)} · {nextUpdate(generatedAt, now)}
                </span>
              ) : (
                <span>Live</span>
              )}
            </span>
            {hasData && (
              <>
                <span className="whitespace-nowrap">
                  <b className="font-semibold tabular-nums text-foreground">
                    {okCount}/{fetchedCount}
                  </b>{" "}
                  sources
                </span>
                {newCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setOnlyNew((v) => !v)}
                    aria-pressed={onlyNew}
                    title="Headlines since your last visit. Click to show only these."
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold transition ${
                      onlyNew ? "bg-gold text-background" : "bg-gold/15 text-gold"
                    }`}
                  >
                    {!onlyNew && <span className="h-1.5 w-1.5 rounded-full bg-gold" aria-hidden />}
                    {newCount.toLocaleString()} new
                    {onlyNew && <CloseIcon className="h-3 w-3" />}
                  </button>
                )}
                {failures.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowFailures((v) => !v)}
                    aria-expanded={showFailures}
                    className="inline-flex items-center gap-0.5 rounded-full bg-danger-soft px-2.5 py-0.5 text-xs font-semibold text-danger"
                  >
                    {failures.length} failed
                    <ChevronIcon className={`h-3.5 w-3.5 transition ${showFailures ? "rotate-180" : ""}`} />
                  </button>
                )}
              </>
            )}
          </div>

          {showFailures && failures.length > 0 && (
            <ul className="mt-3 grid gap-2 rounded-2xl border border-line bg-surface p-4 text-xs shadow-card sm:grid-cols-2">
              {failures.map((f) => {
                const source = sourceById.get(f.sourceId);
                const problem = source && sourceProblem(source, f);
                return (
                  <li key={f.sourceId} className="leading-relaxed">
                    <span className="font-semibold">{f.sourceName}</span>
                    <span className="text-muted" title={f.error}>
                      {" "}
                      — {problem?.message ?? f.error}
                    </span>
                  </li>
                );
              })}
              <li className="sm:col-span-2">
                <a href="/health" className="font-semibold text-accent hover:underline">
                  Source health: every source&rsquo;s status and history →
                </a>
              </li>
            </ul>
          )}
        </header>

        {/* Toolbar */}
        <div
          data-toolbar
          className="sticky top-0 z-30 mt-5 border-b sm:mt-7 border-line bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl backdrop-saturate-150"
        >
          <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 pt-3 sm:px-6 md:h-16 md:pt-0">
            {/* Views and filters live in the bottom bar and filter sheet on phones. */}
            <nav className="hidden shrink-0 items-center gap-1 md:flex" aria-label="View">
              {VIEW_OPTIONS.map((o) => {
                const Icon = VIEW_ICON[o.value];
                const active = view === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => changeView(o.value)}
                    aria-current={active ? "page" : undefined}
                    className={`inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-full px-4 text-sm font-medium transition active:scale-[0.97] ${
                      active ? "bg-foreground text-background" : "text-muted hover:bg-surface-2 hover:text-foreground"
                    }`}
                  >
                    <Icon className="hidden h-4 w-4 lg:block" />
                    {o.label}
                    {o.value === "saved" && saved.length > 0 && (
                      <span className={`text-xs tabular-nums ${active ? "opacity-60" : "text-muted/80"}`}>
                        {saved.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            <label className="relative min-w-0 flex-1 md:ml-auto md:max-w-xs">
              <span className="sr-only">Search headlines</span>
              <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted" />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Escape") return;
                  setQuery("");
                  e.currentTarget.blur();
                }}
                placeholder="Search headlines / শিরোনাম খুঁজুন"
                enterKeyHint="search"
                className="peer h-11 w-full rounded-full border border-line bg-surface pl-10 pr-10 text-[16px] outline-none transition placeholder:text-muted/80 focus:border-accent focus:ring-4 focus:ring-accent/10 md:h-10 md:text-sm [&::-webkit-search-cancel-button]:hidden"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:text-foreground"
                >
                  <CloseIcon className="h-4 w-4" />
                </button>
              ) : (
                <kbd
                  className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-line px-1.5 font-sans text-[11px] font-semibold text-muted peer-focus:opacity-0 md:block"
                  aria-hidden
                >
                  /
                </kbd>
              )}
            </label>

            <FilterPopover count={activeFilters.length}>
              {view === "sources" && <Field label="Order sources">{orderControl}</Field>}
              <Field label="Language">{languageControl}</Field>
              <Field label="Source">{sourceControl}</Field>
              <button
                type="button"
                onClick={resetFilters}
                disabled={activeFilters.length === 0}
                className="h-10 w-full rounded-xl border border-line text-sm font-semibold transition hover:bg-surface-2 disabled:opacity-40"
              >
                Reset filters
              </button>
            </FilterPopover>
          </div>

          {hasData ? (
            <div className="relative mx-auto -mb-px max-w-7xl md:-mt-1">
              <CategoryTabs tabs={categoryTabs} value={category} onChange={(id) => pickCategory(id as Category | "")} />
            </div>
          ) : (
            <div className="h-3" />
          )}
        </div>

        <main className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 sm:pt-6">
          {activeFilters.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {activeFilters.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={f.clear}
                  className="inline-flex h-8 items-center gap-1 rounded-full bg-accent-soft pl-3 pr-2 text-xs font-semibold text-accent"
                >
                  {f.label}
                  <CloseIcon className="h-3.5 w-3.5" />
                  <span className="sr-only">Remove filter</span>
                </button>
              ))}
            </div>
          )}

          {error && (
            <p className="mb-4 rounded-2xl border border-danger/30 bg-danger-soft p-4 text-sm text-danger">
              Could not load news: {error}
            </p>
          )}

          {!hasData && loading && <SkeletonGrid />}

          {hasData && view !== "saved" && filtering && filtered.length === 0 && (
            <div className="rounded-2xl border border-dashed border-line px-6 py-14 text-center">
              <p className="font-display text-xl">Nothing found</p>
              <p className="mt-1 text-sm text-muted">Try another word or category.</p>
            </div>
          )}

          {hasData && view === "top" && !(filtering && filtered.length === 0) && (
            <TopStories
              stories={stories}
              sourceById={sourceById}
              now={now}
              isNew={isNew}
              savedLinks={savedLinks}
              onToggleSave={toggleSaved}
              onShare={shareItem}
              emptyHint={
                onlySource
                  ? `Nothing from ${sourceById.get(onlySource)?.name ?? "this source"} is covered by other outlets right now.`
                  : filtering
                    ? "No story covered by several outlets matches."
                    : loading
                      ? "Grouping headlines into stories…"
                      : "No story is covered by several outlets yet."
              }
            />
          )}

          {hasData && view === "latest" && (
            <LatestList
              key={filtersToSearch({ view, lang, source: onlySource, category, query: searchQuery, order }) + onlyNew}
              items={filtered}
              sourceById={sourceById}
              now={now}
              isNew={isNew}
              savedLinks={savedLinks}
              onToggleSave={toggleSaved}
              onShare={shareItem}
            />
          )}

          {view === "saved" && (
            <SavedList
              entries={savedMatching}
              total={saved.length}
              sourceById={sourceById}
              now={now}
              onToggleSave={toggleSaved}
              onShare={shareItem}
            />
          )}

          {hasData && view === "sources" && (
            <div className="grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
              {visibleSources.map((s) => (
                <SourceCard
                  key={s.id}
                  source={s}
                  status={statusById.get(s.id)}
                  items={itemsBySource.get(s.id) ?? []}
                  filtering={filtering}
                  now={now}
                  collapsible={isPhone}
                  savedCollapsed={cardPrefs.collapsed[s.id]}
                  seenLead={cardPrefs.seen[s.id]}
                  onToggle={toggleCard}
                  isNew={isNew}
                  savedLinks={savedLinks}
                  onToggleSave={toggleSaved}
                  onShare={shareItem}
                />
              ))}
            </div>
          )}

          <footer className="mt-14 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted">
            <a href="/health" className="hover:text-foreground">
              Source health
            </a>
            <button
              type="button"
              onClick={() => setShortcutsOpen(true)}
              className="hidden hover:text-foreground md:inline"
            >
              Keyboard shortcuts <kbd className="ml-1 rounded border border-line px-1 font-sans">?</kbd>
            </button>
          </footer>
        </main>

        {/* New headlines from the automatic refresh, held back so nothing moves while reading. */}
        {pending && (
          <div className="pointer-events-none fixed inset-x-0 bottom-24 z-30 flex justify-center px-4 md:bottom-8">
            <button
              type="button"
              onClick={showPending}
              className="pointer-events-auto inline-flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-accent-ink shadow-card transition active:scale-95"
            >
              <ChevronIcon className="h-4 w-4 rotate-180" />
              {pending.fresh.toLocaleString()} new headline{pending.fresh === 1 ? "" : "s"}
            </button>
          </div>
        )}

        {/* Bottom bar (phones) */}
        <nav
          className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/90 backdrop-blur-xl backdrop-saturate-150 md:hidden"
          aria-label="View"
        >
          <div className="mx-auto grid h-16 max-w-md grid-cols-5">
            <NavButton active={view === "sources"} onClick={() => changeView("sources")} label="Sources">
              <GridIcon />
            </NavButton>
            <NavButton active={view === "top"} onClick={() => changeView("top")} label="Top">
              <StackIcon />
            </NavButton>
            <NavButton active={view === "latest"} onClick={() => changeView("latest")} label="Latest">
              <ClockIcon />
            </NavButton>
            <NavButton active={view === "saved"} onClick={() => changeView("saved")} label="Saved">
              <BookmarkIcon />
            </NavButton>
            <NavButton active={false} onClick={() => setFiltersOpen(true)} label="Filters" badge={activeFilters.length}>
              <SlidersIcon />
            </NavButton>
          </div>
        </nav>

        <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters">
          <div className="space-y-6">
            {view === "sources" && <Field label="Order sources">{orderControl}</Field>}
            {view === "sources" && (
              <Field label="Source cards">
                <div className="flex gap-2">
                  {[
                    { label: "Expand all", collapsed: false },
                    { label: "Collapse all", collapsed: true },
                  ].map((b) => (
                    <button
                      key={b.label}
                      type="button"
                      onClick={() =>
                        setCollapsed(
                          visibleSources.map((src) => src.id),
                          b.collapsed,
                        )
                      }
                      className="h-11 flex-1 rounded-xl border border-line bg-surface-2 text-sm font-medium transition active:scale-[0.98]"
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted">
                  Tap a source&rsquo;s name to fold it. Your choice is remembered.
                </p>
              </Field>
            )}
            <Field label="Language">{languageControl}</Field>
            <Field label="Source">{sourceControl}</Field>
            <Field label="Appearance">
              <ThemeSetting />
            </Field>
          </div>
          <div className="mt-8 flex gap-3">
            <button
              type="button"
              onClick={resetFilters}
              disabled={activeFilters.length === 0}
              className="h-12 flex-1 rounded-xl border border-line text-sm font-semibold transition active:scale-[0.98] disabled:opacity-40"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => setFiltersOpen(false)}
              className="h-12 flex-[2] rounded-xl bg-foreground text-sm font-semibold text-background transition active:scale-[0.98]"
            >
              Show {filtered.length.toLocaleString()} headlines
            </button>
          </div>
        </Sheet>

        <Sheet open={!!sharing} onClose={() => setSharing(null)} title="Share headline">
          {sharing && (
            <ShareOptions item={sharing} sourceName={sourceById.get(sharing.sourceId)?.name ?? sharing.sourceName} />
          )}
        </Sheet>

        <Sheet open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} title="Keyboard shortcuts">
          <dl className="grid grid-cols-[auto_1fr] items-center gap-x-5 gap-y-3 text-sm">
            {SHORTCUTS.map(([keys, what]) => (
              <div key={keys} className="contents">
                <dt className="text-right">
                  <kbd className="rounded-md border border-line bg-surface-2 px-2 py-0.5 font-sans text-xs font-semibold">
                    {keys}
                  </kbd>
                </dt>
                <dd className="text-muted">{what}</dd>
              </div>
            ))}
          </dl>
        </Sheet>
      </div>
    </Logos>
  );
}

const THEME_ICON: Record<Theme, typeof SunIcon> = { system: AutoThemeIcon, light: SunIcon, dark: MoonIcon };
const NEXT_THEME: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };

/** Cycles Auto → Light → Dark. The icon shows the current setting. */
function ThemeButton() {
  const theme = useTheme();
  const Icon = THEME_ICON[theme];
  const label = (t: Theme) => THEME_OPTIONS.find((o) => o.value === t)!.label;
  return (
    <button
      type="button"
      onClick={() => setTheme(NEXT_THEME[theme])}
      aria-label={`Theme: ${label(theme)}. Switch to ${label(NEXT_THEME[theme])}`}
      title={`Theme: ${label(theme)}`}
      className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface text-foreground shadow-card transition active:scale-95"
    >
      <Icon className="h-[18px] w-[18px]" />
    </button>
  );
}

function ThemeSetting() {
  return <Segmented label="Theme" value={useTheme()} onChange={setTheme} options={THEME_OPTIONS} full />;
}

function NavButton({
  active,
  onClick,
  label,
  badge = 0,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  badge?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`relative flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition active:scale-95 ${
        active ? "text-accent" : "text-muted"
      }`}
    >
      <span className="relative">
        {children}
        {badge > 0 && (
          <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] text-accent-ink">
            {badge}
          </span>
        )}
      </span>
      {label}
    </button>
  );
}

/**
 * The Filters button on tablets and desktops, with its panel as a native popover (outside clicks and
 * Escape close it). The panel follows the button as the page scrolls and the toolbar sticks.
 */
function FilterPopover({ count, children }: { count: number; children: React.ReactNode }) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const place = useCallback(() => {
    const r = button.current?.getBoundingClientRect();
    const el = panel.current;
    if (!r || !el) return;
    el.style.top = `${r.bottom + 8}px`;
    el.style.right = `${Math.max(8, window.innerWidth - r.right)}px`;
  }, []);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", place, { capture: true, passive: true });
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, { capture: true });
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  return (
    <>
      <button
        ref={button}
        type="button"
        popoverTarget={id}
        aria-expanded={open}
        className={`hidden h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition active:scale-[0.97] md:inline-flex ${
          open || count > 0
            ? "border-accent/40 bg-accent-soft text-accent"
            : "border-line bg-surface text-foreground hover:bg-surface-2"
        }`}
      >
        <SlidersIcon className="h-4 w-4" />
        Filters
        {count > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold tabular-nums text-accent-ink">
            {count}
          </span>
        )}
      </button>
      <div
        ref={panel}
        id={id}
        popover="auto"
        onBeforeToggle={(e) => e.newState === "open" && place()}
        onToggle={(e) => setOpen(e.newState === "open")}
        aria-label="Filters"
        className="fixed inset-auto m-0 w-80 space-y-5 rounded-2xl border border-line bg-surface p-5 text-foreground shadow-card"
      >
        {children}
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</p>
      {children}
    </div>
  );
}

/** A modal bottom sheet built on <dialog>, so focus trapping and Escape come from the browser. */
function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="sheet"
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      aria-label={title}
    >
      <div className="pb-safe rounded-t-3xl border border-line bg-surface shadow-2xl sm:rounded-3xl">
        <div className="px-5 pb-6 pt-3">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line sm:hidden" aria-hidden />
          <div className="mb-5 flex items-center justify-between">
            <h2 className="font-display text-2xl font-semibold">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-muted hover:text-foreground"
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>
          {children}
        </div>
      </div>
    </dialog>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3" aria-busy>
      <p className="col-span-full text-center text-sm text-muted">
        Gathering headlines from every source… the first load can take 10–20 seconds.
      </p>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="rounded-2xl border border-line bg-surface p-4 shadow-card">
          <div className="skeleton h-8 w-32 rounded-lg" />
          <div className="mt-5 space-y-4">
            {Array.from({ length: 5 }, (_, j) => (
              <div key={j} className="skeleton h-3.5 rounded-full" style={{ width: `${95 - j * 9}%` }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
