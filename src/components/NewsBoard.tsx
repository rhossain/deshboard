"use client";

import {
  type ComponentProps,
  type ComponentType,
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
  useSyncExternalStore,
} from "react";
import { CATEGORIES, type Category } from "@/lib/categories";
import { DEFAULT_FILTERS, type Filters, filtersToSearch, type LangFilter, MAX_QUERY, type Order, parseFilters, type View } from "@/lib/filters";
import { usePlansVisible } from "@/lib/plans";
import { sourceProblem } from "@/lib/problems";
import { dedupeByLink } from "@/lib/fetchers/utils";
import { sectionIntro, VIDEOS_INTRO } from "@/lib/intros";
import { boardHeading, categoryPath, categoryTitle, siteTitle, VIDEOS_PATH, videosTitle } from "@/lib/site";
import { isFetched } from "@/lib/sources";
import { countSince, findStories, itemTime, newestFirst, type Story } from "@/lib/stories";
import { sourceName } from "@/lib/bn-names";
import { type Locale, localePath } from "@/lib/i18n";
import { STRINGS, type Strings } from "@/lib/strings";
import type { Theme } from "@/lib/theme";
import { applyDelta, DATA_DIR, type FeedDelta, type PackedFeed, type PackedSeed, unpackFeed } from "@/lib/packed";
import type { NewsFeed, NewsItem, NewsSeed, NewsSource, SourceResult, Video, VideoFeed } from "@/lib/types";
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
import { articleKey, OlderResults } from "./OlderResults";
import { useSearch } from "./use-search";
import { MAX_PINS, pinRanks, togglePin, usePinnedSources } from "./pinned";
import { PinPicker, PinsButton } from "./PinPicker";
import { useSaved, useSavedVideos } from "./saved";
import { SavedList } from "./SavedList";
import { AT_TOP_PX, PUBLISH_LAG_MS, RETRY_MS, UPDATE_EVERY_MS } from "./schedule";
import { type Shareable, ShareOptions, shareUrl, videoShareUrl } from "./ShareOptions";
import { Logos, SourceCard } from "./SourceCard";
import { TopStories } from "./TopStories";
import { markTourSeen, Tour, TourInvite } from "./Tour";
import { setTheme, useTheme } from "./theme";
import { cachedVideos, loadVideoBoard, prefetchVideos } from "./videos";
import { VideoSkeleton } from "./VideoSkeleton";
import { dhakaClock, dhakaDate, dhakaShortDate, formatCount, fullTime, timeAgo } from "./time";
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

/**
 * The Videos view is a separate download, fetched only when the reader heads for it. The Videos page
 * passes it in instead (see VideosPageBoard): a lazy board there would prerender as its skeleton, with
 * the videos swapped in later (a layout shift, and a late LCP).
 */
const LazyVideoBoard = lazy(loadVideoBoard);
export type VideoBoardComponent = ComponentType<ComponentProps<typeof LazyVideoBoard>>;

const NO_ITEMS: NewsItem[] = [];
const NO_STORIES: Story[] = [];
const NO_SAVED_VIDEOS: ReturnType<typeof useSavedVideos>["savedVideos"] = [];

/** How long a Refresh result stays in the status line. */
const NOTICE_MS = 6000;
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

/** When the next update should land: "next around 19:07", or "due any minute" once it's late. */
function nextUpdate(generatedAt: string, now: number, locale: Locale): string {
  const t = STRINGS[locale];
  const due = Date.parse(generatedAt) + UPDATE_EVERY_MS;
  return due > now ? t.nextAround(dhakaClock(due, locale)) : t.nextDue;
}

/**
 * Runs `fn` once the page has loaded and the browser is idle (at most `timeout` ms after loading).
 * Returns a function that cancels it.
 */
function whenSettled(fn: () => void, timeout = 2000): () => void {
  let idle: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const wait = () => {
    if (typeof requestIdleCallback === "function") idle = requestIdleCallback(fn, { timeout });
    else timer = setTimeout(fn, 200);
  };
  if (document.readyState === "complete") wait();
  else window.addEventListener("load", wait, { once: true });
  return () => {
    window.removeEventListener("load", wait);
    if (idle !== undefined) cancelIdleCallback(idle);
    clearTimeout(timer);
  };
}

/** The reader doing anything at all: the first scroll, tap, click or key press. */
const READER_EVENTS = ["scroll", "wheel", "pointerdown", "touchstart", "keydown"] as const;
/** Without any of that, the whole feed loads this long after the page. */
const UNTOUCHED_MS = 10_000;

/**
 * Runs `fn` once the reader does anything on the page, or once it has sat untouched for a while
 * (and the browser is idle). Returns a function that cancels it.
 */
