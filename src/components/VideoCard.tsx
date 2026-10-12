"use client";

import { memo, useEffect, useId, useRef, useState } from "react";
import type { Video } from "@/lib/types";
import { VIDEO_ITEM, VIDEO_TEXT, VIDEO_THUMB } from "@/lib/video-layout";
import { useLocale, useStrings } from "./locale";
import { compactCount, formatCount, fullTime, timeAgo } from "./time";
import { ArrowUpRightIcon, ChevronIcon, CloseIcon, ItemMenu, StarIcon } from "./ui";
import { thumb, watchUrl } from "./youtube";
import { Highlight } from "./Highlight";

/**
 * One video: a row (thumbnail beside the title) on phones, a card in a grid on larger screens, unless
 * the reader picked a layout (see video-layout.ts; `sizes` follows it). A
 * plain click plays it here; modified clicks open YouTube as links do. The ⋮ menu beside the title
 * shares or saves it, as for headlines, and pins its channel when `onTogglePin` is given.
 *
 * `related` are other channels' videos of the same news (see video-stories.ts), listed under the
 * card: one card per story instead of one per channel.
 */
export const VideoCard = memo(function VideoCard({
  video,
  channelName,
  now,
  eager,
  sizes,
  saved,
  onPlay,
  onToggleSave,
  onShare,
  pinned = false,
  onTogglePin,
  related,
  savedIds,
  pinnedIds,
}: {
  video: Video;
  channelName: string;
  now: number;
  eager: boolean;
  /** The thumbnail's `sizes`, for the layout in use (videoThumbSizes). */
  sizes: string;
  saved: boolean;
  onPlay: (video: Video) => void;
  onToggleSave: (video: Video, channelName: string) => void;
  onShare: (video: Video, channelName: string) => void;
  /** The video's channel is one of the reader's own (see pinned.ts). */
  pinned?: boolean;
  onTogglePin?: (channelId: string) => void;
  related?: RelatedVideo[];
  /** For the related videos' menus: which are saved, and whose channels are pinned. */
  savedIds?: Set<string>;
  pinnedIds?: Set<string>;
}) {
  const t = useStrings();
  const locale = useLocale();
  const href = watchUrl(video.id);
  const open = playOnClick(video, onPlay);
  return (
    // Off-screen cards skip layout and paint until they come near.
    <li className="[contain-intrinsic-size:auto_92px] [content-visibility:auto] sm:[contain-intrinsic-size:auto_290px] vgrid:[contain-intrinsic-size:auto_290px] vlist:[contain-intrinsic-size:auto_92px] sm:vlist:[contain-intrinsic-size:auto_135px]">
      <div className={VIDEO_ITEM}>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={open}
          tabIndex={-1}
          aria-hidden
          className={`group relative block self-start overflow-hidden rounded-xl bg-surface-2 ${VIDEO_THUMB}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- YouTube's own thumbnails, already sized */}
          <img
            src={thumb(video.id, "mqdefault")}
            // hqdefault is 4:3 with bars above and below; cropped to 16:9, the bars fall outside.
            srcSet={`${thumb(video.id, "mqdefault")} 320w, ${thumb(video.id, "hqdefault")} 480w`}
            sizes={sizes}
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
        <div className={`flex ${VIDEO_TEXT}`}>
          <div className="min-w-0 flex-1">
            <a
              data-headline
              lang="bn"
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={open}
              className="line-clamp-3 text-[15px] font-medium leading-[1.5] transition hover:text-accent sm:line-clamp-2 vgrid:line-clamp-2 sm:vlist:text-base"
            >
              <Highlight text={video.title} />
            </a>
            <p className="mt-1 text-xs text-muted">
              <span className="font-semibold text-accent">{channelName}</span>
              {" · "}
              <time dateTime={video.publishedAt} title={fullTime(video.publishedAt, locale)}>
                {timeAgo(video.publishedAt, now, locale)}
              </time>
              {video.views ? ` · ${t.viewCount(compactCount(video.views, locale))}` : ""}
            </p>
          </div>
          <ItemMenu
            saved={saved}
            onToggleSave={() => onToggleSave(video, channelName)}
            onShare={() => onShare(video, channelName)}
            extra={
              onTogglePin && {
                label: pinned ? t.pins.unpin(channelName) : t.pins.pinName(channelName),
                icon: <StarIcon filled={pinned} className={`h-[18px] w-[18px] ${pinned ? "text-gold" : "text-muted"}`} />,
                onSelect: () => onTogglePin(video.channel),
              }
            }
            className="-mr-2"
          />
        </div>
      </div>
      {related && related.length > 0 && (
        <RelatedVideos
          videos={related}
          now={now}
          savedIds={savedIds}
          pinnedIds={pinnedIds}
          onPlay={onPlay}
          onToggleSave={onToggleSave}
          onShare={onShare}
          onTogglePin={onTogglePin}
        />
      )}
    </li>
  );
});

/** Another channel's video of a card's story, with that channel's name in the page's language. */
export type RelatedVideo = { video: Video; channelName: string };

/** A plain click plays the video here; modified clicks open YouTube, as links do. */
function playOnClick(video: Video, onPlay: (video: Video) => void) {
  return (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    onPlay(video);
  };
}

/** Related videos listed before "Show all". */
const PREVIEW = 2;

/**
 * The other videos of a card's story, newest first: a small thumbnail, the title, channel and time,
 * and the ⋮ menu, as on the card. The first few show; the rest are a button away.
 */
function RelatedVideos({
  videos,
  now,
  savedIds,
  pinnedIds,
  onPlay,
  onToggleSave,
  onShare,
  onTogglePin,
}: {
  videos: RelatedVideo[];
  now: number;
  savedIds?: Set<string>;
  pinnedIds?: Set<string>;
  onPlay: (video: Video) => void;
  onToggleSave: (video: Video, channelName: string) => void;
  onShare: (video: Video, channelName: string) => void;
  onTogglePin?: (channelId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const t = useStrings();
  const locale = useLocale();
  const id = useId();
  const shown = expanded ? videos : videos.slice(0, PREVIEW);
  return (
    <div className="mt-3 border-t border-line">
      <p id={`${id}-label`} className="pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
        {t.moreOnStory(formatCount(videos.length, locale))}
      </p>
      <ul id={`${id}-list`} aria-labelledby={`${id}-label`}>
        {shown.map(({ video, channelName }) => {
          const href = watchUrl(video.id);
          const open = playOnClick(video, onPlay);
          const pinned = !!pinnedIds?.has(video.channel);
          return (
            <li key={video.id} className="flex border-b border-line/60 last:border-b-0">
              <div className="flex min-w-0 flex-1 gap-3 py-2">
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={open}
                  tabIndex={-1}
                  aria-hidden
                  className="group relative block w-24 shrink-0 self-start overflow-hidden rounded-md bg-surface-2"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- YouTube's own thumbnails, already sized */}
                  <img
                    // default is 4:3 with bars above and below; cropped to 16:9, the bars fall outside.
                    src={thumb(video.id, "default")}
                    srcSet={`${thumb(video.id, "default")} 120w, ${thumb(video.id, "mqdefault")} 320w`}
                    sizes="96px"
                    width={120}
                    height={68}
                    alt=""
                    loading="lazy"
                    fetchPriority="low"
                    decoding="async"
                    className="aspect-video w-full object-cover transition duration-300 group-hover:scale-[1.04]"
                  />
                </a>
                <div className="min-w-0 flex-1">
                  <a
                    data-headline
                    lang="bn"
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={open}
                    className="line-clamp-2 text-[13px] font-medium leading-[1.45] transition hover:text-accent"
                  >
                    <Highlight text={video.title} />
                  </a>
                  <p className="mt-0.5 text-[11px] text-muted">
                    <span className="font-semibold text-accent">{channelName}</span>
                    {" · "}
                    <time dateTime={video.publishedAt} title={fullTime(video.publishedAt, locale)}>
                      {timeAgo(video.publishedAt, now, locale)}
                    </time>
                  </p>
                </div>
              </div>
              <ItemMenu
                saved={!!savedIds?.has(video.id)}
                onToggleSave={() => onToggleSave(video, channelName)}
                onShare={() => onShare(video, channelName)}
                extra={
                  onTogglePin && {
                    label: pinned ? t.pins.unpin(channelName) : t.pins.pinName(channelName),
                    icon: <StarIcon filled={pinned} className={`h-[18px] w-[18px] ${pinned ? "text-gold" : "text-muted"}`} />,
                    onSelect: () => onTogglePin(video.channel),
                  }
                }
                className="-mr-2 pt-2"
              />
            </li>
          );
        })}
      </ul>
      {videos.length > PREVIEW && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={`${id}-list`}
          className="flex h-9 items-center gap-1 text-xs font-semibold text-accent transition hover:opacity-80"
        >
          {expanded ? t.showLess : t.showAll(formatCount(videos.length, locale))}
          <ChevronIcon className={`h-3.5 w-3.5 transition ${expanded ? "rotate-180" : ""}`} />
        </button>
      )}
    </div>
  );
}

export function PlayGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="ml-0.5 h-5 w-5" fill="currentColor" aria-hidden>
      <path d="M8 5.5v13l10.5-6.5z" />
    </svg>
  );
}

/** The video over the page. Closing it removes the player, which stops the video. */
export function Player({ video, channelName, onClose }: { video: Video; channelName: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const t = useStrings();
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
          aria-label={t.close}
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
