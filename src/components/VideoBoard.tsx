"use client";

import { Fragment, startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal, preconnect } from "react-dom";
import type { Video, VideoFeed } from "@/lib/types";
import { CategoryTabs } from "./CategoryTabs";
import { MAX_PINS, pinRanks, togglePin, usePinnedChannels } from "./pinned";
import { PinPicker } from "./PinPicker";
import { AT_TOP_PX, PUBLISH_LAG_MS, RETRY_MS, UPDATE_EVERY_MS } from "./schedule";
import { useSavedVideos } from "./saved";
import { formatCount } from "./time";
import { ChevronIcon, Sheet, StarIcon } from "./ui";
import { Player, VideoCard } from "./VideoCard";
import { cachedVideos, loadVideos } from "./videos";
import { VideoSkeleton } from "./VideoSkeleton";

/** Videos drawn at first, and added each time the reader nears the end. */
const PAGE = 24;
/** Add the next page this far before the reader reaches the end. */
const LOAD_AHEAD = "1200px 0px";
/** The first few thumbnails load at once; the rest as they near the screen. */
const EAGER = 6;

/** A newer build from the automatic refresh, with how many of its videos the page doesn't show yet. */
type Pending = { feed: VideoFeed; fresh: number };

/**
 * The Videos view: TV channels' latest YouTube videos, newest first, with a channel rail in the
 * toolbar (`rail`). The reader's pinned channels come first (see pinned.ts). Loaded only when the
 * reader opens it (see videos.ts). A video plays in a player over the page; YouTube's own page is a
 * middle-click or a link away.
 */
