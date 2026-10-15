import { dhakaDay } from "@/components/time";
import { sourceName } from "./bn-names";
import type { Category } from "./categories";
import { localDigits } from "./i18n";
import { shareKey, shortSharePath } from "./share";
import { findStories, itemTime, keywords, type Story } from "./stories";
import type { NewsItem } from "./types";

/**
 * Which story the Facebook Page posts next, and when (scripts/post-facebook.ts posts it; docs/facebook-posting.md).
 * Pure: the script hands it the board's headlines, what was posted before, and the time.
 *
 * Posts go out at set times of the Dhaka day (SLOTS), each with the most covered story not posted yet that passes
 * the rules below, plus a breaking story between them now and then. Each credits one outlet of the story, the one
 * credited least lately, so the Page carries every paper in turn rather than the same few.
 */

/** Times of the Dhaka day a post goes out ("HH:MM"). The FB_SLOTS repository variable replaces them. */
export const SLOTS = ["08:00", "10:30", "13:00", "16:00", "19:00", "21:00", "22:30"];

/** A slot is acted on in the first runs of this window from its start (the deploy runs every 15 minutes). */
const ACT_WINDOW_MS = 60 * 60_000;
/** Facebook takes a scheduled post from ten minutes ahead; this leaves room for a slow run. */
export const MIN_SCHEDULE_MS = 15 * 60_000;
/** No two posts closer than this. */
const MIN_GAP_MS = 45 * 60_000;
/** A story is posted only while it is still being reported: its newest headline at most this old... */
const FRESH_MS = 2 * 3600_000;
/** ...and its first at most this old. */
const MAX_AGE_MS = 12 * 3600_000;
/** Outlets needed for a story to be posted: one outlet alone is too often a rumour, a scoop or a slant. */
const MIN_OUTLETS = 3;
/** A story posted is not posted again (as the same headlines, or as a story about the same thing) for this long. */
const REPEAT_MS = 24 * 3600_000;
/** Posts kept in the history: long enough for the repeat rule and the outlet rotation. */
export const HISTORY_MS = 7 * 24 * 3600_000;

/** Breaking news between the slots: this many outlets... */
const BREAKING_OUTLETS = 8;
/** ...within this long of the first headline... */
const BREAKING_WITHIN_MS = 90 * 60_000;
/** ...at most this many times a Dhaka day. */
const BREAKING_PER_DAY = 2;

/** Posts a Dhaka day per section; sections not listed get DEFAULT_CAP. */
const SECTION_CAPS: Partial<Record<Category, number>> = { national: 3, crime: 1, opinion: 0, other: 1 };
const DEFAULT_CAP = 2;
/** A story from the same section as the post before counts this much less, so sections take turns. */
const SAME_SECTION_FACTOR = 0.5;

/**
 * Stories never posted, whoever reports them: graphic violence, sexual violence, suicide (no post can do those with
 * the care they need), and pages that aren't news. Bangla words match inside longer ones (ধর্ষ: ধর্ষণ, ধর্ষণের,
 * ধর্ষক), English ones as whole words. The Page's own review catches the rest (docs/facebook-posting.md).
 */
const SENSITIVE_BN = [
  "ধর্ষ", "যৌন", "শ্লীলতাহানি", "বিবস্ত্র", "আত্মহত্যা", "আত্মহনন", "গলায় ফাঁস", "ঝুলন্ত", "কুপিয়ে", "গলা কেটে",
  "জবাই", "টুকরো টুকরো", "খণ্ডিত", "অ্যাসিড", "রাশিফল", "নামাজের সময়সূচি", "সেহরি ও ইফতার",
];
const SENSITIVE_EN =
  /\b(rape[ds]?|raping|gang-?rape|sexual|molest\w*|suicide|hang(ed|ing) (himself|herself)|hacked to death|behead\w*|acid attack|horoscope)\b/i;

export function isSensitive(title: string): boolean {
  return SENSITIVE_BN.some((w) => title.includes(w)) || SENSITIVE_EN.test(title);
}

/** One post the Page made (or planned, or, in a dry run, would have made). */
export interface PostRecord {
  /** "slot": at a set time; "breaking": between them. */
  kind: "slot" | "breaking";
  /** The slot it was for (ISO), for a slot post. */
  slot?: string;
  /** When it goes out (ISO): now, or the time it is scheduled for. */
  at: string;
  /** The headline linked to. */
  title: string;
  link: string;
  sourceId: string;
  category: Category;
  /** The share keys (see shareKey) of every headline in the story, so none of them is posted again. */
  keys: string[];
  /** The story's keywords (its lead's), so another story about the same thing isn't posted either. */
  words: string[];
  /** Facebook's id for the post; none in a dry run. */
  id?: string;
  /** How it was posted: "on" (straight away), "review" (scheduled, to be checked first) or "dry" (not posted). */
  mode: PostingMode;
}

