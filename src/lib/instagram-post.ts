/**
 * What an Instagram post is (docs/instagram.md), shared by the deploy (scripts/post-instagram.ts), the admin and
 * Telegram: no Node or Workers-only APIs here.
 *
 * Instagram shows no link previews and its captions' links can't be tapped, so a post is pictures: a carousel of
 * headlines (a cover, then a card each) or one headline's card, drawn by src/lib/instagram-cards.ts and served at
 * bartaboard.com/ig/<key>.jpg. The caption lists the headlines and sends readers to the link in the profile's bio.
 * Only headlines go to Instagram: the board's videos are the channels' own, on YouTube, which Instagram can't link.
 */
import { CATEGORIES } from "./categories";
import { bnDigits as bn, headlinesHeading } from "./post-text";
import { SLOTS, type Slot } from "./slot-table";
import type { Card, SocialPost } from "./social-store";

/** Instagram takes 2 to 10 pictures in a carousel: the cover and up to nine headlines. */
export const IG_MAX_HEADLINES = 9;
export const IG_CAPTION_MAX = 2200;

/** By default Instagram posts at the Page's headline times (not its video ones). */
export const IG_DEFAULT_TIMES = SLOTS.filter((s) => s.content === "headlines").map((s) => s.time);

/** The Instagram slot table: each time a carousel of headlines. */
export const instagramSlots = (times: string[] | null | undefined): Slot[] =>
  (times?.length ? times : IG_DEFAULT_TIMES).map((time) => ({ time, content: "headlines" }));

const HASHTAGS = "#বাংলাদেশ #খবর #সংবাদ #শিরোনাম #Bangladesh #BangladeshNews #BanglaNews #Bartaboard";
const FOOTER = "সব সংবাদমাধ্যমের খবর এক জায়গায়: bartaboard.com (লিংক বায়োতে)";

/** "রাতের শীর্ষ ৫ খবর", by the Dhaka hour of `at` (post-text.ts; page-posts.ts words the picker's posts the same way). */
export { headlinesHeading };

/** The caption: a carousel's heading and numbered headlines, or one headline and its outlet; then the site and tags. */
export function instagramCaption(cards: Card[], at: number): string {
  const body =
    cards.length > 1
      ? `${headlinesHeading(at, cards.length)}\n\n${cards.map((c, i) => `${bn(i + 1)}. ${c.title} — ${c.source}`).join("\n")}`
      : cards[0]
        ? `${cards[0].title}\n\n${cards[0].source}`
        : "";
  const tail = `\n\n${FOOTER}\n\n${HASHTAGS}`;
  return body.length + tail.length > IG_CAPTION_MAX ? `${body.slice(0, IG_CAPTION_MAX - tail.length - 1)}…${tail}` : `${body}${tail}`;
}

/** A card as drawn on a picture (src/lib/instagram-cards.ts). */
export interface SlideCard {
  title: string;
  /** The outlet, as the post names it (Bangla). */
  source: string;
  /** The section's Bangla name ("রাজনীতি"). */
  section?: string;
  /** How many outlets carry the story. */
  outlets?: number;
}

export interface SlideSet {
  /** "সকালের শীর্ষ ৫ খবর": a carousel's cover. */
  heading: string;
  /** When the post goes out (ms): the day on the cards. */
  at: number;
  cards: SlideCard[];
}

const SECTION_BN = new Map<string, string>(CATEGORIES.filter((c) => c.id !== "other").map((c) => [c.id, c.bn]));

/** What a post's pictures show. */
export function slideSetOf(post: Pick<SocialPost, "cards" | "scheduledAt">): SlideSet {
  const at = Date.parse(post.scheduledAt);
  const cards = post.cards.slice(0, IG_MAX_HEADLINES);
  return {
    heading: headlinesHeading(at, cards.length),
    at,
    cards: cards.map((c) => ({
      title: c.title,
      source: c.source,
      ...(c.section && SECTION_BN.has(c.section) && { section: SECTION_BN.get(c.section) }),
      ...(c.outlets && { outlets: c.outlets }),
    })),
  };
}

/** A picture's address: Instagram fetches it from there when the post is made (functions/ig). */
export const imageUrl = (site: string, key: string) => `${site.replace(/\/+$/, "")}/ig/${key}.jpg`;

/** The post's pictures, as last drawn (params.images): empty until a run has drawn them for its cards as they are. */
export function postImages(post: Pick<SocialPost, "params">): string[] {
  try {
    const list = JSON.parse(post.params.images ?? "[]") as unknown;
    return Array.isArray(list) ? list.filter((u): u is string => typeof u === "string") : [];
  } catch {
    return [];
  }
}
