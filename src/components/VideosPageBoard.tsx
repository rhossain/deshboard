"use client";

import type { ComponentProps } from "react";
import { NewsBoardFromUrl } from "./NewsBoard";
import VideoBoard from "./VideoBoard";

/**
 * The board for the Videos pages, with the Videos view in their first download, so it prerenders with
 * the newest videos in place (a lazy one would prerender as its skeleton, see NewsBoard).
 */
export function VideosPageBoard(props: Omit<ComponentProps<typeof NewsBoardFromUrl>, "videoBoard">) {
  return <NewsBoardFromUrl {...props} videoBoard={VideoBoard} />;
}
