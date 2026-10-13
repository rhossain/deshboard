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
import { ChevronIcon, GridIcon, ListIcon, Sheet, StarIcon } from "./ui";
import { Player, type RelatedVideo, VideoCard } from "./VideoCard";
import { setVideoLayout, useVideoLayout, useVideoLayoutChoice } from "./video-layout";
import { cachedVideos, cachedVideosAt, loadVideos } from "./videos";
import { VideoSkeleton } from "./VideoSkeleton";
import { useSearch } from "./use-search";

/** Videos drawn at first, and added each time the reader nears the end. */
const PAGE = 24;
/** Add the next page this far before the reader reaches the end. */
const LOAD_AHEAD = "1200px 0px";
/** The first few thumbnails load at once; the rest as they near the screen. */
const EAGER = 6;

/** Newer videos from the automatic refresh, with how many of them the page doesn't show yet. */
type Pending = { feed: VideoFeed; fresh: number };

/** One card: a video, and other channels' videos of the same news listed under it. */
type Card = { lead: Video; related: RelatedVideo[] };
const NO_RELATED: RelatedVideo[] = [];

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
 * The Videos view: TV channels' latest YouTube videos, newest first, with a channel rail in the
 * toolbar (`rail`). Videos of the same news from several channels are one card, the others listed
 * under it. The reader's pinned channels come first (see pinned.ts). Loaded only when the
 * reader opens it (see videos.ts). A video plays in a player over the page; YouTube's own page is a
 * middle-click or a link away.
 */
export default function VideoBoard({
  query,
  rail,
  refreshSignal,
  onShare,
  seed,
}: {
  query: string;
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
  const [playing, setPlaying] = useState<Video | null>(null);
  // The story whose related videos are laid out (by its id, Video.story, which stays the same whichever
  // video leads the card: a pinned channel's, a search's newest hit): one at a time, so its panel sits
  // right under its card.
  const [openStory, setOpenStory] = useState<string | null>(null);
  const toggleStory = useCallback((story: string) => setOpenStory((id) => (id === story ? null : story)), []);
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
  const search = useSearch(query);
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
  // the newest of those; a pinned channel's video leads where there is one. With pinned channels (and
  // no single channel picked), their cards come first, each part newest first. A single channel's
  // videos are one card each.
  const { list, mine, mineVideos } = useMemo(() => {
    if (channel) {
      const list = matching.filter((v) => v.channel === channel).map((lead) => ({ lead, related: NO_RELATED }));
      return { list, mine: 0, mineVideos: 0 };
    }
    const cards: Card[] = [];
    const pinned: Card[] = [];
    let pinnedVideos = 0;
    for (const story of stories) {
      const hits = search ? story.filter((v) => search.matches(v.title)) : story;
      if (!hits.length) continue;
      const lead = hits.find((v) => rank.has(v.channel)) ?? hits[0];
      const related =
        story.length > 1
          ? story.filter((v) => v !== lead).map((video) => ({ video, channelName: names.get(video.channel) ?? video.channel }))
          : NO_RELATED;
      const card = { lead, related };
      cards.push(card);
      if (rank.has(lead.channel)) {
        pinned.push(card);
        pinnedVideos += story.length;
      }
    }
    if (!pinned.length || pinned.length === cards.length) return { list: cards, mine: 0, mineVideos: 0 };
    const yours = new Set(pinned);
    return { list: [...pinned, ...cards.filter((c) => !yours.has(c))], mine: pinned.length, mineVideos: pinnedVideos };
  }, [matching, stories, search, channel, rank, names]);
  const listedVideos = useMemo(() => list.reduce((n, c) => n + 1 + c.related.length, 0), [list]);

  // A new channel, search or set of pins starts again from the first page.
  const listKey = `${channel}\n${query.trim()}\n${[...rank.keys()].join()}`;
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

  /** Picks a channel; from deep in the list, jumps back to its top. */
  const pickChannel = (id: string) => {
    setChannel(id);
    const main = document.querySelector("main");
    const toolbar = document.querySelector("[data-toolbar]");
    if (!main || !toolbar) return;
    const top = main.getBoundingClientRect().top + window.scrollY - toolbar.getBoundingClientRect().height;
    if (window.scrollY > top) window.scrollTo({ top, behavior: "instant" });
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
  const failed = feed?.channels.filter((c) => !c.ok) ?? [];
  const tabs = feed
    ? [
        { id: "", label: t.allChannels, href: videosPath, count: matching.length },
        // Pinned channels first in the rail too, in the reader's order.
        ...[...feed.channels]
          .sort((a, b) => (rank.get(a.id) ?? MAX_PINS) - (rank.get(b.id) ?? MAX_PINS))
          .map((c) => ({ id: c.id, label: names.get(c.id)!, href: videosPath, count: counts.get(c.id) ?? 0 })),
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

      {feed && (
        <div className="mb-4 flex items-center justify-end gap-2 sm:mb-5">
          <LayoutSwitch value={layout} />
          <PinsButton label={t.myChannels} count={pins.ids.length} onClick={() => setPinsOpen(true)} />
        </div>
      )}

      {feed && list.length > 0 && (
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
                      <span className="font-sans text-sm tabular-nums text-muted">
                        {formatCount(p === 0 ? mineVideos : listedVideos - mineVideos, locale)}
                      </span>
                    </h2>
                  )}
                  <ul className={VIDEO_LIST}>
                    {part.map(({ lead: v, related }, i) => (
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
                        storyOpen={related.length > 0 && openStory === (v.story ?? v.id)}
                        onToggleStory={toggleStory}
                      />
                    ))}
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
            <span title={failed.map((c) => `${c.name}: ${c.error}`).join("\n")}>
              {" "}
              {t.unreachable(failed.map((c) => c.name).join(", "))}
            </span>
          )}
        </p>
      )}

      {pending && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-30 flex justify-center px-4 md:bottom-8">
          <button
            type="button"
            onClick={showPending}
            className="pointer-events-auto inline-flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-accent-ink shadow-card transition active:scale-95"
          >
            <ChevronIcon className="h-4 w-4 rotate-180" />
            {t.newVideos(pending.fresh, formatCount(pending.fresh, locale))}
          </button>
        </div>
      )}

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
