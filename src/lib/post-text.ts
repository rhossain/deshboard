/**
 * A post's text from its cards, for the admin's page and its edge functions alike (neither loads the picking code):
 * a carousel's heading for the Dhaka hour it goes out and its cards numbered, or one item's title and its outlet or
 * channel. page-posts.ts and page-video-posts.ts word the picker's posts the same way (scripts/test-social-store.ts
 * checks the headings agree).
 */
import type { Card } from "./social-store";

const BN = "০১২৩৪৫৬৭৮৯";

/** 5 → "৫". */
export const bnDigits = (n: number) => String(n).replace(/\d/g, (d) => BN[+d]);

/** "সকালের", "দুপুরের", "বিকেলের" or "রাতের", by the Dhaka hour of `at`. */
export function partOfDay(at: number): string {
  const hour = new Date(at + 6 * 3600_000).getUTCHours();
  return hour < 11 ? "সকালের" : hour < 15 ? "দুপুরের" : hour < 18 ? "বিকেলের" : "রাতের";
}

/** "রাতের শীর্ষ ৫ খবর": a headlines carousel's heading. */
export const headlinesHeading = (at: number, cards: number) => `${partOfDay(at)} শীর্ষ ${bnDigits(cards)} খবর`;

/** "রাতের শীর্ষ ৫ ভিডিও খবর": a video roundup's heading. */
export const roundupHeading = (at: number, cards: number) => `${partOfDay(at)} শীর্ষ ${bnDigits(cards)} ভিডিও খবর`;

/** A carousel's text for these cards: its heading for the time it goes out, and the cards numbered. */
export function carouselMessage(content: string, cards: Card[], at: number): string {
  const heading = content === "roundup" ? roundupHeading(at, cards.length) : headlinesHeading(at, cards.length);
  return `${heading}\n\n${cards.map((c, i) => `${bnDigits(i + 1)}. ${c.title} — ${c.source}`).join("\n")}`;
}

/** A single post's text for this item: its title, then its outlet or channel. */
export const singleMessage = (c: Card) => `${c.title}\n\n${c.source}`;
