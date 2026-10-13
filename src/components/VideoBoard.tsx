"use client";

import { Fragment, startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal, preconnect } from "react-dom";
import { channelName } from "@/lib/bn-names";
import { localePath } from "@/lib/i18n";
import { VIDEOS_PATH } from "@/lib/site";
import type { Video, VideoFeed } from "@/lib/types";
import { VIDEO_LIST, videoThumbSizes } from "@/lib/video-layout";
import { CategoryTabs } from "./CategoryTabs";
import { useLocale, useStrings } from "./locale";
import { MAX_PINS, pinRanks, togglePin, usePinnedChannels } from "./pinned";
import { PinPicker, PinsButton } from "./PinPicker";
import { useSavedVideos } from "./saved";
import { AT_TOP_PX, AUTO_REFRESH_MS } from "./schedule";
import { formatCount } from "./time";
import { ChevronIcon, GridIcon, ListIcon, Segmented, Sheet, StarIcon } from "./ui";
import { Player, type RelatedVideo, VideoCard } from "./VideoCard";
import { setVideoLayout, useVideoLayout, useVideoLayoutChoice } from "./video-layout";
import { cachedVideos, cachedVideosAt, loadVideos } from "./videos";
import { VideoSkeleton } from "./VideoSkeleton";
import type { Search } from "@/lib/search";

/** Videos drawn at first, and added each time the reader nears the end. */
const PAGE = 24;
/** Add the next page this far before the reader reaches the end. */
const LOAD_AHEAD = "1200px 0px";
/** The first few thumbnails load at once; the rest as they near the screen. */
const EAGER = 6;

/** Newer videos from the automatic refresh, with how many of them the page doesn't show yet. */
type Pending = { feed: VideoFeed; fresh: number };

/**
 * One card: a video, and other channels' videos of the same news listed under it; `hits`, how many of its
 * videos the search matches (all of them with no search), which is what the counts add up.
 */
type Card = { lead: Video; related: RelatedVideo[]; hits: number };
const NO_RELATED: RelatedVideo[] = [];

/** Newest first, or the day's most watched first (by the leading video's views, see withCurrentViews). */
type Order = "latest" | "views";

/** Most viewed first; equal views, newest first. */
const byViews = (a: Card, b: Card) =>
  (b.lead.views ?? 0) - (a.lead.views ?? 0) || (a.lead.publishedAt < b.lead.publishedAt ? 1 : -1);

/** The feed's videos with each story's together, at its newest video's place (see Video.story). */
function byStory(videos: Video[]): Video[][] {
  const stories = new Map<string, Video[]>();
  const out: Video[][] = [];
  for (const v of videos) {
    const story = v.story && stories.get(v.story);
    if (story) story.push(v);
    else {
      const group = [v];
      if (v.story) stories.set(v.story, group);
      out.push(group);
    }
  }
  return out;
}

/**
 * The Videos view: TV channels' latest YouTube videos, newest first (or most viewed), with a channel rail in the
 * toolbar (`rail`). Videos of the same news from several channels are one card, the others listed
 * under it. The reader's pinned channels come first (see pinned.ts). Loaded only when the
 * reader opens it (see videos.ts). A video plays in a player over the page; YouTube's own page is a
 * middle-click or a link away.
 */