export type PostingMode = "dry" | "review" | "on";

/** "08:00" → minutes after midnight. */
function minutes(slot: string): number {
  const [h, m] = slot.split(":").map(Number);
  return h * 60 + m;
}

const DHAKA_OFFSET_MS = 6 * 3600_000;
const DAY_MS = 86_400_000;

/** The slots of the Dhaka days around `now`, as times (ms). */
function slotTimes(now: number, slots: string[]): number[] {
  const midnight = Math.floor((now + DHAKA_OFFSET_MS) / DAY_MS) * DAY_MS - DHAKA_OFFSET_MS;
  return [-1, 0, 1].flatMap((d) => slots.map((s) => midnight + d * DAY_MS + minutes(s) * 60_000));
}

/** The `slots` setting (FB_SLOTS): "08:00, 13:00, 21:30". Malformed entries are left out; none left, the default. */
export function parseSlots(value: string | undefined): string[] {
  const slots = (value ?? "")
    .split(/[\s,]+/)
    .filter((s) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(s))
    .map((s) => s.padStart(5, "0"));
  return slots.length ? [...new Set(slots)].sort() : SLOTS;
}

/**
 * The next post due, if any: a slot whose window has begun and that has no post yet. `lead` is how long before its
 * slot a post is made: in review mode it is scheduled ahead, so there is time to look at it (and delete it) in Meta
 * Business Suite before it goes out. Returns when it should go out (never sooner than MIN_SCHEDULE_MS when scheduled).
 */
export function dueSlot(now: number, history: PostRecord[], slots: string[], lead: number): { slot: number; at: number } | null {
  for (const slot of slotTimes(now, slots)) {
    const from = slot - lead;
    if (now < from || now >= from + ACT_WINDOW_MS) continue;
    if (history.some((p) => p.slot && Date.parse(p.slot) === slot)) continue;
    const at = lead ? Math.max(slot, now + MIN_SCHEDULE_MS) : now;
    return { slot, at };
  }
  return null;
}

/** What to post: the story, and the headline of it to link to. */
export interface PostChoice {
  story: Story;
  item: NewsItem;
  /** Distinct outlets reporting it. */
  outlets: number;
}

export interface PickOptions {
  now: number;
  /** When the post goes out: the gap and per-day rules are counted from there. */
  at: number;
  history: PostRecord[];
  /** Whether the headline has a picture for its link preview (the share index has one). */
  hasPicture: (item: NewsItem) => boolean;
  /** Only a story breaking now (see BREAKING_OUTLETS). */
  breaking?: boolean;
}

/** Stories as the Page sees them: Bangla headlines only (the Page is in Bangla), covered by MIN_OUTLETS or more. */
export function pageStories(items: NewsItem[], now: number): Story[] {
  return findStories(
    items.filter((it) => it.lang === "bn"),
    { minOutlets: MIN_OUTLETS, maxAgeMs: MAX_AGE_MS, now },
  );
}

const firstTime = (story: Story) =>
  story.items.reduce<number>((first, it) => {
    const t = Date.parse(itemTime(it) ?? "");
    return Number.isNaN(t) ? first : Math.min(first, t);
  }, Infinity);

/** Whether two keyword lists are about the same thing: most of the shorter one's words are in the other. */
function sameSubject(a: string[], b: string[]): boolean {
  if (!a.length || !b.length) return false;
  const set = new Set(b);
  const shared = a.filter((w) => set.has(w)).length;
  return shared >= 2 && shared / Math.min(a.length, b.length) >= 0.5;
}

/**
 * The next story to post, from `stories` (pageStories), or null when none passes: fresh, not posted in the last day
 * (none of its headlines, nor its subject), nothing sensitive in any of its headlines, its section not over its
 * daily cap, and a headline with a picture to link to. The most covered lately wins (Story.heat), less so when its
 * section had the post before.
 */
