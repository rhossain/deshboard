"use client";

import { useState } from "react";
import { preconnect } from "react-dom";
import type { NewsItem, NewsSource, Video } from "@/lib/types";
import { ItemTime } from "./ItemTime";
import type { SavedEntry, SavedVideo } from "./saved";
import { formatCount, timeAgo } from "./time";
import { BookmarkIcon, ItemMenu } from "./ui";
import { Player, VideoCard } from "./VideoCard";

/** Headlines and videos the reader saved on this device, most recently saved first. */
export function SavedList({
  entries,
  videos,
  total,
  sourceById,
  now,
  onToggleSave,
  onShare,
  onToggleSaveVideo,
  onShareVideo,
}: {
  /** Saved headlines matching the current filters. */
  entries: SavedEntry[];
  /** Saved videos matching the current filters. */
  videos: SavedVideo[];
  /** All saved headlines and videos, to tell "nothing saved" from "nothing matches". */
  total: number;
  sourceById: Map<string, NewsSource>;
  now: number;
  onToggleSave: (item: NewsItem) => void;
  onShare: (item: NewsItem) => void;
  onToggleSaveVideo: (video: Video, channelName: string) => void;
  onShareVideo: (video: Video, channelName: string) => void;
}) {
  const [playing, setPlaying] = useState<SavedVideo | null>(null);
  const matching = entries.length + videos.length;
  // Headings only when there are both kinds to tell apart.
  const both = entries.length > 0 && videos.length > 0;

  if (!total) {
    return (
      <div className="rounded-2xl border border-dashed border-line px-6 py-14 text-center">
        <BookmarkIcon className="mx-auto h-7 w-7 text-muted" />
        <p className="mt-3 font-display text-xl">Nothing saved yet</p>
        <p className="mx-auto mt-1 max-w-xs text-sm text-muted">
          Choose Save for later in the ⋮ menu beside any headline or video to keep it here. Saved items stay on this
          device.
        </p>
      </div>
    );
  }

  return (
    <section>
      <p className="mb-4 px-1 text-[13px] text-muted">
        {formatCount(total)} saved on this device{matching < total && `, ${matching} match the filters`}.
      </p>
      {both && <h2 className="mb-3 px-1 font-display text-lg">Headlines</h2>}
      {entries.length > 0 && (
        <ol className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
          {entries.map(({ item: it, savedAt }) => (
            <li key={it.link} className="flex border-b border-line last:border-b-0">
              <a
                data-headline
                lang={it.lang}
                href={it.link}
                target="_blank"
                rel="noopener noreferrer"
                className="group min-w-0 flex-1 py-3.5 pl-4 transition visited:text-muted active:bg-surface-2 hover:bg-surface-2/60 sm:pl-5"
              >
                <div className="mb-1 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                  <span className="font-semibold text-accent">
                    {sourceById.get(it.sourceId)?.name ?? it.sourceName}
                  </span>
                  <ItemTime item={it} now={now} />
                  <span>· saved {timeAgo(savedAt, now)}</span>
                </div>
                <p className="text-[16px] font-medium leading-[1.55] group-hover:text-accent">{it.title}</p>
              </a>
              <ItemMenu saved onToggleSave={() => onToggleSave(it)} onShare={() => onShare(it)} className="pt-4" />
            </li>
          ))}
        </ol>
      )}
      {both && <h2 className="mb-3 mt-8 px-1 font-display text-lg">Videos</h2>}
      {videos.length > 0 && (
        <ul className="grid gap-x-4 gap-y-4 sm:grid-cols-2 sm:gap-y-7 lg:grid-cols-3 xl:grid-cols-4">
          {videos.map((e) => (
            <VideoCard
              key={e.video.id}
              video={e.video}
              channelName={e.channelName}
              now={now}
              eager={false}
              saved
              onPlay={() => {
                preconnect("https://www.youtube-nocookie.com");
                setPlaying(e);
              }}
              onToggleSave={onToggleSaveVideo}
              onShare={onShareVideo}
            />
          ))}
        </ul>
      )}
      {playing && (
        <Player
          key={playing.video.id}
          video={playing.video}
          channelName={playing.channelName}
          onClose={() => setPlaying(null)}
        />
      )}
    </section>
  );
}
