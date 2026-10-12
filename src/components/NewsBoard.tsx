"use client";

import {
  Fragment,
  lazy,
  startTransition,
  Suspense,
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { sourceName } from "@/lib/bn-names";
import { CATEGORIES, type Category } from "@/lib/categories";
import { DEFAULT_FILTERS, type Filters, filtersToSearch, type LangFilter, type Order, type View } from "@/lib/filters";
import { usePlansVisible } from "@/lib/plans";
import { sourceProblem } from "@/lib/problems";
import { dedupeByLink } from "@/lib/fetchers/utils";
import { sectionIntro, VIDEOS_INTRO } from "@/lib/intros";
import { type Locale, localePath } from "@/lib/i18n";
import { boardHeading, categoryPath, categoryTitle, siteTitle, VIDEOS_PATH, videosTitle } from "@/lib/site";
import { STRINGS, type Strings } from "@/lib/strings";
import { isFetched } from "@/lib/sources";
import { compileSearch } from "@/lib/search";
import { countSince, findStories, itemTime, newestFirst } from "@/lib/stories";
import type { Theme } from "@/lib/theme";
import type { LogoShape, NewsItem, NewsSource, NewsStreamMessage, SourceResult, Video, VideoFeed } from "@/lib/types";
import { PHONE, useCardPrefs, useIsPhone } from "./card-prefs";
import { CategoryTabs } from "./CategoryTabs";
import { useLastVisit } from "./last-visit";
import { LocaleProvider, useStrings } from "./locale";
import { byNewest, LatestList } from "./LatestList";
import { Avatar, useAccount } from "./account";
import { BartaboardLogo } from "./BartaboardLogo";
import { InspiredBy, SITE_LINKS, siteLinkHref } from "./InfoPage";
import { PageNotes } from "./PageNotes";
import { setNewsDensity, useNewsDensity } from "./news-density";
import { SearchProvider } from "./Highlight";
import { MAX_PINS, pinRanks, togglePin, usePinnedSources } from "./pinned";
import { PinPicker, PinsButton } from "./PinPicker";
import { useSaved, useSavedVideos } from "./saved";
import { SavedList } from "./SavedList";
import { AUTO_REFRESH_MS } from "./schedule";
import { type Shareable, ShareOptions, shareUrl, videoShareUrl } from "./ShareOptions";
import { LogoShapes, SourceCard } from "./SourceCard";
import { TopStories } from "./TopStories";
import { setTheme, useTheme } from "./theme";
import { cachedVideos, loadVideoBoard, prefetchVideos } from "./videos";
import { VideoSkeleton } from "./VideoSkeleton";
import { dhakaDate, dhakaShortDate, formatCount, fullTime, timeAgo } from "./time";
import {
  AutoThemeIcon,
  BookmarkIcon,
  ChevronIcon,
  CloseIcon,
  MoonIcon,
  RefreshIcon,
  SearchIcon,
  Segmented,
  Sheet,
  SlidersIcon,
  NewspaperIcon,
  StarIcon,
  SunIcon,
  UserIcon,
  VideoIcon,
} from "./ui";

/** The Videos view is a separate download, fetched only when the reader heads for it. */
const VideoBoard = lazy(loadVideoBoard);

/** Top stories need this many outlets, unless no story has that many. */
const TOP_MIN_OUTLETS = 3;

/** The site's sections. News holds three views of the headlines; the others are one view each. */
type Section = "news" | "videos" | "saved";
const sectionOf = (v: View): Section => (v === "videos" || v === "saved" ? v : "news");
const SECTIONS: { value: Section; Icon: typeof VideoIcon }[] = [
  { value: "news", Icon: NewspaperIcon },
  { value: "videos", Icon: VideoIcon },
  { value: "saved", Icon: BookmarkIcon },
];
/** The switch at the top of News. */
const newsViews = (t: Strings): { value: View; label: string }[] => [
  { value: "sources", label: t.views.sources },
  { value: "top", label: t.views.top },
  { value: "latest", label: t.views.latest },
];
const VIEW_KEYS: Record<string, View> = { "1": "sources", "2": "top", "3": "latest", "4": "videos", "5": "saved" };

const shortcuts = (t: Strings): [string, string][] => [
  ["/", t.shortcuts.search],
  ["j / k", t.shortcuts.next],
  ["Enter", t.shortcuts.open],
  ["s", t.shortcuts.save],
  ["1 – 5", t.shortcuts.views],
  ["r", t.shortcuts.refresh],
  ["Esc", t.shortcuts.escape],
  ["?", t.shortcuts.help],
];
const orderOptions = (t: Strings): { value: Order; label: string }[] => [
  { value: "default", label: t.order.default },
  { value: "newest", label: t.order.newest },
];
const langOptions = (t: Strings): { value: LangFilter; label: string }[] => [
  { value: "all", label: t.langFilter.all },
  { value: "bn", label: t.langFilter.bn },
  { value: "en", label: t.langFilter.en },
];

const themeOptions = (t: Strings): { value: Theme; label: string }[] => [
  { value: "system", label: t.theme.system },
  { value: "light", label: t.theme.light },
  { value: "dark", label: t.theme.dark },
];

/**
 * Read /api/news/stream, calling `onSource` for each source as it arrives. Resolves with `generatedAt`.
 * `priority: "low"` when the page already shows headlines, so it doesn't hold up the logos and fonts.
 */
async function streamNews(
  force: boolean,
  signal: AbortSignal,
  onSource: (result: SourceResult) => void,
  priority: RequestPriority = "auto",
): Promise<string> {
  const res = await fetch(`/api/news/stream${force ? "?refresh=1" : ""}`, { cache: "no-store", signal, priority });
  if (!res.ok || !res.body) throw new Error(`Server returned ${res.status}`);

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let generatedAt = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      const msg = JSON.parse(line) as NewsStreamMessage;
      if (msg.type === "source") onSource(msg.result);
      else generatedAt = msg.generatedAt;
    }
  }
  if (!generatedAt) throw new Error("Connection closed before all sources were fetched");
  return generatedAt;
}

/**
 * GET /api/news/head: every source's newest cached headlines, all the cards show (see NewsSeed).
 * Fails while the server has nothing cached yet.
 */
