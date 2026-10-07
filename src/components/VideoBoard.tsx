"use client";

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal, preconnect } from "react-dom";
import type { Video, VideoFeed } from "@/lib/types";
import { CategoryTabs } from "./CategoryTabs";
import { useSavedVideos } from "./saved";
import { AT_TOP_PX, AUTO_REFRESH_MS } from "./schedule";
import { formatCount } from "./time";
import { ChevronIcon } from "./ui";
import { Player, VideoCard } from "./VideoCard";
import { cachedVideos, cachedVideosAt, loadVideos } from "./videos";
import { VideoSkeleton } from "./VideoSkeleton";

/** Videos drawn at first, and added each time the reader nears the end. */
const PAGE = 24;
/** Add the next page this far before the reader reaches the end. */
const LOAD_AHEAD = "1200px 0px";
/** The first few thumbnails load at once; the rest as they near the screen. */
const EAGER = 6;

/** Newer videos from the automatic refresh, with how many of them the page doesn't show yet. */
type Pending = { feed: VideoFeed; fresh: number };

/**
 * The Videos view: TV channels' latest YouTube videos, newest first, with a channel rail in the
 * toolbar (`rail`). Loaded only when the reader opens it (see videos.ts). A video plays in a player
 * over the page; YouTube's own page is a middle-click or a link away.
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

  /** Look for newer videos; while the reader is down the list, offer them instead of moving it. */
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

  // First open: fetch (or join the fetch the Videos button started). Reopened later, the videos
  // already here show at once, and newer ones are looked for if they are due.
  useEffect(() => {
    if (!feedRef.current) {
      loadVideos().then(show, (err: unknown) => setError(err instanceof Error ? err.message : String(err)));
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

  const names = useMemo(() => new Map(feed?.channels.map((c) => [c.id, c.name])), [feed]);
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
  const list = useMemo(() => (channel ? matching.filter((v) => v.channel === channel) : matching), [matching, channel]);

  // A new channel or search starts again from the first page.
  const listKey = `${channel}\n${q}`;
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
        ...feed.channels.map((c) => ({ id: c.id, label: c.name, href: "/?view=videos", count: counts.get(c.id) ?? 0 })),
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

      {feed && list.length > 0 && (
        <ul className="grid gap-x-4 gap-y-4 sm:grid-cols-2 sm:gap-y-7 lg:grid-cols-3 xl:grid-cols-4">
          {list.slice(0, shown).map((v, i) => (
            <VideoCard
              key={v.id}
              video={v}
              channelName={names.get(v.channel) ?? v.channel}
              now={now}
              eager={i < EAGER}
              saved={savedVideoIds.has(v.id)}
              onPlay={play}
              onToggleSave={toggleSavedVideo}
              onShare={onShare}
            />
          ))}
        </ul>
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
