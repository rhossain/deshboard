"use client";

import { useEffect, useState } from "react";
import { MIN_PICTURE } from "@/lib/post-checks";
import type { Card } from "./api";

/**
 * A look at a card's picture before the post is queued, from the browser: whether it loads, and its size and shape,
 * which is what decides how Facebook shows it. A single post's picture is read from its share page as it is (at
 * least MIN_PICTURE, else Facebook shows none); a carousel card's is redrawn by the deploy (src/lib/card-pictures.ts),
 * which needs CARD_MIN_SIDE pixels each way and stops the post otherwise. The deploy checks again before posting; this
 * is the early warning.
 */
export interface PictureVerdict {
  /** ok: fine; warn: will show, but not at its best; bad: will stop the post, or show nothing. */
  level: "ok" | "warn" | "bad";
  note?: string;
  width?: number;
  height?: number;
}

/** A carousel card needs this many pixels each way: src/lib/card-pictures.ts MIN_SIDE, repeated here since that file loads sharp (scripts/test-social-store.ts checks they agree). */
export const CARD_MIN_SIDE = 400;
/** A wide link card from this size; 1200×630 is Facebook's recommendation. */
const GOOD = { width: 600, height: 315 };
const LOAD_MS = 12_000;

const sizes = new Map<string, Promise<{ width: number; height: number } | null>>();

/** The picture's size, loaded as the browser would (no pixels read, so cross-origin is fine); null when it doesn't load. */
function measure(url: string): Promise<{ width: number; height: number } | null> {
  let p = sizes.get(url);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.referrerPolicy = "no-referrer";
      const timer = setTimeout(() => resolve(null), LOAD_MS);
      img.onload = () => {
        clearTimeout(timer);
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = () => {
        clearTimeout(timer);
        resolve(null);
      };
      img.src = url;
    });
    sizes.set(url, p);
  }
  return p;
}

export async function checkPicture(url: string | undefined, carousel: boolean): Promise<PictureVerdict> {
  if (!url) {
    return carousel
      ? { level: "bad", note: "No picture: a carousel card needs one, so the post can't be queued with it" }
      : { level: "bad", note: "No picture: Facebook shows Bartaboard's plain fallback card for this link, not the story's" };
  }
  const yt = /^https:\/\/i\.ytimg\.com\/vi\/([^/]+)\//.exec(url);
  if (yt) {
    // A video's thumbnail: the deploy and the share page both take YouTube's largest (maxresdefault, then sddefault),
    // so the card is judged by that, not by the 480×360 the admin shows. A missing size is a 120×90 placeholder.
    for (const name of ["maxresdefault", "sddefault"]) {
      const best = await measure(`https://i.ytimg.com/vi/${yt[1]}/${name}.jpg`);
      if (best && best.width >= 640) return { level: "ok", ...best };
    }
    const size = await measure(url);
    if (!size || size.width < 200) return { level: "bad", note: "YouTube has no thumbnail for this video: it would show without a picture" };
    return { level: "ok", ...size };
  }
  const size = await measure(url);
  if (!size) return { level: "bad", note: "The picture doesn't load from here: open it to check, or pick another" };
  const { width, height } = size;
  const px = `${width}×${height}`;
  if (carousel && (width < CARD_MIN_SIDE || height < CARD_MIN_SIDE))
    return { level: "bad", note: `Too small for a card (${px}): the deploy needs ${CARD_MIN_SIDE} pixels each way, and would stop the post`, width, height };
  if (!carousel && (width < MIN_PICTURE.width || height < MIN_PICTURE.height || width < 200 || height < 200))
    return { level: "bad", note: `Too small (${px}): Facebook shows no picture under 200×200`, width, height };
  if (width < GOOD.width || height < GOOD.height)
    return { level: "warn", note: `Small (${px}): it may look soft${carousel ? "" : ", or show as a small square beside the text"}; 600×315 or more is best`, width, height };
  const ratio = width / height;
  if (ratio < 1) return { level: "warn", note: `Taller than wide (${px}): Facebook crops it to a wide card; check the top of it is the picture's subject`, width, height };
  if (ratio > 2.6) return { level: "warn", note: `A very wide strip (${px}): the sides get cropped`, width, height };
  return { level: "ok", width, height };
}

/** Each card's verdict by its link (empty until checked; pass no cards for Instagram, whose cards are drawn). */
export function usePictureChecks(cards: Card[], carousel: boolean): Map<string, PictureVerdict> {
  const [checks, setChecks] = useState<Map<string, PictureVerdict>>(new Map());
  const key = `${carousel}\n${cards.map((c) => `${c.link}|${c.picture ?? ""}`).join("\n")}`;
  useEffect(() => {
    let off = false;
    if (!cards.length) return;
    Promise.all(cards.map(async (c) => [c.link, await checkPicture(c.picture, carousel)] as const)).then((pairs) => {
      if (!off) setChecks(new Map(pairs));
    });
    return () => {
      off = true;
    };
    // The cards' links and pictures are the dependency, as `key` spells them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return checks;
}

/** "2 pictures need a look", or null when all are fine (or unchecked). */
export function picturesSummary(checks: Map<string, PictureVerdict>): { bad: number; warn: number; text: string | null } {
  let bad = 0;
  let warn = 0;
  for (const v of checks.values()) {
    if (v.level === "bad") bad++;
    else if (v.level === "warn") warn++;
  }
  const n = bad + warn;
  if (!n) return { bad, warn, text: null };
  return { bad, warn, text: n === 1 ? "One picture needs a look" : `${n} pictures need a look` };
}