async function loadHead(category: Category | undefined, signal: AbortSignal, priority: RequestPriority): Promise<NewsSeed> {
  const res = await fetch(`/api/news/head${category ? `?category=${category}` : ""}`, { cache: "no-store", signal, priority });
  if (!res.ok) throw new Error(`Server returned ${res.status}`);
  return (await res.json()) as NewsSeed;
}

const byId = (results: SourceResult[]) => new Map(results.map((r) => [r.sourceId, r]));

/** A background refresh, with how many of its headlines the board doesn't show yet. */
type Pending = { apply: () => void; fresh: number };

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

/** A few cached headlines per source, rendered with the page (see cachedSeed) until the stream replaces them. */
export interface NewsSeed {
  generatedAt: string;
  results: SourceResult[];
  /** Headlines per section in the whole cache, so the section tabs start out with their final counts. */
  counts: Partial<Record<Category, number>>;
  /** The section the page is for, if any: `totals` count only its headlines. */
  category?: Category;
  /** Source id → its headlines in the whole cache, so each card starts out at its final size. */
  totals: Record<string, number>;
  /** Every headline in the whole cache by age (see ageSteps), for the "new since your last visit" count. */
  ages: number[];
  logoShapes: Record<string, LogoShape | null>;
}

const NO_SHAPES: Record<string, LogoShape | null> = {};

/**
 * `sources` is every listed portal in display order; only the fetchable ones are requested.
 * `initial` is the view and filters from the URL.
 * `seed` is shown from the first paint; each source's result is replaced as the stream delivers it.
 */