export default function VideoBoard({
  query,
  search,
  rail,
  refreshSignal,
  onShare,
  seed,
}: {
  query: string;
  /** `query` compiled: the board's, so a key press compiles it once for both. */
  search: Search | null;
  /** Where the channel rail goes (in the sticky toolbar). */
  rail: HTMLElement | null;
  /** Changes when the reader presses Refresh. */
  refreshSignal: number;
  onShare: (video: Video, channelName: string) => void;
  /** The newest few cached videos rendered with the Videos page (see cachedVideoSeed), shown until the feed loads. */
  seed?: VideoFeed;
}) {
  const [feed, setFeed] = useState<VideoFeed | undefined>(() => cachedVideos() ?? seed);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [channel, setChannel] = useState("");
  const [order, setOrder] = useState<Order>("latest");
  const [playing, setPlaying] = useState<Video | null>(null);
  // The story whose related videos are laid out (by its id, Video.story, which stays the same whichever
  // video leads the card: a pinned channel's, a search's newest hit): one at a time, so its panel sits
  // right under its card.
  const [openStory, setOpenStory] = useState<string | null>(null);
  const toggleStory = useCallback((story: string) => setOpenStory((id) => (id === story ? null : story)), []);
  // The open story's panel goes in a row of its own after its card's row, in the page as on screen (so
  // the keyboard reaches it after that row's cards): the grid's columns say where that row ends.
  const [storySlot, setStorySlot] = useState<HTMLLIElement | null>(null);
  const [columns, setColumns] = useState(1);
  const grid = useCallback((ul: HTMLUListElement | null) => {
    if (!ul) return;
    const measure = () => setColumns(getComputedStyle(ul).gridTemplateColumns.split(" ").filter(Boolean).length || 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(ul);
    return () => observer.disconnect();
  }, []);
  // With a seed, the clock starts at its render time so the server's HTML and hydration agree.
  const [now, setNow] = useState(() => (!cachedVideos() && seed ? Date.parse(seed.generatedAt) : Date.now()));
  const { savedVideoIds, toggleSavedVideo } = useSavedVideos();
  const [pins, updatePins] = usePinnedChannels();
  const [pinsOpen, setPinsOpen] = useState(false);
  const layout = useVideoLayout();
  const sizes = videoThumbSizes(useVideoLayoutChoice());
  const feedRef = useRef(feed);
  // The seed is only the start of its build's feed, so the first load replaces it. Until then a search or
  // channel may not have found everything, and counts are only the seed's.
  const [partial, setPartial] = useState(feed === seed && !!seed);
  const partialRef = useRef(partial);
  useEffect(() => {
    feedRef.current = feed;
    partialRef.current = partial;
  }, [feed, partial]);

  // The thumbnails' server, and the player's once a video is picked.
  preconnect("https://i.ytimg.com");

  /** Shows a whole feed (never the seed). */
  const show = useCallback((next: VideoFeed) => {
    partialRef.current = false;
    startTransition(() => {
      setPartial(false);
      setFeed(next);
      setPending(null);
      setError(null);
      setNow(Date.now());
    });
  }, []);

  /** Look for newer videos; while the reader is down the list, offer them instead of moving it. */
  const refreshQuietly = useCallback(() => {
    loadVideos(true).then(
      (next) => {
        const current = feedRef.current;
        // Still on the seed (its first load failed): the whole feed, whichever build, replaces it at once.
        if (partialRef.current) return show(next);
        if (next.generatedAt === current?.generatedAt) return;
        const known = new Set(current?.videos.map((v) => v.id));
        const fresh = next.videos.filter((v) => !known.has(v.id)).length;
        if (current && fresh && !document.hidden && window.scrollY > AT_TOP_PX) setPending({ feed: next, fresh });
        else show(next);
      },
      () => {}, // The next look tries again.
    );
  }, [show]);

  // First open: fetch (or join the fetch the Videos button started). Reopened later, the videos
  // already here show at once, and newer ones are looked for if they are due.
  useEffect(() => {
    if (!feedRef.current || partialRef.current) {
      loadVideos().then(
        show,
        (err: unknown) => setError(err instanceof Error ? err.message : String(err)),
      );
    } else if (Date.now() - cachedVideosAt() >= AUTO_REFRESH_MS) {
      refreshQuietly();
    }
  }, [show, refreshQuietly]);

  // Refresh button.
  const firstSignal = useRef(refreshSignal);
  useEffect(() => {
    if (refreshSignal === firstSignal.current) return;
    loadVideos(true, true).then(show, (err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [refreshSignal, show]);

  // Look for newer videos as often as the board looks for headlines.
  useEffect(() => {
    const refresh = setInterval(refreshQuietly, AUTO_REFRESH_MS);
    const tick = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      clearInterval(refresh);
      clearInterval(tick);
    };
  }, [refreshQuietly]);

  // Channels by their Bangla names on Bangla pages.
  const locale = useLocale();
  const names = useMemo(
    () => new Map(feed?.channels.map((c) => [c.id, channelName(c.id, c.name, locale)])),
    [feed, locale],
  );
  // The reader's own channels and their places; empty while "Pinned first" is off.
  const rank = useMemo(() => pinRanks(pins, new Set(names.keys())), [pins, names]);
  const pinnedIds = useMemo(() => new Set(pins.ids), [pins]);

  /** A video's "Pin channel". Pinning turns "Pinned first" back on; with no room left, the picker opens. */
  const togglePinned = useCallback(
    (id: string) => {
      if (!pins.ids.includes(id) && pins.ids.length >= MAX_PINS) return setPinsOpen(true);
      updatePins((p) => {
        const next = togglePin(p, id);
        return next.ids.includes(id) ? { ...next, off: false } : next;
      });
    },
    [pins, updatePins],
  );
  const matching = useMemo(
    () => (search ? (feed?.videos ?? []).filter((v) => search.matches(v.title)) : (feed?.videos ?? [])),
    [feed, search],
  );
  const counts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const v of matching) counts.set(v.channel, (counts.get(v.channel) ?? 0) + 1);
    return counts;
  }, [matching]);
  const stories = useMemo(() => byStory(feed?.videos ?? []), [feed]);
  // One card per story. A search keeps the stories with a matching video, and the card leads with
  // the newest of those (the most viewed, in that order); a pinned channel's video leads where there is
  // one. With pinned channels (and no single channel picked), their cards come first, each part newest
  // (or most viewed) first. A single channel's videos are one card each.
  const { list, mine, mineVideos } = useMemo(() => {
    if (channel) {
      const list = matching.filter((v) => v.channel === channel).map((lead) => ({ lead, related: NO_RELATED, hits: 1 }));
      return { list: order === "views" ? list.sort(byViews) : list, mine: 0, mineVideos: 0 };
    }
    const cards: Card[] = [];
    const pinned: Card[] = [];
    let pinnedVideos = 0;
    for (const story of stories) {
      const hits = search ? story.filter((v) => search.matches(v.title)) : story;
      if (!hits.length) continue;
      // The reader's highest-placed channel's video leads, the newest (or most viewed) of its; else the
      // newest (or most viewed).
      let lead = hits[0];
      for (const v of hits) {
        const place = (rank.get(v.channel) ?? MAX_PINS) - (rank.get(lead.channel) ?? MAX_PINS);
        if (place < 0 || (place === 0 && order === "views" && (v.views ?? 0) > (lead.views ?? 0))) lead = v;
      }
      const related =
        story.length > 1
          ? story.filter((v) => v !== lead).map((video) => ({ video, channelName: names.get(video.channel) ?? video.channel }))
          : NO_RELATED;
      const card = { lead, related, hits: hits.length };
      cards.push(card);
      if (rank.has(lead.channel)) {
        pinned.push(card);
        pinnedVideos += hits.length;
      }
    }
    if (order === "views") {
      cards.sort(byViews);
      pinned.sort(byViews);
    }
    if (!pinned.length || pinned.length === cards.length) return { list: cards, mine: 0, mineVideos: 0 };
    const yours = new Set(pinned);
    return { list: [...pinned, ...cards.filter((c) => !yours.has(c))], mine: pinned.length, mineVideos: pinnedVideos };
  }, [matching, stories, search, channel, rank, names, order]);
  // The videos the search matches in the listed cards: what the "All" tab counts too.
  const listedVideos = useMemo(() => list.reduce((n, c) => n + c.hits, 0), [list]);

  // A new channel, search, order or set of pins starts again from the first page.
  const listKey = `${channel}\n${query.trim()}\n${order}\n${[...rank.keys()].join()}`;
  const [paging, setPaging] = useState({ key: listKey, shown: PAGE });
  // ...and closes the open story, which would otherwise scroll back into view when its card returns.
  const [openFor, setOpenFor] = useState(listKey);
  if (openFor !== listKey) {
    setOpenFor(listKey);
    setOpenStory(null);
  }
  const shown = paging.key === listKey ? paging.shown : PAGE;
  const more = shown < list.length;
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !more) return;
    // Observed afresh after each page, so a sentinel still in range adds the next one too.
    const observer = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && setPaging({ key: listKey, shown: shown + PAGE }),
      { rootMargin: LOAD_AHEAD },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [more, shown, listKey]);

  /** From deep in the list, jumps back to its top. */
  const toTop = () => {
    const main = document.querySelector("main");
    const toolbar = document.querySelector("[data-toolbar]");
    if (!main || !toolbar) return;
    const top = main.getBoundingClientRect().top + window.scrollY - toolbar.getBoundingClientRect().height;
    if (window.scrollY > top) window.scrollTo({ top, behavior: "instant" });
  };
  /** Picks a channel, from the top of its list. */
  const pickChannel = (id: string) => {
    setChannel(id);
    toTop();
  };
  /** Newest or most viewed first, from the top of the list. */
  const pickOrder = (next: Order) => {
    setOrder(next);
    toTop();
  };

  const showPending = () => {
    if (!pending) return;
    show(pending.feed);
    window.scrollTo({ top: 0 });
  };

  const play = useCallback((video: Video) => {
    preconnect("https://www.youtube-nocookie.com");
    setPlaying(video);
  }, []);

  const t = useStrings();
  const videosPath = localePath(VIDEOS_PATH, locale);
  // The seed is only the newest few, so the most viewed wait for the whole feed.
  const waiting = partial && order === "views";
  const failed = feed?.channels.filter((c) => !c.ok) ?? [];
  // While only the seed is here: with no search, the whole feed's counts that came with it; with one,
  // none yet (the seed's few would only grow).
  const seedCounts = partial ? feed?.counts : undefined;
  const countOf = (id: string): number | undefined =>
    !partial ? (counts.get(id) ?? 0) : search || !seedCounts ? undefined : (seedCounts[id] ?? 0);
  const tabs = feed
    ? [
        {
          id: "",
          label: t.allChannels,
          href: videosPath,
          count: !partial
            ? matching.length
            : search || !seedCounts
              ? undefined
              : Object.values(seedCounts).reduce((a, b) => a + b, 0),
        },
        // Pinned channels first in the rail too, in the reader's order.
        ...[...feed.channels]
          .sort((a, b) => (rank.get(a.id) ?? MAX_PINS) - (rank.get(b.id) ?? MAX_PINS))
          .map((c) => ({ id: c.id, label: names.get(c.id)!, href: videosPath, count: countOf(c.id) })),
      ]
    : [];

  return (
    <section>
      {rail &&
        feed &&
        createPortal(<CategoryTabs tabs={tabs} value={channel} onChange={pickChannel} label={t.filterByChannel} />, rail)}

      {/* (On the seed too: its first load failing leaves only a screenful.) */}
      {error && (!feed || partial) && (
        <div className="rounded-2xl border border-danger/30 bg-danger-soft p-4 text-sm text-danger">
          {t.couldNotLoadVideos(error)}{" "}
          <button
            type="button"
            onClick={() => {
              setError(null);
              loadVideos(true).then(show, (err: unknown) => setError(err instanceof Error ? err.message : String(err)));
            }}
            className="font-semibold underline"
          >
            {t.tryAgain}
          </button>
        </div>
      )}

      {/* What a search finds, read out as it changes (nothing while the seed's few wait for the rest). */}
      <p className="sr-only" role="status">
        {feed && search
          ? listedVideos
            ? t.videosFound(listedVideos, formatCount(listedVideos, locale))
            : partial
              ? ""
              : t.noVideos
          : ""}
      </p>

      {!feed && !error && <VideoSkeleton />}

      {/* Nothing in the seed isn't nothing in the feed: wait for it. */}
      {feed && list.length === 0 && partial && !error && <VideoSkeleton />}

      {feed && list.length === 0 && !partial && (
        <div className="rounded-2xl border border-dashed border-line px-6 py-14 text-center">
          <p className="font-display text-xl">{t.noVideos}</p>
          <p className="mt-1 text-sm text-muted">
            {search ? t.tryAnotherChannel : channel ? t.nothingFromChannel : t.nothingYet}
          </p>
        </div>
      )}

      {/* On the narrowest phones, the layout and My channels go under the order when they don't fit beside it. */}
      {feed && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 sm:mb-5">
          <Segmented
            label={t.videoOrder.label}
            value={order}
            onChange={pickOrder}
            options={[
              { value: "latest", label: t.videoOrder.latest },
              { value: "views", label: t.videoOrder.views },
            ]}
          />
          <div className="ml-auto flex items-center gap-2">
            <LayoutSwitch value={layout} />
            <PinsButton label={t.myChannels} count={pins.ids.length} onClick={() => setPinsOpen(true)} compact />
          </div>
        </div>
      )}

      {feed && waiting && list.length > 0 && !error && <VideoSkeleton />}

      {feed && !waiting && list.length > 0 && (
        <>
          {/* With pinned channels on show, theirs and everyone else's are two grids, each with a heading. */}
          {(mine ? [list.slice(0, Math.min(shown, mine)), list.slice(mine, shown)] : [list.slice(0, shown)]).map(
            (part, p) =>
              part.length > 0 && (
                <Fragment key={p}>
                  {mine > 0 && (
                    <h2 className={`mb-3 flex items-center gap-2 px-1 font-display text-xl ${p ? "pt-10" : ""}`}>
                      {p === 0 && <StarIcon filled className="h-[18px] w-[18px] text-gold" />}
                      {p === 0 ? t.fromYourChannels : t.everythingElse}
                      {/* (Not on the seed: its counts are only its own first few.) */}
                      {!partial && (
                        <span className="font-sans text-sm tabular-nums text-muted">
                          {formatCount(p === 0 ? mineVideos : listedVideos - mineVideos, locale)}
                        </span>
                      )}
                    </h2>
                  )}
                  <ul ref={p === 0 ? grid : undefined} className={VIDEO_LIST}>
                    {(() => {
                      // The slot for the open story's panel goes after the last card of its card's row.
                      const open = part.findIndex(({ lead, related }) => related.length > 0 && openStory === (lead.story ?? lead.id));
                      const rowEnd = open < 0 ? -1 : Math.min(part.length - 1, (Math.floor(open / columns) + 1) * columns - 1);
                      return part.flatMap(({ lead: v, related }, i) => {
                        const card = (
                          <VideoCard
                            key={channel ? v.id : (v.story ?? v.id)}
                            video={v}
                            channelName={names.get(v.channel) ?? v.channel}
                            now={now}
                            eager={p === 0 && i < EAGER}
                            sizes={sizes}
                            saved={savedVideoIds.has(v.id)}
                            onPlay={play}
                            onToggleSave={toggleSavedVideo}
                            onShare={onShare}
                            pinned={pinnedIds.has(v.channel)}
                            onTogglePin={togglePinned}
                            related={related}
                            // Only cards with related videos need these (each save redraws them).
                            savedIds={related.length ? savedVideoIds : undefined}
                            pinnedIds={related.length ? pinnedIds : undefined}
                            storyOpen={i === open}
                            storySlot={i === open ? storySlot : undefined}
                            onToggleStory={toggleStory}
                          />
                        );
                        if (i !== rowEnd) return [card];
                        return [card, <li key="story-slot" ref={setStorySlot} className="col-span-full empty:hidden" />];
                      });
                    })()}
                  </ul>
                </Fragment>
              ),
          )}
        </>
      )}
      <div ref={sentinel} aria-hidden />

      {feed && !more && !partial && (
        <p className="px-1 pt-8 text-center text-xs leading-relaxed text-muted">
          {t.videosNote(formatCount(feed.channels.length - failed.length, locale))}
          {failed.length > 0 && (
            <span title={failed.map((c) => `${names.get(c.id) ?? c.name}: ${c.error}`).join("\n")}>
              {" "}
              {t.unreachable(failed.map((c) => names.get(c.id) ?? c.name).join(", "))}
            </span>
          )}
        </p>
      )}

      {/* Always in the page as a status, so the button is read out when it appears. */}
      <div role="status" className="pointer-events-none fixed inset-x-0 bottom-24 z-30 flex justify-center px-4 md:bottom-8">
        {pending && (
          <button
            type="button"
            onClick={showPending}
            className="pointer-events-auto inline-flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-accent-ink shadow-card transition active:scale-95"
          >
            <ChevronIcon className="h-4 w-4 rotate-180" />
            {t.newVideos(pending.fresh, formatCount(pending.fresh, locale))}
          </button>
        )}
      </div>

      <Sheet open={pinsOpen} onClose={() => setPinsOpen(false)} title={t.myChannels}>
        <PinPicker
          kind="channel"
          options={(feed?.channels ?? []).map((c) => ({ id: c.id, name: names.get(c.id)! }))}
          pins={pins}
          onChange={updatePins}
        />
      </Sheet>

      {playing && (
        <Player
          key={playing.id}
          video={playing}
          channelName={names.get(playing.channel) ?? ""}
          onClose={() => setPlaying(null)}
        />
      )}
    </section>
  );
}

/** Grid or List, beside My channels. The layout itself comes from CSS (see video-layout.ts). */
function LayoutSwitch({ value }: { value: "grid" | "list" }) {
  const t = useStrings();
  const options = [
    { value: "grid", label: t.videoLayout.grid, Icon: GridIcon },
    { value: "list", label: t.videoLayout.list, Icon: ListIcon },
  ] as const;
  return (
    <div className="inline-flex h-10 rounded-full border border-line bg-surface p-1" role="group" aria-label={t.videoLayout.label}>
      {options.map(({ value: v, label, Icon }) => (
        <button
          key={v}
          type="button"
          onClick={() => setVideoLayout(v)}
          aria-pressed={value === v}
          aria-label={label}
          title={label}
          className={`flex w-9 items-center justify-center rounded-full transition ${
            value === v ? "bg-accent-soft text-accent" : "text-muted hover:text-foreground"
          }`}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}