export function pickStory(stories: Story[], { now, at, history, hasPicture, breaking = false }: PickOptions): PostChoice | null {
  const recent = history.filter((p) => Date.parse(p.at) > at - REPEAT_MS);
  const postedKeys = new Set(recent.flatMap((p) => p.keys));
  const day = dhakaDay(at);
  const today = history.filter((p) => dhakaDay(p.at) === day);
  const perSection = new Map<Category, number>();
  for (const p of today) perSection.set(p.category, (perSection.get(p.category) ?? 0) + 1);
  const last = [...history].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];

  if (history.some((p) => Math.abs(Date.parse(p.at) - at) < MIN_GAP_MS)) return null;
  if (breaking && today.filter((p) => p.kind === "breaking").length >= BREAKING_PER_DAY) return null;

  let best: { pick: PostChoice; score: number } | null = null;
  for (const story of stories) {
    const outlets = new Set(story.items.map((it) => it.sourceId)).size;
    if (outlets < MIN_OUTLETS) continue;
    const latest = Date.parse(story.latest ?? "");
    if (Number.isNaN(latest) || now - latest > FRESH_MS) continue;
    if (breaking && (outlets < BREAKING_OUTLETS || now - firstTime(story) > BREAKING_WITHIN_MS)) continue;

    const category = storySection(story);
    if ((perSection.get(category) ?? 0) >= (SECTION_CAPS[category] ?? DEFAULT_CAP)) continue;
    if (story.items.some((it) => isSensitive(it.title))) continue;
    if (story.items.some((it) => postedKeys.has(shareKey(it.link)))) continue;
    const words = keywords(story.lead.title);
    if (recent.some((p) => sameSubject(words, p.words))) continue;

    const item = creditedItem(story, history, hasPicture);
    if (!item) continue;
    const score = story.heat * (last && last.category === category ? SAME_SECTION_FACTOR : 1);
    if (!best || score > best.score) best = { pick: { story, item, outlets }, score };
  }
  return best?.pick ?? null;
}

/**
 * The story's section: the one most of its outlets file it under ("other", only when none says). The lead's own can
 * be "other" when its outlet names no section, while a dozen others call it politics.
 */
export function storySection(story: Story): Category {
  const votes = new Map<Category, number>();
  for (const it of story.items) if (it.category !== "other") votes.set(it.category, (votes.get(it.category) ?? 0) + 1);
  let best: Category = "other";
  for (const [category, n] of votes) if (n > (votes.get(best) ?? 0)) best = category;
  return best;
}

/**
 * The headline of the story to link to: of those with a picture, the one from the outlet credited least lately (never
 * yet comes first), the lead's outlet first among equals.
 */
function creditedItem(story: Story, history: PostRecord[], hasPicture: (item: NewsItem) => boolean): NewsItem | null {
  const lastCredited = new Map<string, number>();
  for (const p of history) lastCredited.set(p.sourceId, Math.max(lastCredited.get(p.sourceId) ?? 0, Date.parse(p.at)));
  let best: NewsItem | null = null;
  for (const it of story.items) {
    if (!hasPicture(it)) continue;
    if (!best || (lastCredited.get(it.sourceId) ?? 0) < (lastCredited.get(best.sourceId) ?? 0)) best = it;
  }
  return best;
}

/** The Dhaka day a headline's short link is filed under (as the share function's shortPath has it). */
export const shareDay = (item: NewsItem, now: number) => dhakaDay(itemTime(item) ?? now);

/** The headline's short Bartaboard link (/s/…), whose preview shows its title, outlet and picture. */
export function postLink(site: string, item: NewsItem, now: number): string {
  return `${site}${shortSharePath(item.link, shareDay(item, now))}`;
}

/** The post's text: the headline, and who reports it. */
export function postMessage({ item, outlets }: PostChoice): string {
  const outlet = sourceName(item.sourceId, item.sourceName, "bn");
  const others = outlets - 1;
  const more = others > 0 ? ` · আরও ${localDigits(String(others), "bn")}টি সংবাদমাধ্যমেও এই খবর` : "";
  return `${item.title}\n\n${outlet}${more}`;
}

/** The record of a post made from `pick`. */
export function postRecord(
  pick: PostChoice,
  fields: Pick<PostRecord, "kind" | "at" | "link" | "mode"> & Partial<Pick<PostRecord, "slot" | "id">>,
): PostRecord {
  const { story, item } = pick;
  return {
    ...fields,
    title: item.title,
    sourceId: item.sourceId,
    category: storySection(story),
    keys: [...new Set(story.items.map((it) => shareKey(it.link)))],
    words: keywords(story.lead.title),
  };
}

/** The history without posts older than HISTORY_MS. */
export const recentHistory = (history: PostRecord[], now: number) =>
  history.filter((p) => now - Date.parse(p.at) < HISTORY_MS);
