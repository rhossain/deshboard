"use client";

import { useEffect, useState } from "react";
import {
  addressProblem,
  FLAT_PROBLEM,
  FLAT_SIDE,
  looksFlat,
  MIN_SIDE,
  pictureCandidates,
  shapeProblem,
  trimBars,
} from "@/lib/card-picture-rules";
import { MIN_PICTURE } from "@/lib/post-checks";
import type { Card } from "./api";

/**
 * A look at a card's picture before the post is queued, from the browser. A single post's picture is read from its
 * share page as it is (at least MIN_PICTURE, else Facebook shows none): its size and shape decide how Facebook shows
 * it. A carousel card's is remade by the deploy (src/lib/card-pictures.ts), which leaves the card out of the carousel
 * when it can't: so it is judged here as the deploy judges it (checkCardPicture: the same larger copies tried, the
 * same bars trimmed, the same size and logo checks, card-picture-rules.ts), on the same bytes (/api/admin/picture).
 */
export interface PictureVerdict {
  /** ok: fine; warn: will show, but not at its best; bad: a carousel card left out when it goes out, or a post showing no picture. */
  level: "ok" | "warn" | "bad";
  note?: string;
  width?: number;
  height?: number;
}

/** A carousel card needs this many pixels each way (card-picture-rules.ts, shared with the deploy). */
export const CARD_MIN_SIDE = MIN_SIDE;
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

/** What the deploy would make of a card's picture: its size once made, or why it can't be a card. */
export type CardCheck = { width: number; height: number; problem?: undefined } | { problem: string };

const cardChecks = new Map<string, Promise<CardCheck | null>>();

/**
 * Whether the deploy can make a carousel card of this picture (card-pictures.ts prepareCardPicture, step for step):
 * its candidates, best first, until one makes a card; else the given address's own problem. Null when it can't be
 * told from here (the admin's picture fetch doesn't answer): then only its size as the browser loads it is known.
 */
export function checkCardPicture(url: string): Promise<CardCheck | null> {
  let p = cardChecks.get(url);
  if (!p) {
    p = (async () => {
      let first: string | null = null;
      for (const candidate of pictureCandidates(url)) {
        const got = await judgeCandidate(candidate);
        if (!got) return null;
        if (got.problem === undefined) return got;
        if (candidate === url) first = got.problem;
      }
      return { problem: first ?? "isn't usable" };
    })().catch(() => null);
    cardChecks.set(url, p);
  }
  return p;
}

/** One address, as the deploy's cardPictureFrom judges it. Null: the admin's picture fetch didn't answer. */
async function judgeCandidate(url: string): Promise<CardCheck | null> {
  const named = addressProblem(url);
  if (named) return { problem: named };
  let res: Response;
  try {
    res = await fetch(`/api/admin/picture?url=${encodeURIComponent(url)}`, { credentials: "same-origin" });
  } catch {
    return null;
  }
  if (res.redirected) return null;
  if (res.headers.get("content-type")?.includes("json")) {
    const body = (await res.json().catch(() => ({}))) as { problem?: string };
    return (res.status === 502 || res.status === 400) && body.problem ? { problem: body.problem } : null;
  }
  if (!res.ok) return null;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(await res.blob());
  } catch {
    return { problem: "can't be read (not a picture the browser can open)" };
  }
  const { width, height } = bitmap;
  if (width * height > 80_000_000) return { problem: `can't be read (${width}×${height} is too many pixels)` };
  // Upright (createImageBitmap follows the EXIF turn), on white where transparent, as the deploy makes it.
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const box = trimBars(ctx.getImageData(0, 0, width, height).data, width, height, 4) ?? { left: 0, top: 0, width, height };
  const shape = shapeProblem(box.width, box.height);
  if (shape) return { problem: shape };
  const small = new OffscreenCanvas(FLAT_SIDE, FLAT_SIDE);
  const sctx = small.getContext("2d", { willReadFrequently: true })!;
  sctx.imageSmoothingQuality = "high";
  sctx.drawImage(canvas, box.left, box.top, box.width, box.height, 0, 0, FLAT_SIDE, FLAT_SIDE);
  if (looksFlat(sctx.getImageData(0, 0, FLAT_SIDE, FLAT_SIDE).data, FLAT_SIDE, FLAT_SIDE, 4)) return { problem: FLAT_PROBLEM };
  return { width: box.width, height: box.height };
}

/** The note for a picture the deploy can't make a card of: the card is left out of the carousel. */
export const cardProblemNote = (problem: string) => `Can't be a card: the picture ${problem}. It would be left out of the carousel`;

export async function checkPicture(url: string | undefined, carousel: boolean): Promise<PictureVerdict> {
  if (!url) {
    return carousel
      ? { level: "bad", note: "No picture: a carousel card needs one, so the post can't be queued with it" }
      : { level: "bad", note: "No picture: Facebook shows Bartaboard's plain fallback card for this link, not the story's" };
  }
  if (carousel) {
    const card = await checkCardPicture(url);
    if (card?.problem !== undefined) return { level: "bad", note: cardProblemNote(card.problem) };
    if (card) {
      const { width, height } = card;
      if (Math.min(width, height) < 600) return { level: "warn", note: `Small (${width}×${height}): the card may look soft; 600 pixels or more each way is best`, width, height };
      return { level: "ok", width, height };
    }
    // Not to be told from here: judged by its size as the browser loads it, below.
  }
  const yt = /^https:\/\/i\.ytimg\.com\/vi\/([^/]+)\//.exec(url);
  if (yt && !carousel) {
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
    return { level: "bad", note: cardProblemNote(`is only ${px} (a card needs ${CARD_MIN_SIDE} pixels each way)`), width, height };
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