export function NewsBoard({
  sources: listed,
  initial,
  seed,
  videoSeed,
  locale = "en",
}: {
  sources: NewsSource[];
  initial: Filters;
  seed?: NewsSeed;
  /** The newest few cached videos, for the Videos page (see cachedVideoSeed). */
  videoSeed?: VideoFeed;
  /** The interface language: Bangla on /bn pages (see src/lib/i18n.ts). */
  locale?: Locale;
}) {
  const t = STRINGS[locale];
  // Outlets by their Bangla names on Bangla pages (in the filters, pin picker, Latest and Top stories).
  const sources = useMemo(
    () => (locale === "bn" ? listed.map((s) => ({ ...s, name: sourceName(s.id, s.name, locale) })) : listed),
    [listed, locale],
  );
  // Latest result per source; on refresh each one is replaced as its new result arrives.
  const [results, setResults] = useState<Map<string, SourceResult>>(
    () => new Map(seed?.results.map((r) => [r.sourceId, r])),
  );
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  // A page opened on Videos doesn't load the headlines until the reader leaves it.
  const videosFirst = initial.view === "videos";
  const [loading, setLoading] = useState(!videosFirst);
  const [received, setReceived] = useState(0);
  // The whole cache's section and card counts and headline ages, from the seed or /api/news/head,
  // until the stream has delivered every source; and the results they came with.
  const [seedCounts, setSeedCounts] = useState(seed?.counts);
  const [seedTotals, setSeedTotals] = useState(seed?.totals);
  const [seedAges, setSeedAges] = useState(seed?.ages);
  const [partResults, setPartResults] = useState(() => byId(seed?.results ?? []));
  // The section the seed and head are cut for: the page's.
  const pageCategory = seed?.category;
  // Every source's whole result has streamed in, and a stream is under way.
  const [whole, setWhole] = useState(false);
  const streamingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>(initial.view);
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  // Bumped by Refresh in the Videos view, which then looks for new videos instead of headlines.
  const [videoRefresh, setVideoRefresh] = useState(0);
  // The toolbar's place for the Videos view's channel rail.
  const [videoRail, setVideoRail] = useState<HTMLDivElement | null>(null);
  const [order, setOrder] = useState<Order>(initial.order);
  const [lang, setLang] = useState<LangFilter>(initial.lang);
  const [query, setQuery] = useState(initial.query);
  const [onlySource, setOnlySource] = useState<string>(initial.source);
  const [category, setCategory] = useState<Category | "">(initial.category);
  const [onlyNew, setOnlyNew] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [pinsOpen, setPinsOpen] = useState(false);
  const [sharing, setSharing] = useState<Shareable | null>(null);
  // An automatic refresh that brought new headlines, held back until the reader asks for it.
  const [pending, setPending] = useState<Pending | null>(null);
  const quietRef = useRef<AbortController | null>(null);
  const resultsRef = useRef(results);
  const searchRef = useRef<HTMLInputElement>(null);
  // With a seed, the clock starts at its render time so the server's HTML and hydration agree.
  const [now, setNow] = useState(() => Date.parse(seed?.generatedAt ?? videoSeed?.generatedAt ?? "") || Date.now());
  const controllerRef = useRef<AbortController | null>(null);
  // These four come from the browser (screen width, local storage), so right after hydration they can
  // differ from the prerendered page, and every card has to be drawn again. Deferred, that redraw runs
  // in short slices like any other transition instead of one long task.
  const isPhone = useDeferredValue(useIsPhone());
  const [cardPrefsNow, updateCardPrefs] = useCardPrefs();
  const cardPrefs = useDeferredValue(cardPrefsNow);
  const [pinsNow, updatePins] = usePinnedSources();
  const pins = useDeferredValue(pinsNow);

  // Every source's whole cache is thousands of headlines, a lot to read and draw on a slow phone. Until
  // the reader looks past each source's newest (another view, a search or filter, a section other than
  // the page's, a card opened in full), /api/news/head stands in for the stream.
  const [wantAll, setWantAll] = useState(false);
  const showAllCards = useCallback(() => setWantAll(true), []);
  const needsWhole =
    view === "top" ||
    view === "latest" ||
    !!query.trim() ||
    lang !== "all" ||
    !!onlySource ||
    onlyNew ||
    (category || undefined) !== pageCategory ||
    wantAll;

  /** Shows a head: each card's newest headlines, with the whole cache's counts. */
  const showHead = useCallback((head: NewsSeed) => {
    const map = byId(head.results);
    startTransition(() => {
      setResults(map);
      setPartResults(map);
      setSeedCounts(head.counts);
      setSeedTotals(head.totals);
      setSeedAges(head.ages);
      setWhole(false);
      setGeneratedAt(head.generatedAt);
      setNow(Date.now());
    });
  }, []);

  /** Start streaming. State is only set from callbacks, so this is safe to call from an effect. */
  const start = useCallback((force: boolean, priority?: RequestPriority) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    streamingRef.current = true;
    const done = () => {
      if (controllerRef.current === controller) streamingRef.current = false;
    };

    streamNews(
      force,
      controller.signal,
      (result) => {
        // A transition: React draws each source's headlines in short slices, between which the page
        // stays responsive, instead of in one long task.
        startTransition(() => setResults((prev) => new Map(prev).set(result.sourceId, result)));
        setReceived((n) => n + 1);
      },
      priority,
    ).then(
      (at) => {
        done();
        setSeedCounts(undefined);
        setSeedTotals(undefined);
        setSeedAges(undefined);
        setWhole(true);
        setGeneratedAt(at);
        setError(null);
        setNow(Date.now());
        setLoading(false);
      },
      (err: unknown) => {
        done();
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      },
    );
  }, []);

  /** Load the page's head; with nothing cached on the server yet, stream instead. */
  const startHead = useCallback(
    (priority: RequestPriority) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      loadHead(pageCategory, controller.signal, priority).then(
        (head) => {
          showHead(head);
          setError(null);
          setLoading(false);
        },
        () => {
          if (!controller.signal.aborted) start(false, priority);
        },
      );
    },
    [pageCategory, showHead, start],
  );

  const load = useCallback(
    (force = false) => {
      if (viewRef.current === "videos") {
        setVideoRefresh((n) => n + 1);
        return;
      }
      quietRef.current?.abort();
      setPending(null);
      setLoading(true);
      setReceived(0);
      start(force);
    },
    [start],
  );

  const wholeRef = useRef(whole);
  useEffect(() => {
    resultsRef.current = results;
    wholeRef.current = whole;
  }, [results, whole]);

  /**
   * The automatic refresh fetches in the background. Headlines don't move under the reader: if any
   * are new, a button offers them; with nothing new, or while the page is hidden, they apply at once.
   */
  const refreshQuietly = useCallback(() => {
    quietRef.current?.abort();
    const controller = new AbortController();
    quietRef.current = controller;
    // New headlines are offered with a button; with nothing new, or while the page is hidden, they apply at once.
    const offer = (results: Map<string, SourceResult>, apply: () => void) => {
      const known = new Set([...resultsRef.current.values()].flatMap((r) => r.items.map((it) => it.link)));
      const fresh = [...results.values()].reduce((n, r) => n + r.items.filter((it) => !known.has(it.link)).length, 0);
      if (fresh && !document.hidden) {
        setPending({ apply, fresh });
      } else {
        apply();
        setPending(null);
      }
    };
    if (!wholeRef.current) {
      loadHead(pageCategory, controller.signal, "low").then(
        (head) => offer(byId(head.results), () => showHead(head)),
        () => {}, // A failed background refresh changes nothing; the next one tries again.
      );
      return;
    }
    const next = new Map<string, SourceResult>();
    streamNews(false, controller.signal, (result) => next.set(result.sourceId, result), "low").then(
      (at) =>
        offer(next, () =>
          startTransition(() => {
            setResults(next);
            setGeneratedAt(at);
            setNow(Date.now());
          }),
        ),
      () => {}, // A failed background refresh changes nothing; the next one tries again.
    );
  }, [pageCategory, showHead]);

  const showPending = () => {
    if (!pending) return;
    pending.apply();
    setPending(null);
    window.scrollTo({ top: 0 });
  };

  // Behind the seed's headlines, the first load isn't what the reader is waiting on. A page opened with
  // other filters needs the stream; otherwise the head fills the cards.
  const seeded = !!seed;
  const needsWholeRef = useRef(needsWhole);
  useEffect(() => {
    needsWholeRef.current = needsWhole;
  }, [needsWhole]);
  useEffect(() => {
    const priority = seeded ? "low" : "auto";
    if (!videosFirst) {
      if (needsWholeRef.current) start(false, priority);
      else startHead(priority);
    }
    // The Videos view looks for its own updates; the headlines wait until the reader is back.
    const refresh = setInterval(() => viewRef.current !== "videos" && refreshQuietly(), AUTO_REFRESH_MS);
    const tick = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      controllerRef.current?.abort();
      quietRef.current?.abort();
      clearInterval(refresh);
      clearInterval(tick);
    };
  }, [start, startHead, refreshQuietly, seeded, videosFirst]);
  useEffect(() => {
    if (!videosFirst || view === "videos" || controllerRef.current) return;
    if (needsWholeRef.current) load();
    else startHead("auto");
  }, [videosFirst, view, load, startHead]);
  // Once loading has begun, wanting more than the head streams every source's whole cache.
  useEffect(() => {
    if (!needsWhole || whole || streamingRef.current || !controllerRef.current) return;
    setLoading(true);
    setReceived(0);
    start(false);
  }, [needsWhole, whole, start]);

  // Mirror the view and filters in the URL, so the page can be bookmarked or shared as it is. A
  // section with a page of its own (/news/sports) uses that address and title, and so does Videos
  // (/videos, where only the search applies); an old /?view=videos link lands there too.
  // Bangla pages keep to their /bn addresses.
  useEffect(() => {
    if (view === "videos") {
      const url = localePath(VIDEOS_PATH, locale) + filtersToSearch({ ...DEFAULT_FILTERS, query });
      if (url !== window.location.pathname + window.location.search) window.history.replaceState(null, "", url);
      document.title = videosTitle(locale);
      return;
    }
    const path = categoryPath(category);
    const search = filtersToSearch({ view, lang, source: onlySource, category: path ? "" : category, query, order });
    const url = localePath(path ?? "/", locale) + search;
    if (url !== window.location.pathname + window.location.search) window.history.replaceState(null, "", url);
    document.title = path && category ? categoryTitle(category, locale) : siteTitle(locale);
  }, [view, lang, onlySource, category, query, order, locale]);

  // Two outlets can list the same article (e.g. a homepage linking a sister site), so keep the first.
  const allItems = useMemo(() => dedupeByLink([...results.values()].flatMap((r) => r.items)), [results]);
  const statuses = useMemo(() => [...results.values()], [results]);
  const hasData = results.size > 0;

  const sourceById = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources]);
  // The reader's own sources and their places; empty while "Pinned first" is off.
  const sourceRank = useMemo(() => pinRanks(pins, new Set(sourceById.keys())), [pins, sourceById]);
  const statusById = results;

  // Headlines since the reader's last visit (none on a first visit).
  const lastVisit = useDeferredValue(useLastVisit());
  const isNew = useCallback((it: NewsItem) => !!lastVisit && (itemTime(it) ?? "") > lastVisit, [lastVisit]);
  const newCount = useMemo(
    () =>
      lastVisit && seedAges && generatedAt
        ? countSince(seedAges, generatedAt, lastVisit)
        : allItems.filter(isNew).length,
    [allItems, isNew, lastVisit, seedAges, generatedAt],
  );

  // The search filters behind the typing: the box keeps up while the results catch up.
  const searchQuery = useDeferredValue(query);
  const search = useMemo(() => compileSearch(searchQuery), [searchQuery]);
  const filtering = !!search || !!category || onlyNew;

  // Everything except the category filter, so the chips can show counts.
  const matching = useMemo(
    () =>
      allItems.filter(
        (it) =>
          (lang === "all" || it.lang === lang) &&
          (!onlySource || it.sourceId === onlySource) &&
          (!onlyNew || isNew(it)) &&
          (!search || search.matches(it.title)),
      ),
    [allItems, lang, onlySource, onlyNew, isNew, search],
  );

  // Until the stream has delivered every source, the unfiltered counts come with the seed, so the
  // tabs don't widen as sources arrive.
  const unfiltered = !onlyNew && lang === "all" && !onlySource && !search;
  const categoryCounts = useMemo(() => {
    if (seedCounts && unfiltered) return new Map(Object.entries(seedCounts) as [Category, number][]);
    const counts = new Map<Category, number>();
    for (const it of matching) counts.set(it.category, (counts.get(it.category) ?? 0) + 1);
    return counts;
  }, [matching, seedCounts, unfiltered]);
  // Each card's final size while it still shows the seed's or head's headlines (counted with the default filters).
  const cardTotals = seedTotals && unfiltered && (category || undefined) === pageCategory ? seedTotals : undefined;
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

  // The reader's pinned sources first, in their order. Then by default the configured source order, or
  // with "Newest" the source with the most recent headline first. Either way, sources that are not
  // fetched or failed go last (among the pinned ones, and among the rest).
  const visibleSources = useMemo(() => {
    const latest = (id: string) => {
      const first = itemsBySource.get(id)?.[0];
      return (first && itemTime(first)) ?? "";
    };
    const rank = (s: NewsSource) => sourceRank.get(s.id) ?? MAX_PINS;
    const broken = (s: NewsSource) => (sourceProblem(s, statusById.get(s.id)) ? 1 : 0);
    const pinnedFirst = (a: NewsSource, b: NewsSource) =>
      +sourceRank.has(b.id) - +sourceRank.has(a.id) || broken(a) - broken(b) || rank(a) - rank(b);
    return sources
      .filter((s) => (lang === "all" || s.lang === lang) && (!onlySource || s.id === onlySource))
      .sort(
        (a, b) =>
          pinnedFirst(a, b) || (order === "newest" ? newestFirst(latest(a.id), latest(b.id)) : 0),
      );
  }, [sources, lang, onlySource, itemsBySource, statusById, order, sourceRank]);
  // Where the pinned cards end in visibleSources, when both they and others are on show (only cards that
  // render count: a search or category leaves out cards with nothing matching); 0 for no headings.
  const pinnedCards = useMemo(() => {
    const shows = (s: NewsSource) => !filtering || !!itemsBySource.get(s.id)?.length;
    const mine = visibleSources.filter((s) => sourceRank.has(s.id));
    const others = visibleSources.filter((s) => !sourceRank.has(s.id));
    return mine.some(shows) && others.some(shows) ? mine.length : 0;
  }, [visibleSources, sourceRank, itemsBySource, filtering]);

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
    const matches = allStories.filter((st) =>
      st.items.some(
        (it) =>
          (!onlySource || it.sourceId === onlySource) &&
          (!category || it.category === category) &&
          (!onlyNew || isNew(it)) &&
          (!search || search.matches(it.title)),
      ),
    );
    const big = matches.filter((st) => st.outlets >= TOP_MIN_OUTLETS);
    return big.length ? big : matches;
  }, [allStories, search, onlySource, category, onlyNew, isNew]);

  // Saved headlines go through the same filters, except "new".
  const { saved, savedLinks: savedLinksNow, toggleSaved } = useSaved();
  const savedLinks = useDeferredValue(savedLinksNow);
  const savedMatching = useMemo(
    () =>
      saved.filter(
        ({ item: it }) =>
          (lang === "all" || it.lang === lang) &&
          (!onlySource || it.sourceId === onlySource) &&
          (!category || it.category === category) &&
          (!search || search.matches(it.title)),
      ),
    [saved, lang, onlySource, category, search],
  );
  // Saved videos only go through the search: they are TV channels' Bangla videos, with no source or
  // category of the board's, so a source, category or English filter leaves them out.
  const { savedVideos, toggleSavedVideo } = useSavedVideos();
  const savedVideosMatching = useMemo(() => {
    if (lang === "en" || onlySource || category) return [];
    return search ? savedVideos.filter((e) => search.matches(e.video.title)) : savedVideos;
  }, [savedVideos, lang, onlySource, category, search]);
  const savedCount = saved.length + savedVideos.length;

  // Single sources failing are explained on their cards (and on /health); half or more failing two
  // updates in a row is an outage worth saying at the top (one bad update is usually Google News
  // turning us away for a moment, and their earlier headlines stay). Judged once every source has reported.
  const failedCount = statuses.filter((s) => !s.ok && !!s.failingSince && s.failingSince < s.fetchedAt).length;
  const outage = !loading && statuses.length >= fetchedCount && failedCount * 2 >= fetchedCount;

  // Filters that live in the sheet on phones; shown as removable pills so they are never hidden state.
  const activeFilters = [
    onlyNew && { key: "new", label: t.newOnly, clear: () => setOnlyNew(false) },
    lang !== "all" && { key: "lang", label: t.langFilter[lang], clear: () => setLang("all") },
    onlySource && {
      key: "source",
      label: sourceById.get(onlySource)?.name ?? onlySource,
      clear: () => setOnlySource(""),
    },
    view === "sources" &&
      order !== "default" && { key: "order", label: t.order.newest, clear: () => setOrder("default") },
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

  const pinnedIds = useMemo(() => new Set(pins.ids), [pins]);
  /** A card's star. Pinning turns "Pinned first" back on; with no room left, the picker opens instead. */
  const toggleSourcePin = useCallback(
    (id: string) => {
      if (!pinsNow.ids.includes(id) && pinsNow.ids.length >= MAX_PINS) return setPinsOpen(true);
      updatePins((p) => {
        const next = togglePin(p, id);
        return next.ids.includes(id) ? { ...next, off: false } : next;
      });
    },
    [pinsNow, updatePins],
  );
  const pinOptions = useMemo(
    () =>
      sources.map((s) => ({
        id: s.id,
        name: s.name,
        hint: `${t.kinds[s.kind] ?? s.kind} · ${t.lang[s.lang]}${isFetched(s) ? "" : ` · ${t.unavailable}`}`,
      })),
    [sources, t],
  );

  // Labels follow the language filter (Bangla names when only Bangla sources are shown) and are always
  // Bangla on Bangla pages.
  const bn = lang === "bn" || locale === "bn";
  const categoryTabs = [
    { id: "", label: bn ? "সব" : "All", href: localePath("/", locale), count: matchingCount },
    ...CATEGORIES.map((c) => ({
      id: c.id,
      label: bn ? c.bn : c.label,
      title: bn ? c.label : c.bn,
      href: localePath(categoryPath(c.id) ?? `/?cat=${c.id}`, locale),
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
  const share = useCallback((shared: Shareable) => {
    if (window.matchMedia(PHONE).matches && typeof navigator.share === "function") {
      navigator.share({ title: shared.title, url: shared.url }).catch(() => {});
    } else {
      setSharing(shared);
    }
  }, []);
  const shareItem = useCallback(
    (item: NewsItem) =>
      share({
        title: item.title,
        url: shareUrl(item),
        sourceName: sourceById.get(item.sourceId)?.name ?? item.sourceName,
      }),
    [share, sourceById],
  );
  const shareVideo = useCallback(
    (video: Video, channelName: string) =>
      share({ title: video.title, url: videoShareUrl(video.id), sourceName: channelName, video: true }),
    [share],
  );

  // Hovering, pressing or tabbing to Videos starts its download, ahead of the click.
  const videoIntent = { onPointerEnter: prefetchVideos, onPointerDown: prefetchVideos, onFocus: prefetchVideos };

  // News reopens on whichever of its views the reader last had.
  const [lastNewsView, setLastNewsView] = useState<View>(sectionOf(initial.view) === "news" ? initial.view : "sources");
  const changeView = useCallback((v: View) => {
    setView(v);
    if (sectionOf(v) === "news") setLastNewsView(v);
    window.scrollTo({ top: 0 });
  }, []);
  const openSection = (section: Section) => changeView(section === "news" ? lastNewsView : section);
  /** Where a section's link goes when opened in a new tab (or followed by a search engine). */
  const sectionHref = (section: Section) =>
    localePath(
      section === "videos" ? VIDEOS_PATH : section === "saved" ? "/?view=saved" : (categoryPath(category) ?? "/"),
      locale,
    );

  // The link to this page in the other language, with the view and filters kept.
  const otherLocale: Locale = locale === "bn" ? "en" : "bn";
  const otherLocaleHref =
    view === "videos"
      ? localePath(VIDEOS_PATH, otherLocale) + filtersToSearch({ ...DEFAULT_FILTERS, query })
      : localePath(categoryPath(category) ?? "/", otherLocale) +
        filtersToSearch({
          view,
          lang,
          source: onlySource,
          category: categoryPath(category) ? "" : category,
          query,
          order,
        });

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
        else if (link) {
          const id = new URL(link).searchParams.get("v");
          const known = savedVideos.find((e) => e.video.id === id);
          const feed = cachedVideos();
          const video = known?.video ?? feed?.videos.find((v) => v.id === id);
          const channelName = known?.channelName ?? feed?.channels.find((c) => c.id === video?.channel)?.name;
          if (video) toggleSavedVideo(video, channelName ?? video.channel);
        }
      } else if (key === "r") {
        load(true);
      } else if (key === "?") {
        setShortcutsOpen(true);
      } else if (VIEW_KEYS[key]) {
        changeView(VIEW_KEYS[key]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [allItems, saved, toggleSaved, savedVideos, toggleSavedVideo, load, changeView]);

  const density = useNewsDensity();
  const orderControl = <Segmented label={t.order.label} value={order} onChange={setOrder} options={orderOptions(t)} full />;
  const densityControl = (
    <Segmented
      label={t.density.label}
      value={density}
      onChange={setNewsDensity}
      options={[
        { value: "comfortable", label: t.density.comfortable },
        { value: "compact", label: t.density.compact },
      ]}
      full
    />
  );
  const languageControl = (
    <Segmented label={t.langFilter.label} value={lang} onChange={setLang} options={langOptions(t)} full />
  );
  const sourceSelect = (
    <select
      value={onlySource}
      onChange={(e) => setOnlySource(e.target.value)}
      className="h-11 w-full appearance-none rounded-xl border border-line bg-surface px-3.5 pr-9 text-sm font-medium outline-none focus:border-accent md:h-10"
      aria-label={t.filterBySource}
    >
      <option value="">{t.allSources}</option>
      {sources
        .filter((s) => lang === "all" || s.lang === lang)
        .map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
            {isFetched(s) ? "" : ` (${t.unavailable})`}
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
    <LocaleProvider locale={locale}>
      <LogoShapes value={seed?.logoShapes ?? NO_SHAPES}>
        <SearchProvider search={search}>
          <div className="min-h-dvh pb-28 md:pb-16" lang={locale === "bn" ? "bn" : undefined}>
            {/* Fetch progress */}
            <div className="fixed inset-x-0 top-0 z-40 h-0.5" aria-hidden>
              <div
                className={`h-full bg-accent transition-all duration-500 ${loading ? "opacity-100" : "opacity-0"}`}
                style={{ width: `${loading ? Math.max(4, (received / fetchedCount) * 100) : 100}%` }}
              />
            </div>

            {/* Masthead: the logo and buttons on one row, then the heading and a quiet status line. */}
            <header className="mx-auto max-w-7xl px-4 pt-[max(env(safe-area-inset-top),1rem)] sm:px-6 sm:pt-7">
              <div className="flex items-center justify-between gap-4">
                {/* A full load, so the board starts over with no filters, section or search. */}
                <a href={localePath("/", locale)} className="flex shrink-0 text-[24px] sm:text-[32px]" aria-label={t.home}>
                  <BartaboardLogo tagline={false} />
                </a>
                <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                  <AccountButton />
                  <a
                    href={otherLocaleHref}
                    hrefLang={otherLocale}
                    lang={otherLocale}
                    aria-label={t.switchLanguageLabel}
                    title={t.switchLanguageLabel}
                    className="inline-flex h-10 shrink-0 items-center justify-center rounded-full border border-line px-3 text-sm font-semibold text-foreground transition hover:bg-surface-2 active:scale-95"
                  >
                    {t.switchLanguageShort}
                  </a>
                  <ThemeButton />
                  <button
                    type="button"
                    onClick={() => load(true)}
                    disabled={loading}
                    aria-label={loading ? t.fetchingHeadlines : t.refreshHeadlines}
                    className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-foreground px-3 text-sm font-semibold text-background transition hover:opacity-90 active:scale-95 disabled:opacity-70 sm:px-4"
                  >
                    <RefreshIcon spinning={loading} className="h-4 w-4" />
                    <span className="hidden sm:inline">{loading ? t.fetchingShort : t.refresh}</span>
                  </button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-1.5 sm:mt-4">
                <h1 className="text-balance text-[13px] font-medium text-muted sm:text-sm">
                  {boardHeading(categoryPath(category) ? category : "", view === "videos", locale)}
                </h1>

                {/* Status. "Updated …" comes last, so as it grows nothing else moves. Below md it has a row of its
                    own: beside a short heading, "updated just now" in the prerendered page fits where "updated 5
                    minutes ago" doesn't, and the wrap pushed the whole board down (a 0.16 layout shift). */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted max-md:w-full">
                  <span className="font-semibold uppercase tracking-[0.14em] text-gold" suppressHydrationWarning>
                    <span className="sm:hidden">{dhakaShortDate(now, locale)}</span>
                    <span className="max-sm:hidden">{dhakaDate(now, locale)}</span>
                  </span>
                  {hasData && newCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setOnlyNew((v) => !v)}
                      aria-pressed={onlyNew}
                      title={t.newSinceTitle}
                      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold transition ${
                        onlyNew ? "bg-gold text-background" : "bg-gold/15 text-gold hover:bg-gold/25"
                      }`}
                    >
                      {!onlyNew && <span className="h-1.5 w-1.5 rounded-full bg-gold" aria-hidden />}
                      {t.newCount(formatCount(newCount, locale))}
                      {onlyNew && <CloseIcon className="h-3 w-3" />}
                    </button>
                  )}
                  <span className="inline-flex items-center gap-1.5" aria-live="polite">
                    <span className="relative flex h-1.5 w-1.5">
                      {loading && <span className="absolute inset-0 animate-ping rounded-full bg-accent opacity-60" />}
                      <span className="relative h-1.5 w-1.5 rounded-full bg-accent" />
                    </span>
                    {loading ? (
                      <span className="tabular-nums">
                        {t.fetchingSources(formatCount(received, locale), formatCount(fetchedCount, locale))}
                      </span>
                    ) : generatedAt ? (
                      <span title={fullTime(generatedAt, locale)}>{t.updated(timeAgo(generatedAt, now, locale))}</span>
                    ) : (
                      <span>{t.live}</span>
                    )}
                  </span>
                </div>
              </div>

              {outage && (
                <p role="status" className="mt-3 rounded-2xl border border-danger/30 bg-danger-soft p-4 text-sm text-danger">
                  {t.outage(formatCount(failedCount, locale), formatCount(fetchedCount, locale))}{" "}
                  <a href="/health" className="font-semibold underline">
                    {t.sourceHealth}
                  </a>
                </p>
              )}
            </header>

            {/* Toolbar */}
            <div
              data-toolbar
              className="sticky top-0 z-30 mt-4 border-b sm:mt-5 border-line bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl backdrop-saturate-150"
            >
              <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 pt-3 sm:px-6 md:h-16 md:pt-0">
                {/* Views and filters live in the bottom bar and filter sheet on phones. */}
                <nav className="hidden shrink-0 items-center gap-1 md:flex" aria-label={t.sectionsLabel}>
                  {SECTIONS.map(({ value, Icon }) => {
                    const active = sectionOf(view) === value;
                    return (
                      <a
                        key={value}
                        href={sectionHref(value)}
                        onClick={(e) => {
                          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                          e.preventDefault();
                          openSection(value);
                        }}
                        {...(value === "videos" ? videoIntent : {})}
                        aria-current={active ? "page" : undefined}
                        className={`inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-full px-4 text-sm font-medium transition active:scale-[0.97] ${
                          active ? "bg-foreground text-background" : "text-muted hover:bg-surface-2 hover:text-foreground"
                        }`}
                      >
                        <Icon className="hidden h-4 w-4 lg:block" />
                        {t.sections[value]}
                        {value === "saved" && savedCount > 0 && (
                          <span className={`text-xs tabular-nums ${active ? "opacity-60" : "text-muted/80"}`}>
                            {formatCount(savedCount, locale)}
                          </span>
                        )}
                      </a>
                    );
                  })}
                </nav>

                <label className="relative min-w-0 flex-1 md:ml-auto md:max-w-xs">
                  <span className="sr-only">{view === "videos" ? t.searchVideos : t.searchHeadlines}</span>
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
                    placeholder={view === "videos" ? t.searchVideosHint : t.searchHeadlinesHint}
                    enterKeyHint="search"
                    className="peer h-11 w-full rounded-full border border-line bg-surface pl-10 pr-10 text-[16px] outline-none transition placeholder:text-muted/80 focus:border-accent focus:ring-4 focus:ring-accent/10 md:h-10 md:text-sm [&::-webkit-search-cancel-button]:hidden"
                  />
                  {query ? (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      aria-label={t.clearSearch}
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

              </div>

              {view === "videos" ? (
                // The channel rail, from the Videos view; its height is kept while that loads.
                <div ref={setVideoRail} className="relative mx-auto -mb-px min-h-12 max-w-7xl md:-mt-1" />
              ) : hasData ? (
                <div className="relative mx-auto -mb-px max-w-7xl md:-mt-1">
                  <CategoryTabs
                    tabs={categoryTabs}
                    value={category}
                    onChange={(id) => pickCategory(id as Category | "")}
                    label={t.filterByCategory}
                  />
                </div>
              ) : (
                <div className="h-3" />
              )}
            </div>

            <main className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 sm:pt-6">
              {/* News's views on the left, My news on the right; on larger screens, Filters too (also in Saved). Videos has neither. */}
              {view !== "videos" && (
                <div className={`mb-4 items-center gap-3 sm:mb-5 ${sectionOf(view) === "news" ? "flex" : "hidden md:flex"}`}>
                  {sectionOf(view) === "news" && (
                    <div className="min-w-0 flex-1 sm:flex-none">
                      <Segmented label={t.newsView} value={view} onChange={changeView} options={newsViews(t)} full />
                    </div>
                  )}
                  <div className="ml-auto flex items-center gap-3">
                    {sectionOf(view) === "news" && (
                      <PinsButton label={t.myNews} count={pinsNow.ids.length} onClick={() => setPinsOpen(true)} compact />
                    )}
                    <FilterPopover count={activeFilters.length}>
                      {view === "sources" && <Field label={t.orderSources}>{orderControl}</Field>}
                      {sectionOf(view) === "news" && <Field label={t.density.label}>{densityControl}</Field>}
                      <Field label={t.langFilter.label}>{languageControl}</Field>
                      <Field label={t.source}>{sourceControl}</Field>
                      <button
                        type="button"
                        onClick={resetFilters}
                        disabled={activeFilters.length === 0}
                        className="h-10 w-full rounded-xl border border-line text-sm font-semibold transition hover:bg-surface-2 disabled:opacity-40"
                      >
                        {t.resetFilters}
                      </button>
                    </FilterPopover>
                  </div>
                </div>
              )}

              {view !== "videos" && activeFilters.length > 0 && (
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
                      <span className="sr-only">{t.removeFilter}</span>
                    </button>
                  ))}
                </div>
              )}

              {view !== "videos" && error && (
                <p className="mb-4 rounded-2xl border border-danger/30 bg-danger-soft p-4 text-sm text-danger">
                  {t.couldNotLoad(error)}
                </p>
              )}

              {view !== "videos" && !hasData && loading && <SkeletonGrid />}

              {hasData && view !== "saved" && view !== "videos" && filtering && filtered.length === 0 && (
                <div className="rounded-2xl border border-dashed border-line px-6 py-14 text-center">
                  <p className="font-display text-xl">{t.nothingFound}</p>
                  <p className="mt-1 text-sm text-muted">{t.tryAnother}</p>
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
                      ? t.topEmpty.source(sourceById.get(onlySource)?.name ?? t.topEmpty.thisSource)
                      : filtering
                        ? t.topEmpty.filtered
                        : loading
                          ? t.topEmpty.grouping
                          : t.topEmpty.none
                  }
                />
              )}

              {hasData && view === "latest" && (
                <LatestList
                  key={
                    filtersToSearch({ view, lang, source: onlySource, category, query: searchQuery, order }) +
                    onlyNew +
                    [...sourceRank.keys()].join()
                  }
                  items={filtered}
                  pinned={sourceRank}
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
                  videos={savedVideosMatching}
                  total={savedCount}
                  sourceById={sourceById}
                  now={now}
                  onToggleSave={toggleSaved}
                  onShare={shareItem}
                  onToggleSaveVideo={toggleSavedVideo}
                  onShareVideo={shareVideo}
                />
              )}

              {view === "videos" && (
                <Suspense fallback={<VideoSkeleton />}>
                  <VideoBoard
                    query={searchQuery}
                    rail={videoRail}
                    refreshSignal={videoRefresh}
                    onShare={shareVideo}
                    seed={videoSeed}
                  />
                </Suspense>
              )}

              {hasData && view === "sources" && (
                <div className="grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 compact:gap-3">
                  {pinnedCards === 0 && <h2 className="sr-only">{t.byNewspaper}</h2>}
                  {visibleSources.map((s, i) => (
                    <Fragment key={s.id}>
                      {pinnedCards > 0 && i === 0 && <GroupHeading pinned>{t.yourNews}</GroupHeading>}
                      {pinnedCards > 0 && i === pinnedCards && <GroupHeading>{t.otherNews}</GroupHeading>}
                      <SourceCard
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
                        total={
                          cardTotals && results.get(s.id) === partResults.get(s.id) ? (cardTotals[s.id] ?? 0) : undefined
                        }
                        onShowAll={whole ? undefined : showAllCards}
                        pinned={pinnedIds.has(s.id)}
                        onTogglePin={toggleSourcePin}
                      />
                    </Fragment>
                  ))}
                </div>
              )}

              {view === "videos" ? (
                <PageNotes intro={VIDEOS_INTRO} locale={locale} />
              ) : (
                sectionOf(view) === "news" && (
                  <PageNotes
                    intro={sectionIntro(categoryPath(category) ? category : "")}
                    faq={!categoryPath(category)}
                    locale={locale}
                  />
                )
              )}

              <footer className="mt-14 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted">
                {SITE_LINKS.map((l) => (
                  <a key={l.href} href={siteLinkHref(l, locale)} className="hover:text-foreground">
                    {t.links[l.id]}
                  </a>
                ))}
                <a
                  href={otherLocaleHref}
                  hrefLang={otherLocale}
                  lang={otherLocale}
                  title={t.switchLanguageLabel}
                  className="font-semibold hover:text-foreground"
                >
                  {t.switchLanguage}
                </a>
                <button
                  type="button"
                  onClick={() => setShortcutsOpen(true)}
                  className="hidden hover:text-foreground md:inline"
                >
                  {t.shortcuts.title} <kbd className="ml-1 rounded border border-line px-1 font-sans">?</kbd>
                </button>
              </footer>
              <InspiredBy locale={locale} />
            </main>

            {/* New headlines from the automatic refresh, held back so nothing moves while reading. */}
            {pending && view !== "videos" && (
              <div className="pointer-events-none fixed inset-x-0 bottom-24 z-30 flex justify-center px-4 md:bottom-8">
                <button
                  type="button"
                  onClick={showPending}
                  className="pointer-events-auto inline-flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-accent-ink shadow-card transition active:scale-95"
                >
                  <ChevronIcon className="h-4 w-4 rotate-180" />
                  {t.newHeadlines(pending.fresh, formatCount(pending.fresh, locale))}
                </button>
              </div>
            )}

            {/* Bottom bar (phones) */}
            <nav
              className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/90 backdrop-blur-xl backdrop-saturate-150 md:hidden"
              aria-label={t.viewLabel}
              data-bottom-nav
            >
              <div className="mx-auto grid h-16 max-w-md grid-cols-4">
                <NavButton active={sectionOf(view) === "news"} onClick={() => openSection("news")} label={t.sections.news}>
                  <NewspaperIcon />
                </NavButton>
                <NavButton active={view === "videos"} onClick={() => openSection("videos")} label={t.sections.videos} {...videoIntent}>
                  <VideoIcon />
                </NavButton>
                <NavButton active={view === "saved"} onClick={() => openSection("saved")} label={t.sections.saved}>
                  <BookmarkIcon />
                </NavButton>
                <NavButton active={false} onClick={() => setFiltersOpen(true)} label={t.filters} badge={activeFilters.length}>
                  <SlidersIcon />
                </NavButton>
              </div>
            </nav>

            <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title={t.filters}>
              <div className="space-y-6">
                {view === "sources" && <Field label={t.orderSources}>{orderControl}</Field>}
                {view === "sources" && (
                  <Field label={t.sourceCards}>
                    <div className="flex gap-2">
                      {[
                        { label: t.expandAll, collapsed: false },
                        { label: t.collapseAll, collapsed: true },
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
                    <p className="mt-2 text-xs text-muted">{t.foldHint}</p>
                  </Field>
                )}
                {view !== "videos" && <Field label={t.langFilter.label}>{languageControl}</Field>}
                {view !== "videos" && <Field label={t.source}>{sourceControl}</Field>}
                {sectionOf(view) === "news" && <Field label={t.density.label}>{densityControl}</Field>}
                <Field label={t.appearance}>
                  <ThemeSetting />
                </Field>
              </div>
              <div className="mt-8 flex gap-3">
                {view !== "videos" && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    disabled={activeFilters.length === 0}
                    className="h-12 flex-1 rounded-xl border border-line text-sm font-semibold transition active:scale-[0.98] disabled:opacity-40"
                  >
                    {t.reset}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setFiltersOpen(false)}
                  className="h-12 flex-[2] rounded-xl bg-foreground text-sm font-semibold text-background transition active:scale-[0.98]"
                >
                  {view === "videos" ? t.done : t.showHeadlines(formatCount(filtered.length, locale))}
                </button>
              </div>
            </Sheet>

            <Sheet open={pinsOpen} onClose={() => setPinsOpen(false)} title={t.myNews}>
              <PinPicker kind="site" options={pinOptions} pins={pinsNow} onChange={updatePins} />
            </Sheet>

            <Sheet open={!!sharing} onClose={() => setSharing(null)} title={sharing?.video ? t.shareVideo : t.shareHeadline}>
              {sharing && <ShareOptions shared={sharing} />}
            </Sheet>

            <Sheet open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} title={t.shortcuts.title}>
              <dl className="grid grid-cols-[auto_1fr] items-center gap-x-5 gap-y-3 text-sm">
                {shortcuts(t).map(([keys, what]) => (
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
        </SearchProvider>
      </LogoShapes>
    </LocaleProvider>
  );
}

const THEME_ICON: Record<Theme, typeof SunIcon> = { system: AutoThemeIcon, light: SunIcon, dark: MoonIcon };
const NEXT_THEME: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };

/**
 * Links to /account/: the signed-in person's photo or initial, or an outline when signed out. Hidden until accounts
 * open (src/lib/plans.ts).
 */
function AccountButton() {
  const account = useAccount();
  const visible = usePlansVisible();
  const t = useStrings();
  if (!visible) return null;
  const label = account ? t.account(account.email) : t.signIn;
  return (
    <a
      href="/account"
      aria-label={label}
      title={label}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line text-foreground transition hover:bg-surface-2 active:scale-95"
    >
      {account ? (
        <Avatar email={account.email} src={account.avatar} className="h-7 w-7 text-xs" />
      ) : (
        <UserIcon className="h-4 w-4" />
      )}
    </a>
  );
}

/** Cycles Auto → Light → Dark. The icon shows the current setting. */
function ThemeButton() {
  const theme = useTheme();
  const t = useStrings();
  const Icon = THEME_ICON[theme];
  const label = (th: Theme) => t.theme[th];
  return (
    <button
      type="button"
      onClick={() => setTheme(NEXT_THEME[theme])}
      aria-label={t.theme.switchTo(label(theme), label(NEXT_THEME[theme]))}
      title={t.theme.now(label(theme))}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line text-foreground transition hover:bg-surface-2 active:scale-95"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function ThemeSetting() {
  const t = useStrings();
  return <Segmented label={t.theme.label} value={useTheme()} onChange={setTheme} options={themeOptions(t)} full />;
}

function NavButton({
  active,
  onClick,
  label,
  badge = 0,
  children,
  ...intent
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  badge?: number;
  children: React.ReactNode;
  onPointerEnter?: () => void;
  onPointerDown?: () => void;
  onFocus?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      {...intent}
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
  const t = useStrings();

  const place = useCallback(() => {
    const r = button.current?.getBoundingClientRect();
    const el = panel.current;
    if (!r || !el) return;
    el.style.top = `${r.bottom + 8}px`;
    // From the viewport's right edge, which a fixed panel is placed against: not counting the scrollbar.
    el.style.right = `${Math.max(8, document.documentElement.clientWidth - r.right)}px`;
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
        {t.filters}
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
        aria-label={t.filters}
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

/** Starts a group of cards: the reader's pinned sources, then everyone else. */
function GroupHeading({ pinned = false, children }: { pinned?: boolean; children: React.ReactNode }) {
  return (
    <h2 className={`col-span-full flex items-center gap-2 px-1 font-display text-xl ${pinned ? "" : "pt-4"}`}>
      {pinned && <StarIcon filled className="h-[18px] w-[18px] text-gold" />}
      {children}
    </h2>
  );
}

function SkeletonGrid() {
  const t = useStrings();
  return (
    <div className="grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3" aria-busy>
      <p className="col-span-full text-center text-sm text-muted">{t.gathering}</p>
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