function whenNeeded(fn: () => void): () => void {
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    cancel();
    fn();
  };
  const opts = { capture: true, passive: true };
  for (const type of READER_EVENTS) window.addEventListener(type, run, opts);
  let cancelSettled: (() => void) | undefined;
  const timer = setTimeout(() => (cancelSettled = whenSettled(run)), UNTOUCHED_MS);
  const cancel = () => {
    for (const type of READER_EVENTS) window.removeEventListener(type, run, opts);
    clearTimeout(timer);
    cancelSettled?.();
  };
  return cancel;
}

/**
 * The headlines collected by the last build (`npm run fetch`), as a static file next to the page.
 * `priority: "low"` when the page already shows headlines, so it doesn't hold up the logos and fonts.
 */
export async function loadFeed(signal?: AbortSignal, priority: RequestPriority = "auto"): Promise<NewsFeed> {
  return unpackFeed((await loadData(`${DATA_DIR}/news.json`, signal, priority)) as PackedFeed);
}

/** A page's head file: every source's newest headlines, all the cards show (see NewsSeed). */
async function loadHead(category: Category | undefined, signal: AbortSignal, priority: RequestPriority): Promise<NewsSeed> {
  return unpackFeed((await loadData(`${DATA_DIR}/head/${category ?? "all"}.json`, signal, priority)) as PackedSeed);
}

/**
 * The newest build's whole feed, for a board that has a whole feed (`base`): made from delta.json, a few
 * dozen KB, when `base` is the build before it; otherwise the whole file, about 700 KB. `base` again when
 * there is no newer build.
 */
async function loadNewerFeed(base: NewsFeed, signal: AbortSignal, priority: RequestPriority): Promise<NewsFeed> {
  const delta = (await loadData(`${DATA_DIR}/delta.json`, signal, priority)) as FeedDelta;
  if (delta.generatedAt === base.generatedAt) return base;
  return applyDelta(base, delta) ?? loadFeed(signal, priority);
}

async function loadData(url: string, signal: AbortSignal | undefined, priority: RequestPriority): Promise<unknown> {
  const res = await fetch(url, { cache: "no-cache", signal, priority });
  if (!res.ok) throw new Error(res.status === 404 ? "no headlines have been collected yet" : `server returned ${res.status}`);
  return res.json();
}

/** How much of the feed the board has: none, the seed baked into the page, a head file, or all of it. */
const NONE = 0;
const SEED = 1;
const HEAD = 2;
const WHOLE = 3;
const partOf = (feed: NewsFeed | NewsSeed) => ("counts" in feed ? HEAD : WHOLE);

const byId = (feed: NewsFeed) => new Map(feed.results.map((r) => [r.sourceId, r]));

/** A newer feed from the automatic refresh, with how many of its headlines the board doesn't show yet. */
type Pending = { feed: NewsFeed | NewsSeed; fresh: number };

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
  view,
  videoSeed,
  videoBoard,
  locale = "en",
}: {
  sources: NewsSource[];
  seed?: NewsSeed;
  category?: Category;
  /** The view a page of its own opens on (/videos/). */
  view?: View;
  videoSeed?: VideoFeed;
  /** The Videos view, already loaded (the Videos page's); otherwise it loads when the reader opens it. */
  videoBoard?: VideoBoardComponent;
  locale?: Locale;
}) {
  const search = useSyncExternalStore(noSubscribe, () => openedWith, () => "");
  const initial = useMemo(() => {
    const filters = parseFilters(Object.fromEntries(new URLSearchParams(search)), new Set(sources.map((s) => s.id)));
    return { ...filters, ...(category && { category }), ...(view && { view }) };
  }, [search, sources, category, view]);
  return (
    <NewsBoard
      key={search}
      sources={sources}
      initial={initial}
      seed={seed}
      videoSeed={videoSeed}
      videoBoard={videoBoard}
      locale={locale}
    />
  );
}

/**
 * `sources` is every listed portal in display order.
 * `initial` is the view and filters from the URL.
 * `seed` is a few headlines per source baked into the page (see seedResults), shown until the feed loads.
 * `videoSeed` is the same for the Videos page (see readVideoSeed), and `videoBoard` its Videos view.
 * `locale` is the interface language: Bangla on /bn/ pages (see src/lib/i18n.ts).
 */
