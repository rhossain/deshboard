"use client";

import Link from "next/link";
import { useState } from "react";
import type { Video } from "@/lib/types";
import { compactCount, fullTime, timeAgo } from "./time";
import { ArrowUpRightIcon } from "./ui";
import { PlayGlyph } from "./VideoCard";
import { thumb, watchUrl } from "./youtube";

/** A video shared from Deshboard (`/s/youtu.be/<id>`): plays in place, with a way to YouTube and to the board's videos. */
export function SharedVideo({ video, channelName, now }: { video: Video; channelName: string; now: number }) {
  const [playing, setPlaying] = useState(false);

  return (
    <>
      <article className="overflow-hidden rounded-3xl border border-line bg-surface shadow-card">
        {playing ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&playsinline=1&rel=0`}
            title={video.title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            className="block aspect-video w-full bg-black"
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label={`Play: ${video.title}`}
            className="group relative block w-full bg-surface-2"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- YouTube's own thumbnail */}
            <img
              src={thumb(video.id, "hqdefault")}
              width={480}
              height={360}
              alt=""
              fetchPriority="high"
              className="aspect-video w-full object-cover"
            />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/65 text-white transition group-hover:scale-105 group-hover:bg-black/80 [&_svg]:h-7 [&_svg]:w-7">
                <PlayGlyph />
              </span>
            </span>
          </button>
        )}
        <div className="p-5 sm:p-7">
          <p className="flex flex-wrap gap-x-2 text-xs text-muted">
            <span className="font-semibold text-accent">{channelName}</span>
            <span>·</span>
            <time dateTime={video.publishedAt} title={fullTime(video.publishedAt)}>
              {timeAgo(video.publishedAt, now)}
            </time>
            {video.views ? <span>· {compactCount(video.views)} views</span> : null}
          </p>
          <h1 lang="bn" className="mt-3 text-[24px] font-semibold leading-[1.45] tracking-tight sm:text-[28px]">
            {video.title}
          </h1>
          <a
            href={watchUrl(video.id)}
            rel="noopener"
            className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent px-6 text-[15px] font-semibold text-accent-ink shadow-card transition active:scale-[0.98] sm:w-auto sm:inline-flex"
          >
            Watch on YouTube
            <ArrowUpRightIcon className="h-4 w-4" />
          </a>
        </div>
      </article>
      <p className="mt-6 px-1 text-center text-sm">
        <Link href="/?view=videos" className="font-semibold text-accent hover:underline">
          More videos from Bangladeshi TV news channels
        </Link>
      </p>
    </>
  );
}
