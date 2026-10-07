"use client";

import { memo, startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal, preconnect } from "react-dom";
import type { Video, VideoFeed } from "@/lib/types";
import { CategoryTabs } from "./CategoryTabs";
import { AT_TOP_PX, PUBLISH_LAG_MS, RETRY_MS, UPDATE_EVERY_MS } from "./schedule";
import { compactCount, formatCount, fullTime, timeAgo } from "./time";
import { ArrowUpRightIcon, ChevronIcon, CloseIcon } from "./ui";
import { cachedVideos, loadVideos } from "./videos";
import { VideoSkeleton } from "./VideoSkeleton";

/** Videos drawn at first, and added each time the reader nears the end. */
const PAGE = 24;
/** Add the next page this far before the reader reaches the end. */
const LOAD_AHEAD = "1200px 0px";
/** The first few thumbnails load at once; the rest as they near the screen. */
const EAGER = 6;

const watchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;
const thumb = (id: string, size: "mqdefault" | "hqdefault") => `https://i.ytimg.com/vi/${id}/${size}.jpg`;

/** A newer build from the automatic refresh, with how many of its videos the page doesn't show yet. */
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
}: {
  query: string;
  /** Where the channel rail goes (in the sticky toolbar). */
  rail: HTMLElement | null;
  /** Changes when the reader presses Refresh. */
  refreshSignal: number;
}) {
  const [feed, setFeed] = useState<VideoFeed | undefined>(cachedVideos);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [channel, setChannel] = useState("");
  const [playing, setPlaying] = useState<Video | null>(null);
  const [now, setNow] = useState(() => Date.now());
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
              onPlay={play}
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

/**
 * One video: a row (thumbnail beside the title) on phones, a card in a grid on larger screens. A
 * plain click plays it here; modified clicks open YouTube as links do.
 */
const VideoCard = memo(function VideoCard({
  video,
  channelName,
  now,
  eager,
  onPlay,
}: {
  video: Video;
  channelName: string;
  now: number;
  eager: boolean;
  onPlay: (video: Video) => void;
}) {
  const href = watchUrl(video.id);
  const open = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    onPlay(video);
  };
  return (
    // Off-screen cards skip layout and paint until they come near.
    <li className="flex gap-3 [contain-intrinsic-size:auto_92px] [content-visibility:auto] sm:block sm:[contain-intrinsic-size:auto_290px]">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={open}
        tabIndex={-1}
        aria-hidden
        className="group relative block w-40 shrink-0 self-start overflow-hidden rounded-xl bg-surface-2 sm:w-full"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- YouTube's own thumbnails, already sized */}
        <img
          src={thumb(video.id, "mqdefault")}
          // hqdefault is 4:3 with bars above and below; cropped to 16:9, the bars fall outside.
          srcSet={`${thumb(video.id, "mqdefault")} 320w, ${thumb(video.id, "hqdefault")} 480w`}
          sizes="(min-width: 1280px) 22vw, (min-width: 1024px) 30vw, (min-width: 640px) 46vw, 160px"
          width={320}
          height={180}
          alt=""
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : "low"}
          decoding="async"
          className="aspect-video w-full object-cover transition duration-300 group-hover:scale-[1.03]"
        />
        <span className="absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:opacity-100">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/65 text-white">
            <PlayGlyph />
          </span>
        </span>
      </a>
      <div className="min-w-0 sm:mt-2.5">
        <a
          data-headline
          lang="bn"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={open}
          className="line-clamp-3 text-[15px] font-medium leading-[1.5] transition hover:text-accent sm:line-clamp-2"
        >
          {video.title}
        </a>
        <p className="mt-1 text-xs text-muted">
          <span className="font-semibold text-accent">{channelName}</span>
          {" · "}
          <time dateTime={video.publishedAt} title={fullTime(video.publishedAt)}>
            {timeAgo(video.publishedAt, now)}
          </time>
          {video.views ? ` · ${compactCount(video.views)} views` : ""}
        </p>
      </div>
    </li>
  );
});

function PlayGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="ml-0.5 h-5 w-5" fill="currentColor" aria-hidden>
      <path d="M8 5.5v13l10.5-6.5z" />
    </svg>
  );
}

/** The video over the page. Closing it removes the player, which stops the video. */
function Player({ video, channelName, onClose }: { video: Video; channelName: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  // Not left to the dialog's close event alone: browsers hold it back in background tabs, and the
  // player has to go (with its sound) whenever the reader closes it.
  const close = () => {
    ref.current?.close();
    onClose();
  };

  return (
    <dialog
      ref={ref}
      className="player"
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && close()}
      aria-label={video.title}
    >
      <div className="overflow-hidden rounded-2xl bg-black shadow-2xl">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&playsinline=1&rel=0`}
          title={video.title}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          className="block aspect-video w-full"
        />
      </div>
      <div className="mt-3 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p lang="bn" className="font-medium leading-snug">
            {video.title}
          </p>
          <p className="mt-1 text-xs text-white/70">{channelName}</p>
        </div>
        <a
          href={watchUrl(video.id)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 shrink-0 items-center gap-1 rounded-full bg-white/10 px-3.5 text-sm font-semibold hover:bg-white/20"
        >
          YouTube
          <ArrowUpRightIcon className="h-4 w-4" />
        </a>
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          // Focused first, so Enter or Space closes rather than leaving for YouTube.
          autoFocus
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
        >
          <CloseIcon className="h-5 w-5" />
        </button>
      </div>
    </dialog>
  );
}
