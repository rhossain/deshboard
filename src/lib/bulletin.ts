/**
 * Video bulletins (docs/bulletin.md): when they go out, how a bulletin's stories are described, and the spec the
 * renderer (scripts/render-bulletin.mjs) draws. Standalone and pure, so the queue's scripts, the admin's pages and the
 * edge functions can all read it. A bulletin is made for a time of the day's table (BULLETIN_TIMES, or the
 * `bulletinTimes` setting) or by hand for any time at all; nothing here cares which.
 */
import { sourceName } from "./bn-names";
import { BULLETIN_TIMES } from "./bulletin-defaults";
import { CATEGORIES, type Category } from "./categories";
import { type PostChoice, storySection } from "./page-posts";

export { BULLETIN_LEAD_MINUTES, BULLETIN_LOCK_MINUTES, BULLETIN_STORIES, BULLETIN_TIMES } from "./bulletin-defaults";

/** What the renderer takes (its headline list has room for six). */
export const MAX_STORIES = 6;
/** Other outlets' reports kept with a story, for when the credited article can't be read. */
export const OTHER_REPORTS = 4;
/** About 25 seconds of speech: longer and a story stops being a bulletin item. */
export const MAX_SCRIPT_CHARS = 360;

/** A story's graphic, as the renderer draws it (docs/bulletin.md, "Graphics"). */
export type BulletinVisual =
  | { type: "number"; label: string; value: number | string; unit: string; chips?: string[] }
  | { type: "quote"; text: string; by: string; chips?: string[] }
  | {
      type: "versus";
      title: string;
      a: { name: string; code: string; color?: string };
      b: { name: string; code: string; color?: string };
      facts?: { k: string; v: string }[];
    }
  | { type: "points"; title?: string; items: string[] };

/** One story of a bulletin, as stored and as the admin edits it. */
export interface BulletinStory {
  /** The board story's id (its first headline's link), so the picking rules know it again. */
  key: string;
  /** The headline credited: its article is what the script is written from. */
  link: string;
  section: Category;
  headline: string;
  /** The line in the headline list and the ticker. */
  short: string;
  /** The outlet credited, in Bangla, and its id. */
  source: string;
  sourceId: string;
  /** Other outlets carrying the story. */
  more: number;
  /**
   * A few of those outlets' own reports of it: when the credited article can't be read (a page that needs a browser,
   * a site that turns scripts away), the script is written from the first of these that can, and that outlet is
   * credited instead.
   */
  reports?: { link: string; source: string; sourceId: string }[];
  /** What the voice says. */
  script: string;
  visual: BulletinVisual;
  /** The voice clip, once made: a path beside the spec. */
  audio?: string;
  /** Each word's start and end in the clip (seconds), from the voice service; the captions follow them. */
  words?: [number, number][];
}

/** What scripts/render-bulletin.mjs reads. */
export interface BulletinSpec {
  slotLabel: string;
  slotChip: string;
  dateLine: string;
  tagline: string;
  nextLine: string;
  stories: {
    section: string;
    color: string;
    headline: string;
    short: string;
    source: string;
    more: number;
    script: string;
    visual: BulletinVisual;
    audio?: string;
    words?: [number, number][];
  }[];
}

const DHAKA_OFFSET_MS = 6 * 3600_000;
const DAY_MS = 86_400_000;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const WEEKDAYS = ["রবিবার", "সোমবার", "মঙ্গলবার", "বুধবার", "বৃহস্পতিবার", "শুক্রবার", "শনিবার"];
const MONTHS = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"];

const bn = (value: number | string) => String(value).replace(/\d/g, (d) => "০১২৩৪৫৬৭৮৯"[Number(d)]);
const dhaka = (at: number) => new Date(at + DHAKA_OFFSET_MS);
const dayOf = (at: number) => Math.floor((at + DHAKA_OFFSET_MS) / DAY_MS);

/** Each section's accent colour in a bulletin, picked to read on the dark frame. */
export const SECTION_COLORS: Record<Category, string> = {
  national: "#5ccaa0",
  politics: "#ff8f6b",
  international: "#6fc3e8",
  business: "#e0b458",
  sports: "#5aa9ff",
  entertainment: "#f08bc0",
  tech: "#b79cff",
  education: "#8fd16a",
  health: "#4fd1c5",
  lifestyle: "#f5a66b",
  crime: "#f47c7c",
  opinion: "#c9c5bd",
  other: "#c9c5bd",
};

/** The times that are well formed, in order, without repeats; none left, the default three. */
export function bulletinTimesOf(value: unknown): string[] {
  const times = Array.isArray(value) ? [...new Set(value.filter((t): t is string => typeof t === "string" && TIME.test(t)))].sort() : [];
  return times.length ? times.slice(0, 8) : BULLETIN_TIMES;
}

/** The table's bulletins of the Dhaka days around `now`, as times (ms), in order. */
export function bulletinSlots(now: number, times: string[] = BULLETIN_TIMES): number[] {
  const midnight = dayOf(now) * DAY_MS - DHAKA_OFFSET_MS;
  return [-1, 0, 1]
    .flatMap((d) =>
      times.map((t) => {
        const [h, m] = t.split(":").map(Number);
        return midnight + d * DAY_MS + (h * 60 + m) * 60_000;
      }),
    )
    .sort((a, b) => a - b);
}

/**
 * The table's bulletins whose draft is due at `now`: those still ahead and within the lead (`slackMs` early, so the
 * run nearest before the lead makes it rather than the one after).
 */
export function bulletinsToDraft(now: number, times: string[], leadMinutes: number, slackMs = 5 * 60_000): number[] {
  return bulletinSlots(now, times).filter((at) => at > now && at - leadMinutes * 60_000 <= now + slackMs);
}

