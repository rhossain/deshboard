"use client";

import { useEffect, useState } from "react";
import type { Card } from "./api";

/**
 * Whether a card's link still leads to its headline or video (/api/admin/link: the outlet's article answers, the video
 * still plays), so a post whose story was taken down can be fixed before it goes out, or taken down after. Only a
 * clear "gone" is `dead`; an outlet that didn't answer says nothing.
 */
export interface LinkVerdict {
  dead: boolean;
  problem?: string;
  target?: string;
}

/** A verdict is used this long before the link is asked about again. */
const TTL_MS = 10 * 60_000;
/** Links asked about at once: a queue can hold a hundred cards. */
const AT_ONCE = 4;

const known = new Map<string, { at: number; verdict: Promise<LinkVerdict> }>();
let running = 0;
const waiting: (() => void)[] = [];

async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= AT_ONCE) await new Promise<void>((go) => waiting.push(go));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

/** The link's verdict, asked once in TTL_MS; one that couldn't be asked (signed out, offline) isn't kept. */
export function checkLink(link: string, fresh = false): Promise<LinkVerdict> {
  const had = known.get(link);
  if (had && !fresh && Date.now() - had.at < TTL_MS) return had.verdict;
  const verdict = slot(async () => {
    const res = await fetch(`/api/admin/link?url=${encodeURIComponent(link)}`, { credentials: "same-origin", cache: "no-store" });
    if (res.redirected || !res.headers.get("content-type")?.includes("json")) throw new Error("signed out");
    return (await res.json()) as LinkVerdict;
  });
  known.set(link, { at: Date.now(), verdict });
  verdict.catch(() => known.get(link)?.verdict === verdict && known.delete(link));
  return verdict.catch(() => ({ dead: false, problem: "couldn't be checked" }));
}

/** Each card's link verdict, by its link, as they arrive (none while `on` is false). */
export function useLinkChecks(cards: Card[], on = true): Map<string, LinkVerdict> {
  const [checks, setChecks] = useState<Map<string, LinkVerdict>>(new Map());
  const key = on ? cards.map((c) => c.link).join("\n") : "";
  useEffect(() => {
    if (!key) return;
    let off = false;
    for (const link of new Set(key.split("\n")))
      void checkLink(link).then((v) => !off && setChecks((m) => (m.get(link) === v ? m : new Map(m).set(link, v))));
    return () => {
      off = true;
    };
  }, [key]);
  return checks;
}

/** The cards whose link is dead, with their place in the post. */
export function deadCards(cards: Card[], checks: Map<string, LinkVerdict>): { pos: number; card: Card; problem: string }[] {
  return cards.flatMap((card, pos) => {
    const v = checks.get(card.link);
    return v?.dead ? [{ pos, card, problem: v.problem ?? "the link is dead" }] : [];
  });
}