export default function VideoBoard({
  query,
  rail,
  refreshSignal,
  onShare,
}: {
  query: string;
  /** Where the channel rail goes (in the sticky toolbar). */
  rail: HTMLElement | null;
  /** Changes when the reader presses Refresh. */
  refreshSignal: number;
  onShare: (video: Video, channelName: string) => void;
}) {
  const [feed, setFeed] = useState<VideoFeed | undefined>(cachedVideos);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [channel, setChannel] = useState("");
  const [playing, setPlaying] = useState<Video | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const { savedVideoIds, toggleSavedVideo } = useSavedVideos();
  const [pins, updatePins] = usePinnedChannels();
  const [pinsOpen, setPinsOpen] = useState(false);
  const feedRef = useRef(feed);
  useEffect(() => {
    feedRef.current = feed;
  }, [feed]);

  // The thumbnails' server, and the player's once a video is picked.
  preconnect("https://i.ytimg.com");

  const show = useCallback((next: VideoFeed) => {
    startTransition(() => {
      setFeed(next);
      setPending(null);
      setError(null);
      setNow(Date.now());
    });
  }, []);

  /** Look for a newer build; while the reader is down the list, offer its videos instead of moving it. */
  const refreshQuietly = useCallback(() => {
    loadVideos(true).then(
      (next) => {
        const current = feedRef.current;
        if (next.generatedAt === current?.generatedAt) return;
        const known = new Set(current?.videos.map((v) => v.id));
        const fresh = next.videos.filter((v) => !known.has(v.id)).length;
        if (current && fresh && !document.hidden && window.scrollY > AT_TOP_PX) setPending({ feed: next, fresh });
        else show(next);
      },
      () => {}, // The next look tries again.
    );
  }, [show]);

  // First open: fetch (or join the fetch the Videos button started).
  useEffect(() => {
    if (feedRef.current) return;
    loadVideos().then(show, (err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [show]);

  // Refresh button.
  const firstSignal = useRef(refreshSignal);
  useEffect(() => {
    if (refreshSignal === firstSignal.current) return;
    loadVideos(true).then(show, (err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [refreshSignal, show]);

  // Look for the next build when it should have landed, then every minute until it has (also when the
  // page comes back into view: browsers pause timers in background tabs).
  const newest = pending?.feed.generatedAt ?? feed?.generatedAt;
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
    // A cached feed reopened after its next build is due looks right away.
    timer = setTimeout(check, Math.max(due - Date.now(), 0));
    document.addEventListener("visibilitychange", checkIfDue);
    const tick = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      clearTimeout(timer);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", checkIfDue);
    };
  }, [newest, refreshQuietly]);

  const names = useMemo(() => new Map(feed?.channels.map((c) => [c.id, c.name])), [feed]);
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
  const q = query.trim().toLowerCase();
  const matching = useMemo(
    () => (q ? (feed?.videos ?? []).filter((v) => v.title.toLowerCase().includes(q)) : (feed?.videos ?? [])),
    [feed, q],
  );
  const counts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const v of matching) counts.set(v.channel, (counts.get(v.channel) ?? 0) + 1);
    return counts;
  }, [matching]);
  // With pinned channels (and no single channel picked), their videos come first, each part newest first.
  const { list, mine } = useMemo(() => {
    if (channel) return { list: matching.filter((v) => v.channel === channel), mine: 0 };
    const pinned = matching.filter((v) => rank.has(v.channel));
    if (!pinned.length || pinned.length === matching.length) return { list: matching, mine: 0 };
    return { list: [...pinned, ...matching.filter((v) => !rank.has(v.channel))], mine: pinned.length };
  }, [matching, channel, rank]);

  // A new channel, search or set of pins starts again from the first page.
  const listKey = `${channel}\n${q}\n${[...rank.keys()].join()}`;
  const [paging, setPaging] = useState({ key: listKey, shown: PAGE });
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

  const failed = feed?.channels.filter((c) => !c.ok) ?? [];
  const tabs = feed
    ? [
        { id: "", label: "All", href: "/?view=videos", count: matching.length },
        // Pinned channels first in the rail too, in the reader's order.
        ...[...feed.channels]
          .sort((a, b) => (rank.get(a.id) ?? MAX_PINS) - (rank.get(b.id) ?? MAX_PINS))
          .map((c) => ({ id: c.id, label: c.name, href: "/?view=videos", count: counts.get(c.id) ?? 0 })),
      ]
    : [];

  return (
    <section>
      {rail && feed && createPortal(<CategoryTabs tabs={tabs} value={channel} onChange={pickChannel} label="Filter by channel" />, rail)}

      {error && !feed && (
        <div className="rounded-2xl border border-danger/30 bg-danger-soft p-4 text-sm text-danger">
          Could not load videos: {error}{" "}
          <button
            type="button"
            onClick={() => {
              setError(null);
              loadVideos(true).then(show, (err: unknown) => setError(err instanceof Error ? err.message : String(err)));
            }}
            className="font-semibold underline"
          >
            Try again
          </button>
        </div>
      )}

      {!feed && !error && <VideoSkeleton />}

      {feed && list.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line px-6 py-14 text-center">
          <p className="font-display text-xl">No videos found</p>
          <p className="mt-1 text-sm text-muted">{q ? "Try another word or channel." : "Nothing from this channel today."}</p>
        </div>
      )}

      {feed && (
        <div className="mb-4 flex justify-end sm:mb-5">
          <button
            type="button"
            onClick={() => setPinsOpen(true)}
            className={`inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium transition active:scale-[0.97] ${
              pins.ids.length > 0
                ? "border-accent/40 bg-accent-soft text-accent"
                : "border-line bg-surface text-foreground hover:bg-surface-2"
            }`}
          >
            <StarIcon filled={pins.ids.length > 0} className="h-4 w-4" />
            My channels
            {pins.ids.length > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold tabular-nums text-accent-ink">
                {pins.ids.length}
              </span>
            )}
          </button>
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
                      {p === 0 ? "From your channels" : "Everything else"}
                      <span className="font-sans text-sm tabular-nums text-muted">
                        {formatCount(p === 0 ? mine : list.length - mine)}
                      </span>
                    </h2>
                  )}
                  <ul className="grid gap-x-4 gap-y-4 sm:grid-cols-2 sm:gap-y-7 lg:grid-cols-3 xl:grid-cols-4">
                    {part.map((v, i) => (
                      <VideoCard
                        key={v.id}
                        video={v}
                        channelName={names.get(v.channel) ?? v.channel}
                        now={now}
                        eager={p === 0 && i < EAGER}
                        saved={savedVideoIds.has(v.id)}
                        onPlay={play}
                        onToggleSave={toggleSavedVideo}
                        onShare={onShare}
                        pinned={pinnedIds.has(v.channel)}
                        onTogglePin={togglePinned}
                      />
                    ))}
                  </ul>
                </Fragment>
              ),
          )}
        </>
      )}
      <div ref={sentinel} aria-hidden />

      {feed && !more && (
        <p className="px-1 pt-8 text-center text-xs leading-relaxed text-muted">
          The last day&rsquo;s videos from {formatCount(feed.channels.length - failed.length)} TV news channels on
          YouTube, without Shorts.
          {failed.length > 0 && (
            <span title={failed.map((c) => `${c.name}: ${c.error}`).join("\n")}>
              {" "}
              Not reachable this time: {failed.map((c) => c.name).join(", ")}.
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
            {formatCount(pending.fresh)} new video{pending.fresh === 1 ? "" : "s"}
          </button>
        </div>
      )}

      <Sheet open={pinsOpen} onClose={() => setPinsOpen(false)} title="My channels">
        <PinPicker
          noun="channel"
          options={(feed?.channels ?? []).map((c) => ({ id: c.id, name: c.name }))}
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
