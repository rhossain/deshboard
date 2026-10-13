"use client";

import { memo, useEffect, useId, useLayoutEffect, useRef } from "react";
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
 * `related` are other channels' videos of the same news (see video-stories.ts): one card per story
 * instead of one per channel. The card shows a slim strip for them; opening it (`storyOpen`) lays them all out in a
 * panel the width of the grid, under the card's row (the grid is dense, so the cards after it fill
 * that row), as image searches do: the grid keeps its shape however many there are.
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
  storyOpen = false,
  onToggleStory,
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
  /** Whether the related videos' panel is open (one story at a time, see VideoBoard). */
  storyOpen?: boolean;
  /** Opens or closes the panel of the story led by this video. */
  /** With the story's id (Video.story), which stays the same whichever of its videos leads the card. */
  onToggleStory?: (story: string) => void;
}) {
  const t = useStrings();
  const locale = useLocale();
  const href = watchUrl(video.id);
  const play = playOnClick(video, onPlay);
  const open = storyOpen;
  const card = useRef<HTMLLIElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const story = related && related.length > 0 ? related : null;
  return (
    <>
      {/* Off-screen cards skip layout and paint until they come near. */}
      <li
        ref={card}
        className="[contain-intrinsic-size:auto_92px] [content-visibility:auto] sm:[contain-intrinsic-size:auto_290px] vgrid:[contain-intrinsic-size:auto_290px] vlist:[contain-intrinsic-size:auto_92px] sm:vlist:[contain-intrinsic-size:auto_135px]"
      >
        <div className={VIDEO_ITEM}>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={play}
            tabIndex={-1}
            aria-hidden
            className={`group relative block self-start overflow-hidden rounded-xl bg-surface-2 ring-offset-2 ring-offset-background transition-shadow ${open ? "ring-2 ring-accent" : ""} ${VIDEO_THUMB}`}
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
                onClick={play}
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
        {story && (
          <StoryToggle ref={toggle} videos={story} open={open} controls={panelId} onToggle={() => onToggleStory?.(video.story ?? video.id)} />
        )}
      </li>
      {story && (
        <StoryPanel
          id={panelId}
          open={open}
          card={card}
          lead={video}
          leadChannelName={channelName}
          videos={story}
          now={now}
          savedIds={savedIds}
          pinnedIds={pinnedIds}
          onClose={() => {
            onToggleStory?.(video.story ?? video.id);
            toggle.current?.focus();
          }}
          onPlay={onPlay}
          onToggleSave={onToggleSave}
          onShare={onShare}
          onTogglePin={onTogglePin}
        />
      )}
    </>
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

/** Thumbnails stacked in a card's story strip. */
const STACK = 3;
/** Channels named in the strip; the rest are counted. */
const NAMED = 2;

/** The channels of `videos`, each once, in their order. */
const channelsOf = (videos: RelatedVideo[]) => [...new Set(videos.map((r) => r.channelName))];

/**
 * The strip under a card with related videos: a few of their thumbnails fanned out, how many there
 * are and from which channels. Opens and closes the card's StoryPanel.
 */
function StoryToggle({
  ref,
  videos,
  open,
  controls,
  onToggle,
}: {
  ref: React.Ref<HTMLButtonElement>;
  videos: RelatedVideo[];
  open: boolean;
  controls: string;
  onToggle: () => void;
}) {
  const t = useStrings();
  const locale = useLocale();
  const channels = channelsOf(videos);
  const rest = channels.length - NAMED;
  return (
    <button
      ref={ref}
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={controls}
      className="group/story mt-3 flex w-full items-center gap-3 rounded-xl border border-line bg-surface py-2 pl-2 pr-3 text-left transition hover:border-accent/40 hover:shadow-card active:scale-[0.99] aria-expanded:border-accent/50 aria-expanded:bg-accent-soft"
    >
      <span className="flex shrink-0" aria-hidden>
        {videos.slice(0, STACK).map(({ video }, i) => (
          // eslint-disable-next-line @next/next/no-img-element -- YouTube's own thumbnails, already sized
          <img
            key={video.id}
            src={thumb(video.id, "default")}
            width={120}
            height={68}
            alt=""
            loading="lazy"
            fetchPriority="low"
            decoding="async"
            style={{ zIndex: STACK - i }}
            className={`aspect-video w-12 rounded-md bg-surface-2 object-cover shadow-sm ring-2 ring-surface transition-transform duration-300 group-aria-expanded/story:ring-accent-soft ${i ? "-ml-7 group-hover/story:-ml-5" : ""}`}
          />
        ))}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold leading-tight">
          {t.moreOnStory(formatCount(videos.length, locale))}
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-muted">
          {channels.slice(0, NAMED).join(", ")}
          {rest > 0 && ` +${formatCount(rest, locale)}`}
        </span>
      </span>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted transition group-hover/story:text-accent group-aria-expanded/story:bg-accent group-aria-expanded/story:text-accent-ink">
        <ChevronIcon className="h-4 w-4 transition-transform duration-300 group-aria-expanded/story:rotate-180" />
      </span>
    </button>
  );
}

/**
 * A story's other videos, laid out across the grid under the card's row, newest first: a thumbnail,
 * the title, channel and time, and the ⋮ menu each. A notch points up at the card. Always in the
 * page (hidden and inert when closed), so the prerendered page links to every video; Escape or the
 * close button closes it and returns to the card.
 */
function StoryPanel({
  id,
  open,
  card,
  lead,
  leadChannelName,
  videos,
  now,
  savedIds,
  pinnedIds,
  onClose,
  onPlay,
  onToggleSave,
  onShare,
  onTogglePin,
}: {
  id: string;
  open: boolean;
  card: React.RefObject<HTMLLIElement | null>;
  lead: Video;
  leadChannelName: string;
  videos: RelatedVideo[];
  now: number;
  savedIds?: Set<string>;
  pinnedIds?: Set<string>;
  onClose: () => void;
  onPlay: (video: Video) => void;
  onToggleSave: (video: Video, channelName: string) => void;
  onShare: (video: Video, channelName: string) => void;
  onTogglePin?: (channelId: string) => void;
}) {
  const t = useStrings();
  const locale = useLocale();
  const panel = useRef<HTMLLIElement>(null);
  const notch = useRef<HTMLSpanElement>(null);
  const channels = new Set([leadChannelName, ...channelsOf(videos)]).size;

  // On opening, the notch goes under the card (and again as the grid reflows), and the panel scrolls
  // into view if it opened below the screen.
  useLayoutEffect(() => {
    const el = panel.current;
    if (!open || !el) return;
    const place = () => {
      const c = card.current?.getBoundingClientRect();
      const p = el.getBoundingClientRect();
      const mark = notch.current;
      if (!c || !mark) return;
      // A card as wide as the panel (one column) needs no pointer.
      mark.hidden = c.width > p.width * 0.6;
      mark.style.left = `${c.left - p.left + c.width / 2}px`;
    };
    place();
    el.scrollIntoView({ block: "nearest" });
    const observer = new ResizeObserver(place);
    observer.observe(el);
    return () => observer.disconnect();
  }, [open, card]);

  return (
    <li
      ref={panel}
      id={id}
      hidden={!open}
      inert={!open}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
      className="story-panel col-span-full -mt-1 sm:mt-0"
    >
      <section
        aria-labelledby={`${id}-title`}
        className="relative rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5"
      >
        <span
          ref={notch}
          aria-hidden
          className="absolute -top-[7px] h-3 w-3 -translate-x-1/2 rotate-45 rounded-tl-[3px] border-l border-t border-line bg-surface"
        />
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gold">{t.story.label}</p>
            <p id={`${id}-title`} className="mt-1 font-display text-lg leading-snug">
              {t.story.summary(formatCount(videos.length + 1, locale), formatCount(channels, locale))}
            </p>
            <p lang="bn" className="mt-0.5 line-clamp-1 text-xs text-muted">
              {lead.title}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.story.close}
            title={t.story.close}
            className="-mr-1.5 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-surface-2 hover:text-foreground"
          >
            <CloseIcon className="h-[18px] w-[18px]" />
          </button>
        </div>
        <ul className="-mx-2 mt-3 grid gap-x-4 gap-y-1 border-t border-line pt-3 sm:grid-cols-2 xl:grid-cols-3 vlist:xl:grid-cols-2">
          {videos.map(({ video, channelName }) => {
            const href = watchUrl(video.id);
            const play = playOnClick(video, onPlay);
            const pinned = !!pinnedIds?.has(video.channel);
            return (
              <li key={video.id} className="group/row flex rounded-xl transition-colors hover:bg-surface-2">
                <div className="flex min-w-0 flex-1 gap-3 p-2">
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={play}
                    tabIndex={-1}
                    aria-hidden
                    className="group relative block w-28 shrink-0 self-start overflow-hidden rounded-lg bg-surface-2"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- YouTube's own thumbnails, already sized */}
                    <img
                      // default is 4:3 with bars above and below; cropped to 16:9, the bars fall outside.
                      src={thumb(video.id, "default")}
                      srcSet={`${thumb(video.id, "default")} 120w, ${thumb(video.id, "mqdefault")} 320w`}
                      sizes="112px"
                      width={120}
                      height={68}
                      alt=""
                      loading="lazy"
                      fetchPriority="low"
                      decoding="async"
                      className="aspect-video w-full object-cover transition duration-300 group-hover:scale-[1.04]"
                    />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/25 opacity-0 transition group-hover:opacity-100">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/65 text-white">
                        <PlayGlyph className="ml-0.5 h-4 w-4" />
                      </span>
                    </span>
                  </a>
                  <div className="min-w-0 flex-1">
                    <a
                      data-headline
                      lang="bn"
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={play}
                      className="line-clamp-2 text-[13px] font-medium leading-[1.45] transition hover:text-accent"
                    >
                      <Highlight text={video.title} />
                    </a>
                    <p className="mt-1 text-[11px] text-muted">
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
                  className="pt-2"
                />
              </li>
            );
          })}
        </ul>
      </section>
    </li>
  );
}

export function PlayGlyph({ className = "ml-0.5 h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
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