/** When a bulletin going out at `at` can no longer be edited (ms). */
export const bulletinLockAt = (at: number, lockMinutes: number) => at - lockMinutes * 60_000;

/** "সকাল ১০টা", "বিকেল ৪টা", "রাত ৯:৩০": a time of the Dhaka day as a bulletin names it. */
export function clockBn(at: number): string {
  const d = dhaka(at);
  const hour = d.getUTCHours();
  const minute = d.getUTCMinutes();
  const part = hour < 4 ? "রাত" : hour < 6 ? "ভোর" : hour < 12 ? "সকাল" : hour < 15 ? "দুপুর" : hour < 18 ? "বিকেল" : hour < 20 ? "সন্ধ্যা" : "রাত";
  const h = hour % 12 || 12;
  return minute ? `${part} ${bn(h)}:${bn(String(minute).padStart(2, "0"))}` : `${part} ${bn(h)}টা`;
}

/** "১৫ নভেম্বর". */
export const dayMonthBn = (at: number) => `${bn(dhaka(at).getUTCDate())} ${MONTHS[dhaka(at).getUTCMonth()]}`;

/** "রবিবার, ১৫ নভেম্বর ২০২৬". */
export const dateLineBn = (at: number) => `${WEEKDAYS[dhaka(at).getUTCDay()]}, ${dayMonthBn(at)} ${bn(dhaka(at).getUTCFullYear())}`;

/** The table's first bulletin after `at` (ms). */
export function nextBulletin(at: number, times: string[] = BULLETIN_TIMES): number {
  return bulletinSlots(at, times).find((t) => t > at) ?? at + DAY_MS;
}

/** The closer's line: "পরের বুলেটিন রাত ৯টায়", or "…কাল সকাল ১০টায়" when it is the next day's. */
export function nextLineBn(at: number, times: string[] = BULLETIN_TIMES): string {
  const next = nextBulletin(at, times);
  const clock = clockBn(next);
  const when = clock.endsWith("টা") ? `${clock}য়` : `${clock}-এ`;
  return `পরের বুলেটিন ${dayOf(next) > dayOf(at) ? "কাল " : ""}${when}`;
}

const sentence = (text: string) => (/[।?!]$/.test(text.trim()) ? text.trim() : `${text.trim()}।`);

/**
 * A story as the picker drafts it, before anyone (or the script writer) has read the article: the script is the
 * headline as it stands and the graphic lists the outlets carrying it, both of which are true without reading further.
 */
export function draftStory({ story, item, outlets }: PostChoice): BulletinStory {
  const names: string[] = [];
  const reports: NonNullable<BulletinStory["reports"]> = [];
  for (const it of [item, ...story.items]) {
    const name = sourceName(it.sourceId, it.sourceName, "bn");
    if (names.includes(name)) continue;
    names.push(name);
    if (it.sourceId !== item.sourceId && reports.length < OTHER_REPORTS) reports.push({ link: it.link, source: name, sourceId: it.sourceId });
  }
  return {
    key: story.id,
    link: item.link,
    section: storySection(story),
    headline: item.title,
    short: item.title,
    source: names[0],
    sourceId: item.sourceId,
    more: Math.max(0, outlets - 1),
    script: sentence(item.title),
    visual: { type: "points", title: "যেসব সংবাদমাধ্যমে", items: names.slice(0, 3) },
    ...(reports.length ? { reports } : {}),
  };
}

/** What stops a bulletin from being rendered, in the admin's words; none, and it can go. */
export function bulletinProblems(stories: BulletinStory[]): string[] {
  const problems: string[] = [];
  if (stories.length < 1) problems.push("A bulletin needs at least one story.");
  if (stories.length > MAX_STORIES) problems.push(`A bulletin holds ${MAX_STORIES} stories at most.`);
  stories.forEach((s, i) => {
    const n = `Story ${i + 1}`;
    if (!s.headline.trim()) problems.push(`${n} has no headline.`);
    if (!s.source.trim()) problems.push(`${n} has no outlet to credit.`);
    if (!s.script.trim()) problems.push(`${n} has no script.`);
    else if (s.script.length > MAX_SCRIPT_CHARS) problems.push(`${n}'s script is over ${MAX_SCRIPT_CHARS} characters.`);
    if (s.visual.type === "points" && s.visual.items.filter((x) => x.trim()).length === 0) problems.push(`${n}'s graphic is empty.`);
  });
  return problems;
}

/** The renderer's spec for a bulletin going out at `at`. `outlets`: how many the board reads, for the opener. */
export function bulletinSpec(at: number, stories: BulletinStory[], options: { times?: string[]; outlets?: number } = {}): BulletinSpec {
  const label = (c: Category) => CATEGORIES.find((x) => x.id === c)?.bn ?? "";
  return {
    slotLabel: clockBn(at),
    slotChip: `${clockBn(at)} · ${dayMonthBn(at)}`,
    dateLine: dateLineBn(at),
    tagline: options.outlets ? `${bn(options.outlets)}টি সংবাদমাধ্যম · এক বোর্ডে` : "বাংলাদেশের খবর · এক বোর্ডে",
    nextLine: nextLineBn(at, options.times),
    stories: stories.map((s) => ({
      section: label(s.section),
      color: SECTION_COLORS[s.section],
      headline: s.headline,
      short: s.short || s.headline,
      source: s.source,
      more: s.more,
      script: s.script,
      visual: s.visual,
      ...(s.audio ? { audio: s.audio } : {}),
      ...(s.audio && s.words?.length ? { words: s.words } : {}),
    })),
  };
}