export function NewsBoard({
  sources: listed,
  initial,
  seed,
  videoSeed,
  videoBoard: VideoBoard = LazyVideoBoard,
  locale = "en",
}: {
  sources: NewsSource[];
  initial: Filters;
  seed?: NewsSeed;
  videoSeed?: VideoFeed;
  videoBoard?: VideoBoardComponent;
  locale?: Locale;
}) {
  const t = STRINGS[locale];
  // Outlets by their Bangla names on Bangla pages (in the filters, pin picker, Latest and Top stories).
  const sources = useMemo(
    () => (locale === "bn" ? listed.map((s) => ({ ...s, name: sourceName(s.id, s.name, locale) })) : listed),
    [listed, locale],
  );
  // Latest result per source; on refresh each one is replaced as its new result arrives.
  const [results, setResults] = useState<Map<string, SourceResult>>(() => (seed ? byId(seed) : new Map()));
  // On the Videos page, which has no headlines baked in, the status line starts with the videos' time.
  const [generatedAt, setGeneratedAt] = useState<string | null>(seed?.generatedAt ?? videoSeed?.generatedAt ?? null);
  const [logos, setLogos] = useState<Pick<NewsFeed, "logos" | "logoShapes">>(() => ({
    logos: seed?.logos ?? {},
    logoShapes: seed?.logoShapes ?? {},
  }));
  // A page opened on Videos loads the headlines only when the reader leaves it (see videosFirst).
  const [loading, setLoading] = useState(!seed && initial.view !== "videos");
  // How much of the feed is on show (NONE, SEED, HEAD or WHOLE): a load replaces less of the same build.
  const hasRef = useRef(seed ? SEED : NONE);
  const [whole, setWhole] = useState(false);
  // Loading the whole feed, which a page's head file stands in for until the reader needs more.
  const wholeLoadingRef = useRef(false);
  // The whole feed's section and card counts and headline ages, from the seed or head file, until
  // the whole feed is here.
  const [seedCounts, setSeedCounts] = useState(seed?.counts);
  const [seedTotals, setSeedTotals] = useState(seed?.totals);
  const [seedAges, setSeedAges] = useState(seed?.ages);
  // The section the seed and head files are cut for: the page's.
  const pageCategory = seed?.category;
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
  const [tourOpen, setTourOpen] = useState(false);
  const [sharing, setSharing] = useState<Shareable | null>(null);
  // An automatic refresh that brought new headlines, held back until the reader asks for it.
  const [pending, setPending] = useState<Pending | null>(null);
  const quietRef = useRef<AbortController | null>(null);
  const resultsRef = useRef(results);
  const generatedAtRef = useRef(generatedAt);
  // The whole feed on show (null while only part of it is): what a refresh's delta is made against.
  const wholeRef = useRef<NewsFeed | null>(null);
  // What the last Refresh found, shown for a few seconds in the status line.
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const searchRef = useRef<HTMLInputElement>(null);
  // With a seed, the clock starts at its build time so the prerendered page and hydration agree.
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

  // The whole feed is thousands of headlines, a large file to read and draw on a slow phone. Until the
  // reader looks past each source's newest (another view, a search or filter, a section other than the
  // page's, a card opened in full), the page's head file stands in for it.
  const [wantAll, setWantAll] = useState(false);
  const showAllCards = useCallback(() => setWantAll(true), []);
  const needsWhole =
    view === "top" ||
    view === "latest" ||
    // A search on the news views (not Saved or Videos, which search their own), with something to find.
    (view !== "saved" && view !== "videos" && /[\p{L}\p{N}]/u.test(query)) ||
    lang !== "all" ||
    !!onlySource ||
    onlyNew ||
    (category || undefined) !== pageCategory ||
    wantAll;
  const needsWholeRef = useRef(needsWhole);
  useEffect(() => {
    needsWholeRef.current = needsWhole;
  }, [needsWhole]);

  // A transition: React draws the thousands of headlines in short slices, between which the page
  // stays responsive, instead of in one long task.
  const show = useCallback((feed: NewsFeed | NewsSeed) => {
    const part = "counts" in feed ? feed : undefined;
    hasRef.current = partOf(feed);
    wholeRef.current = part ? null : feed;
    startTransition(() => {
      setResults(byId(feed));
      setLogos({ logos: feed.logos, logoShapes: feed.logoShapes });
      setWhole(!part);
      setSeedCounts(part?.counts);
      setSeedTotals(part?.totals);
      setSeedAges(part?.ages);
      setGeneratedAt(feed.generatedAt);
      setNow(Date.now());
    });
  }, []);

  /**
   * The whole feed: with the whole of an earlier build on show, only what changed since (see
   * loadNewerFeed); otherwise all of it.
   */
  const loadWhole = useCallback((signal: AbortSignal, priority: RequestPriority) => {
    const base = wholeRef.current;
    return base ? loadNewerFeed(base, signal, priority) : loadFeed(signal, priority);
  }, []);

  /**
   * Load the feed: all of it once the board has it or `wantWhole`, otherwise the page's head file.
   * State is only set from callbacks, so this is safe to call from an effect.
   * `manual` (the Refresh button): say whether there was anything newer, since often there isn't.
   */
  const start = useCallback(
    (manual = false, wantWhole = false) => {
      controllerRef.current?.abort();
      // A background refresh that began on less of the feed would replace what this brings.
      quietRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const getWhole = wantWhole || hasRef.current === WHOLE;
      wholeLoadingRef.current = getWhole;

      // Only the Refresh button, a page without a seed, or a reader who asked for more is waiting on it.
      const priority = manual || hasRef.current === NONE || wantWhole ? "auto" : "low";
      (getWhole ? loadWhole(controller.signal, priority) : loadHead(pageCategory, controller.signal, priority)).then(
        (feed: NewsFeed | NewsSeed) => {
          if (controllerRef.current === controller) wholeLoadingRef.current = false;
          const newer = feed.generatedAt !== generatedAtRef.current;
          if (newer || partOf(feed) > hasRef.current) show(feed);
          // A held-back refresh this build already includes is no longer new.
          setPending((p) => (p && p.feed.generatedAt <= feed.generatedAt ? null : p));
          if (manual) {
            clearTimeout(noticeTimer.current);
            setNotice(newer ? t.showingLatest : t.upToDate(nextUpdate(feed.generatedAt, Date.now(), locale)));
            noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_MS);
          }
          setError(null);
          setLoading(false);
        },
        (err: unknown) => {
          if (controllerRef.current === controller) wholeLoadingRef.current = false;
          if (controller.signal.aborted) return;
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        },
      );
    },
    [show, pageCategory, t, locale, loadWhole],
  );

  /** The Refresh button and `r`. */
  const load = useCallback(() => {
    if (viewRef.current === "videos") {
      setVideoRefresh((n) => n + 1);
      return;
    }
    quietRef.current?.abort();
    setPending(null);
    setLoading(true);
    start(true, needsWholeRef.current);
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
    (hasRef.current === WHOLE ? loadWhole(controller.signal, "low") : loadHead(pageCategory, controller.signal, "low")).then(
      (feed: NewsFeed | NewsSeed) => {
        if (feed.generatedAt === generatedAtRef.current) return; // No new build since the last look.
        // The board got the whole feed meanwhile: fetch the new build's whole feed rather than shrink to its head.
        if (partOf(feed) < hasRef.current) {
          start(false, true);
          return;
        }
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
  }, [show, pageCategory, start, loadWhole]);

  const showPending = () => {
    if (!pending) return;
    if (partOf(pending.feed) < hasRef.current) start(false, true);
    else show(pending.feed);
    setPending(null);
    window.scrollTo({ top: 0 });
  };

  // Behind the prerendered headlines, the rest waits until the reader goes past what the page already
  // shows: their first scroll, tap or key press. A page opened with other filters wants it as soon as
  // it has loaded.
  const seeded = !!seed;
  const seedFits =
    seeded &&
    !initial.query &&
    initial.lang === "all" &&
    !initial.source &&
    initial.view === "sources" &&
    (initial.category || undefined) === seed?.category;
  // A page opened on Videos doesn't need the headlines (a large file to read on a slow phone) until
  // the reader leaves it.
  const videosFirst = initial.view === "videos";
  useEffect(() => {
    // (Unless Refresh got there first.)
    const load = () => controllerRef.current || start(false, needsWholeRef.current);
    const cancel = videosFirst
      ? undefined
      : seeded
        ? (seedFits ? whenNeeded : whenSettled)(load)
        : (load(), undefined);
    // A transition: redrawing every headline's age is no reason to hold up a tap.
    const tick = setInterval(() => startTransition(() => setNow(Date.now())), 60_000);
    return () => {
      cancel?.();
      controllerRef.current?.abort();
      // Else a remount (StrictMode in dev) takes the aborted load for one under way and never loads.
      controllerRef.current = null;
      quietRef.current?.abort();
      clearInterval(tick);
      clearTimeout(noticeTimer.current);
    };
  }, [start, seeded, seedFits, videosFirst]);
  useEffect(() => {
    if (videosFirst && view !== "videos" && !controllerRef.current) start(false, needsWholeRef.current);
  }, [videosFirst, view, start]);
  // Once loading has begun, wanting more than the head file fetches the whole feed.
  useEffect(() => {
    if (needsWhole && !whole && controllerRef.current && !wholeLoadingRef.current) start(false, true);
  }, [needsWhole, whole, start]);

  // Look for the next build when it should have landed, then every minute until it has. Browsers
  // pause timers in background tabs, so also look when the page comes back into view or online.
  const newest = pending?.feed.generatedAt ?? generatedAt;
  useEffect(() => {
    if (!newest) return;
    const due = Date.parse(newest) + UPDATE_EVERY_MS + PUBLISH_LAG_MS;
    let timer: ReturnType<typeof setTimeout>;
    const check = () => {
      clearTimeout(timer);
      // The Videos view looks for its own updates; the headlines wait until the reader is back.
      if (viewRef.current !== "videos") refreshQuietly();
      timer = setTimeout(check, RETRY_MS);
    };
    const checkIfDue = () => {
      if (!document.hidden && Date.now() >= due) check();
    };
    // Not before a minute has passed: when the page is already overdue, its first load just looked.
    timer = setTimeout(check, Math.max(due - Date.now(), RETRY_MS));
    document.addEventListener("visibilitychange", checkIfDue);
    window.addEventListener("online", checkIfDue);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", checkIfDue);
      window.removeEventListener("online", checkIfDue);
    };
  }, [newest, refreshQuietly]);

  // Mirror the view and filters in the URL, so the page can be bookmarked or shared as it is. A
  // section with a page of its own (/news/sports/) uses that address and title, and so does Videos
  // (/videos/, where only the search applies); an old /?view=videos link lands there too.
  // Bangla pages keep to their /bn/ addresses.
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
  // What the board shows, for the earlier-headlines search to leave out: links, and each outlet's titles.
  const boardKeys = useMemo(() => new Set(allItems.flatMap((it) => [it.link, articleKey(it)])), [allItems]);
  const statuses = useMemo(() => [...results.values()], [results]);
  const hasData = results.size > 0;

  const sourceById = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources]);
  // The reader's own sources and their places; empty while "Pinned first" is off.
  const sourceRank = useMemo(() => pinRanks(pins, new Set(sourceById.keys())), [pins, sourceById]);
  const statusById = results;

  // Headlines since the reader's last visit (none on a first visit).
  const lastVisit = useDeferredValue(useLastVisit());
  const isNew = useCallback((it: NewsItem) => !!lastVisit && (itemTime(it) ?? "") > lastVisit, [lastVisit]);

  // The search filters behind the typing: the box keeps up while the results catch up.
  const searchQuery = useDeferredValue(query);
  const search = useSearch(searchQuery);
  const filtering = !!search || !!category || onlyNew;
  // The board wants every headline but still has only the head file: a search, another section or Top
  // may not have found everything yet, so the board says it is still loading rather than "Nothing found".
  // A failed load ends the wait.
  const incomplete = needsWhole && !whole && !error;
  const searching = !!search && incomplete;
  // Once the board has every headline, the search carries on into the last 30 days (OlderResults).
  const searchOlder = !!search && whole && !onlyNew && (view === "sources" || view === "top" || view === "latest");

  // The headline views. Saved and Videos list their own things, so the board's headlines aren't
  // filtered for them (a search there would otherwise go through every headline at each key press).
  const boardView = view === "sources" || view === "top" || view === "latest";

  // How many headlines "new" shows with the other filters as they are: what its button counts. With
  // only the page's head file, the seed's count by age for its own section (exact enough, and the
  // button's number doesn't jump); with other filters, none until every headline is here.
  const newCount = useMemo(() => {
    if (!lastVisit) return 0;
    if (!whole) {
      const pageFilters = lang === "all" && !onlySource && !search && (category || undefined) === seed?.category;
      return pageFilters && seedAges && generatedAt ? countSince(seedAges, generatedAt, lastVisit) : 0;
    }
    let n = 0;
    for (const it of allItems)
      if (
        isNew(it) &&
        (lang === "all" || it.lang === lang) &&
        (!onlySource || it.sourceId === onlySource) &&
        (!category || it.category === category) &&
        (!search || search.matches(it.title))
      )
        n++;
    return n;
  }, [whole, allItems, isNew, lastVisit, seedAges, generatedAt, lang, onlySource, category, search, seed?.category]);

  // Everything except the category filter, so the chips can show counts.
  const matching = useMemo(
    () =>
      boardView
        ? allItems.filter(
            (it) =>
              (lang === "all" || it.lang === lang) &&
              (!onlySource || it.sourceId === onlySource) &&
              (!onlyNew || isNew(it)) &&
              (!search || search.matches(it.title)),
          )
        : NO_ITEMS,
    [boardView, allItems, lang, onlySource, onlyNew, isNew, search],
  );

  // Saved headlines go through the same filters, except "new"; here all but the section, for its tabs.
  const { saved, savedLinks: savedLinksNow, toggleSaved } = useSaved();
  const savedLinks = useDeferredValue(savedLinksNow);
  const savedAll = useMemo(
    () =>
      saved.filter(
        ({ item: it }) =>
          (lang === "all" || it.lang === lang) &&
          (!onlySource || it.sourceId === onlySource) &&
          (!search || search.matches(it.title)),
      ),
    [saved, lang, onlySource, search],
  );

  // While only the seed is here, the unfiltered counts come with it, so the tabs don't widen when the
  // whole feed arrives. On Saved, the tabs count the saved headlines.
  const unfiltered = !onlyNew && lang === "all" && !onlySource && !search;
  const categoryCounts = useMemo(() => {
    if (view === "saved") {
      const counts = new Map<Category, number>();
      for (const { item } of savedAll) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
      return counts;
    }
    if (seedCounts && unfiltered) return new Map(Object.entries(seedCounts) as [Category, number][]);
    const counts = new Map<Category, number>();
    for (const it of matching) counts.set(it.category, (counts.get(it.category) ?? 0) + 1);
    return counts;
  }, [view, savedAll, matching, seedCounts, unfiltered]);
  // Each card's final size while only the seed is here (it was counted with the default filters).
  const cardTotals = seedTotals && unfiltered && (category || undefined) === seed?.category ? seedTotals : undefined;
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
  // on a phone); the other filters then pick stories with a matching headline. Grouped once Top has
  // been opened, then kept when the reader leaves it, and only from every headline: the head file's few
  // per source would group into different stories. Ages count from the build, not the clock, so the
  // minute's tick doesn't group everything again.
  const [storiesWanted, setStoriesWanted] = useState(view === "top");
  if (view === "top" && !storiesWanted) setStoriesWanted(true);
  const storyItems = useDeferredValue(allItems);
  const storyLang = useDeferredValue(lang);
  const storiesReady = storiesWanted && (whole || !!error);
  const storiesAt = Date.parse(generatedAt ?? "") || undefined;
  const allStories = useMemo(
    () =>
      storiesReady
        ? findStories(storyLang === "all" ? storyItems : storyItems.filter((it) => it.lang === storyLang), {
            now: storiesAt,
          })
        : [],
    [storiesReady, storyItems, storyLang, storiesAt],
  );
  // Grouping still to catch up with the language or feed just chosen.
  const storiesPending = storyItems !== allItems || storyLang !== lang;
  const stories = useMemo(() => {
    if (view !== "top") return NO_STORIES;
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
  }, [view, allStories, search, onlySource, category, onlyNew, isNew]);

  const savedMatching = useMemo(
    () => (category ? savedAll.filter(({ item }) => item.category === category) : savedAll),
    [savedAll, category],
  );
  // Saved videos only go through the search: they are TV channels' Bangla videos, with no source or
  // category of the board's, so a source, category or English filter leaves them out.
  const { savedVideos, toggleSavedVideo } = useSavedVideos();
  const savedVideosAll = useMemo(() => {
    if (lang === "en" || onlySource) return [];
    return search ? savedVideos.filter((e) => search.matches(e.video.title)) : savedVideos;
  }, [savedVideos, lang, onlySource, search]);
  const savedVideosMatching = category ? NO_SAVED_VIDEOS : savedVideosAll;
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
          // The card's lead with no filter on (a filtered card's isn't what its folded header compares to).
          const lead = results.get(id)?.items[0]?.link;
          if (lead) p.seen[id] = lead;
        }
      }),
    [updateCardPrefs, results],
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
  // Kept the same between renders unless a count changes: the tabs measure themselves whenever it changes.
  const categoryTabs = useMemo(
    () => [
      {
        id: "",
        label: bn ? "সব" : "All",
        href: localePath("/", locale),
        // On Saved, "All" also lists the saved videos.
        count: matchingCount + (view === "saved" ? savedVideosAll.length : 0),
      },
      ...CATEGORIES.map((c) => ({
        id: c.id,
        label: bn ? c.bn : c.label,
        title: bn ? c.label : c.bn,
        href: localePath(categoryPath(c.id) ?? `/?cat=${c.id}`, locale),
        count: categoryCounts.get(c.id) ?? 0,
      })),
    ],
    [bn, locale, matchingCount, categoryCounts, view, savedVideosAll],
  );

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

  // The footer's link to this page in the other language, with the view and filters kept.
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
  /** The site tour walks through News, so it starts there, at the top of the page. */
  const startTour = () => {
    markTourSeen();
    if (sectionOf(view) === "news") window.scrollTo({ top: 0 });
    else openSection("news");
    setTourOpen(true);
  };
  /** Where a section's link goes when opened in a new tab (or followed by a search engine). */
  const sectionHref = (section: Section) =>
    localePath(
      section === "videos" ? VIDEOS_PATH : section === "saved" ? "/?view=saved" : (categoryPath(category) ?? "/"),
      locale,
    );

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
        load();
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
      <Logos value={logos}>
        <SearchProvider search={search}>
          <div className="min-h-dvh pb-28 md:pb-16" lang={locale === "bn" ? "bn" : undefined}>
            {/* Fetch progress */}
            <div className="fixed inset-x-0 top-0 z-40 h-0.5" aria-hidden>
              <div
                className={`h-full bg-accent transition-all duration-500 ${loading ? "opacity-100" : "opacity-0"}`}
                style={{ width: loading ? "40%" : "100%" }}
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
                    data-tour="language"
                    aria-label={`${t.switchLanguageShort}: ${t.switchLanguageLabel}`}
                    title={t.switchLanguageLabel}
                    className="inline-flex h-10 shrink-0 items-center justify-center rounded-full border border-line px-3 text-sm font-semibold text-foreground transition hover:bg-surface-2 active:scale-95"
                  >
                    {t.switchLanguageShort}
                  </a>
                  <ThemeButton />
                  <button
                    type="button"
                    onClick={() => load()}
                    disabled={loading}
                    data-tour="refresh"
                    title={t.collectedEvery}
                    className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-foreground px-3 text-sm font-semibold text-background transition hover:opacity-90 active:scale-95 disabled:opacity-70 sm:px-4"
                  >
                    <RefreshIcon spinning={loading} className="h-4 w-4" />
                    {/* The visible word is the name everywhere (on phones too, for voice control). */}
                    <span className="max-sm:sr-only">{loading ? t.loadingShort : t.refresh}</span>
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
                  <span className="inline-flex items-center gap-1.5">
                    <span className="relative flex h-1.5 w-1.5">
                      {loading && <span className="absolute inset-0 animate-ping rounded-full bg-accent opacity-60" />}
                      <span className="relative h-1.5 w-1.5 rounded-full bg-accent" />
                    </span>
                    {/* Announced: loading and notices. Not the "Updated … ago" after it, which changes every minute. */}
                    <span aria-live="polite" className="empty:hidden">
                      {loading ? (
                        t.loadingStatus
                      ) : notice ? (
                        <span className="font-medium text-foreground">{notice}</span>
                      ) : null}
                    </span>
                    {loading || notice ? null : generatedAt ? (
                      <span title={fullTime(generatedAt, locale)}>
                        {t.updated(timeAgo(generatedAt, now, locale))}
                        <span className="max-sm:hidden"> · {nextUpdate(generatedAt, now, locale)}</span>
                      </span>
                    ) : (
                      <span>{t.live}</span>
                    )}
                  </span>
                </div>
              </div>

              {outage && (
                <p role="status" className="mt-3 rounded-2xl border border-danger/30 bg-danger-soft p-4 text-sm text-danger">
                  {t.outage(formatCount(failedCount, locale), formatCount(fetchedCount, locale))}{" "}
                  <a href="/health/" className="font-semibold underline">
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
                <nav className="hidden shrink-0 items-center gap-1 md:flex" aria-label={t.sectionsLabel} data-tour="sections">
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
                          <span className={`text-xs tabular-nums ${active ? "opacity-60" : "text-muted"}`}>
                            {formatCount(savedCount, locale)}
                          </span>
                        )}
                      </a>
                    );
                  })}
                </nav>

                {/* What a search finds, read out as it changes (the Videos view shows only its own). */}
                <p className="sr-only" role="status">
                  {search && boardView && hasData
                    ? searching
                      ? t.searchingAll
                      : filtered.length
                        ? t.searchFound(filtered.length, formatCount(filtered.length, locale))
                        : searchOlder
                          ? t.nothingRecent
                          : t.nothingFound
                    : ""}
                </p>
                <label className="relative min-w-0 flex-1 md:ml-auto md:max-w-xs" data-tour="search">
                  <span className="sr-only">{view === "videos" ? t.searchVideos : t.searchHeadlines}</span>
                  <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted" />
                  <input
                    ref={searchRef}
                    type="search"
                    value={query}
                    maxLength={MAX_QUERY}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== "Escape") return;
                      setQuery("");
                      e.currentTarget.blur();
                    }}
                    placeholder={view === "videos" ? t.searchVideosHint : t.searchHeadlinesHint}
                    enterKeyHint="search"
                    className="peer h-11 w-full rounded-full border border-line bg-surface pl-10 pr-10 text-[16px] outline-none transition placeholder:text-muted focus:border-accent focus:ring-4 focus:ring-accent/10 md:h-10 md:text-sm [&::-webkit-search-cancel-button]:hidden"
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
                <div className="relative mx-auto -mb-px max-w-7xl md:-mt-1" data-tour="categories">
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

            {/* Focusable from script only: where focus goes when what had it is gone (see Tour). */}
            <main tabIndex={-1} className="mx-auto max-w-7xl px-4 pt-4 outline-none sm:px-6 sm:pt-6">
              {/* News's views on the left, My news on the right; on larger screens, Filters too (also in Saved). Videos has neither. */}
              {view !== "videos" && (
                <div className={`mb-4 items-center gap-3 sm:mb-5 ${sectionOf(view) === "news" ? "flex" : "hidden md:flex"}`}>
                  {sectionOf(view) === "news" && (
                    <div className="min-w-0 flex-1 sm:flex-none" data-tour="views">
                      <Segmented label={t.newsView} value={view} onChange={changeView} options={newsViews(t)} full />
                    </div>
                  )}
                  <div className="ml-auto flex items-center gap-3">
                    {sectionOf(view) === "news" && (
                      <div className="flex" data-tour="pins">
                        <PinsButton label={t.myNews} count={pinsNow.ids.length} onClick={() => setPinsOpen(true)} compact />
                      </div>
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
                <div
                  className="rounded-2xl border border-dashed border-line px-6 py-14 text-center"
                  aria-live={search ? undefined : "polite"}
                >
                  {incomplete ? (
                    <p className="flex items-center justify-center gap-2 text-sm text-muted">
                      <RefreshIcon spinning className="h-4 w-4" />
                      {searching ? t.searchingAll : t.loadingAll}
                    </p>
                  ) : (
                    <>
                      <p className="font-display text-xl">{searchOlder ? t.nothingRecent : t.nothingFound}</p>
                      {!searchOlder && <p className="mt-1 text-sm text-muted">{t.tryAnother}</p>}
                    </>
                  )}
                </div>
              )}

              {hasData && view !== "saved" && view !== "videos" && searching && filtered.length > 0 && (
                <p className="mb-3 flex items-center gap-2 text-sm text-muted">
                  <RefreshIcon spinning className="h-4 w-4" />
                  {t.searchingAll}
                </p>
              )}

              {hasData && view === "top" && !(filtering && filtered.length === 0) && (
                <TopStories
                  // A new filter starts from the first page of stories again.
                  key={`${filtersToSearch({ ...DEFAULT_FILTERS, lang, source: onlySource, category, query: searchQuery })}${onlyNew ? "&new" : ""}`}
                  stories={stories}
                  sourceById={sourceById}
                  now={now}
                  isNew={isNew}
                  savedLinks={savedLinks}
                  onToggleSave={toggleSaved}
                  onShare={shareItem}
                  emptyHint={
                    loading || incomplete || storiesPending
                      ? t.topEmpty.grouping
                      : onlySource
                        ? t.topEmpty.source(sourceById.get(onlySource)?.name ?? t.topEmpty.thisSource)
                        : filtering
                          ? t.topEmpty.filtered
                          : t.topEmpty.none
                  }
                />
              )}

              {hasData && view === "latest" && !(filtering && filtered.length === 0) && (
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

              {view === "videos" &&
                (() => {
                  const board = (
                    <VideoBoard
                      query={searchQuery}
                      search={search}
                      rail={videoRail}
                      refreshSignal={videoRefresh}
                      onShare={shareVideo}
                      seed={videoSeed}
                    />
                  );
                  // No boundary around one already loaded: React writes a large one's content at the end
                  // of the prerendered page, with its fallback in place until a script swaps it in.
                  return VideoBoard === LazyVideoBoard ? <Suspense fallback={<VideoSkeleton />}>{board}</Suspense> : board;
                })()}

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
                        total={cardTotals && (cardTotals[s.id] ?? 0)}
                        onShowAll={whole ? undefined : showAllCards}
                        pinned={pinnedIds.has(s.id)}
                        onTogglePin={toggleSourcePin}
                      />
                    </Fragment>
                  ))}
                </div>
              )}

              {/* After the view's own results, whichever view it is. */}
              {hasData && searchOlder && search && (
                <OlderResults
                  key={filtersToSearch({ ...DEFAULT_FILTERS, lang, source: onlySource, category, query: searchQuery })}
                  search={search}
                  boardKeys={boardKeys}
                  lang={lang}
                  source={onlySource}
                  category={category}
                  sourceById={sourceById}
                  now={now}
                  savedLinks={savedLinks}
                  onToggleSave={toggleSaved}
                  onShare={shareItem}
                />
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
                <button type="button" onClick={startTour} className="hover:text-foreground">
                  {t.tour.footer}
                </button>
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

            {/* New headlines from the automatic refresh, held back so nothing moves while reading. Always in
                the page as a status, so the button is read out when it appears. */}
            <div role="status" className="pointer-events-none fixed inset-x-0 bottom-24 z-30 flex justify-center px-4 md:bottom-8">
              {pending && view !== "videos" && (
                <button
                  type="button"
                  onClick={showPending}
                  className="pointer-events-auto inline-flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-accent-ink shadow-card transition active:scale-95"
                >
                  <ChevronIcon className="h-4 w-4 rotate-180" />
                  {t.newHeadlines(pending.fresh, formatCount(pending.fresh, locale))}
                </button>
              )}
            </div>

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
                <NavButton
                  active={false}
                  onClick={() => setFiltersOpen(true)}
                  label={t.filters}
                  badge={activeFilters.length}
                  tour="filters-phone"
                >
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
                  {view === "videos"
                    ? t.done
                    : t.showHeadlines(
                        formatCount(view === "saved" ? savedMatching.length + savedVideosMatching.length : filtered.length, locale),
                      )}
                </button>
              </div>
            </Sheet>

            <Sheet open={pinsOpen} onClose={() => setPinsOpen(false)} title={t.myNews}>
              <PinPicker kind="site" options={pinOptions} pins={pinsNow} onChange={updatePins} />
            </Sheet>

            <Sheet open={!!sharing} onClose={() => setSharing(null)} title={sharing?.video ? t.shareVideo : t.shareHeadline}>
              {sharing && <ShareOptions shared={sharing} />}
            </Sheet>

            <Tour open={tourOpen} onClose={() => setTourOpen(false)} />
            {!tourOpen && <TourInvite onStart={startTour} />}

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
      </Logos>
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
      href="/account/"
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
  tour,
  children,
  ...intent
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  badge?: number;
  /** Where the site tour points (see Tour.tsx). */
  tour?: string;
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
      data-tour={tour}
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
        data-tour="filters"
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
        role="dialog"
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
