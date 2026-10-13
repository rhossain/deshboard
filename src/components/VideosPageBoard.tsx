"use client";

import type { ComponentProps } from "react";
import { NewsBoard } from "./NewsBoard";
import VideoBoard from "./VideoBoard";

/**
 * The board for the Videos pages, with the Videos view in their first download, so it renders with
 * the newest videos in place (a lazy one would render as its skeleton, see NewsBoard).
 */
export function VideosPageBoard(props: Omit<ComponentProps<typeof NewsBoard>, "videoBoard">) {
  return <NewsBoard {...props} videoBoard={VideoBoard} />;
}
