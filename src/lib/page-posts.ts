import { dhakaDay } from "@/components/time";
import { sourceName } from "./bn-names";
import type { Category } from "./categories";
import { localDigits } from "./i18n";
import { shareKey, shortSharePath } from "./share";
import { findStories, itemTime, keywords, type Story } from "./stories";
import type { NewsItem } from "./types";
import { type PostContent, type Slot, slotTimes } from "./slot-table";

export { type PostContent, parseSlots, type Slot, SLOTS, slotTimes } from "./slot-table";

/**
 * Which story the Facebook Page posts next, and when (scripts/post-facebook.ts posts it; docs/facebook-posting.md).
 * Pure: the script hands it the board's headlines, what was posted before, and the time. Videos: page-video-posts.ts.
 *
 * Posts go out at set times of the Dhaka day (SLOTS), each with the most covered story not posted yet that passes
 * the rules below, plus a breaking story between them now and then. Each credits one outlet of the story, the one
 * credited least lately, so the Page carries every paper in turn rather than the same few.
 */

/** Headlines (and videos) in a carousel post. */
export const CAROUSEL_CARDS = 5;
/** A story in a headlines carousel shares it with at most this many from its section. */
const CAROUSEL_PER_SECTION = 2;

/** A slot is acted on in the first runs of this window from its start (the deploy runs every 15 minutes). */
const ACT_WINDOW_MS = 60 * 60_000;
/** Facebook takes a scheduled post from ten minutes ahead; this leaves room for a slow run. */
export const MIN_SCHEDULE_MS = 15 * 60_000;
/** No two posts closer than this. */
export const MIN_GAP_MS = 45 * 60_000;
/** A story is posted only while it is still being reported: its newest headline at most this old... */
const FRESH_MS = 2 * 3600_000;
/** ...and its first at most this old. */
const MAX_AGE_MS = 12 * 3600_000;
/** Outlets needed for a story to be posted: one outlet alone is too often a rumour, a scoop or a slant. */
const MIN_OUTLETS = 3;
/** A story posted is not posted again (as the same headlines, or as a story about the same thing) for this long... */
export const REPEAT_MS = 24 * 3600_000;
/**
 * ...unless it has moved on: from this long after it was posted, it can go out again as a follow-up when
 * FOLLOW_UP_OUTLETS more outlets (FOLLOW_UP_CHANNELS channels, for a video) have reported it since, linking one of
 * those newer reports. Never sooner.
 */
export const FOLLOW_UP_AFTER_MS = 8 * 3600_000;
export const FOLLOW_UP_OUTLETS = 3;
export const FOLLOW_UP_CHANNELS = 2;
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
  /** What it was; "news" when missing (posts from before videos were). */
  content?: PostContent;
  /** The slot it was for (ISO), for a slot post. */
  slot?: string;
  /** When it goes out (ISO): now, or the time it is scheduled for. */
  at: string;
  /** The headline or video linked to (a roundup: its heading, and the Videos page). */
  title: string;
  link: string;
  /** The outlet credited, or the channel (a roundup: its first card's). */
  sourceId: string;
  /** A roundup's other cards' channels. */
  alsoCredited?: string[];
  /** The headline's section; "other" for videos. */
  category: Category;
  /**
   * What not to post again: the share keys (see shareKey) of every headline in the story, or the ids of every
   * video in the video story.
   */
  keys: string[];
  /** The story's keywords (subjectWords() of its lead), so another story about the same thing isn't posted either. */
  words: string[];
  /** The keywords of each of the story's titles (titleSubjects); a carousel's, of each card's story's titles. */
  subjects?: string[][];
  /** A follow-up of the story posted then (ISO). */
  followUpOf?: string;
  /** Facebook's id for the post; none in a dry run. */
  id?: string;
  /**
   * Facebook read the link's own preview (its headline and picture), not the site's fallback card. Set when checked;
   * a single post without it is read again on later runs until it is (scripts/post-facebook.ts repairPreviews).
   */
  previewOk?: boolean;
  /** How it was posted: "on" (straight away), "review" (scheduled, to be checked first) or "dry" (not posted). */
  mode: PostingMode;
}

export type PostingMode = "dry" | "review" | "on";

/** What a record was: posts from before videos were all headlines. */
export const contentOf = (p: PostRecord): PostContent => p.content ?? "news";

const DHAKA_OFFSET_MS = 6 * 3600_000;

/**
 * The next post due, if any: a slot whose window has begun and that has no post yet. `lead` is how long before its
 * slot a post is made: in review mode it is scheduled ahead, so there is time to look at it (and delete it) in Meta
 * Business Suite before it goes out. Returns when it should go out (never sooner than MIN_SCHEDULE_MS when scheduled).
 */
export function dueSlot(
  now: number,
  history: PostRecord[],
  slots: Slot[],
  lead: number,
): { slot: number; at: number; content: PostContent } | null {
  for (const { at: slot, content } of slotTimes(now, slots)) {
    const from = slot - lead;
    if (now < from || now >= from + ACT_WINDOW_MS) continue;
    if (history.some((p) => p.slot && Date.parse(p.slot) === slot)) continue;
    const at = lead ? Math.max(slot, now + MIN_SCHEDULE_MS) : now;
    return { slot, at, content };
  }
  return null;
}

/** Whether a post at `at` would come too soon after (or before) another. */
export const tooClose = (history: PostRecord[], at: number) =>
  history.some((p) => Math.abs(Date.parse(p.at) - at) < MIN_GAP_MS);

/** The posts within REPEAT_MS before `at`, whose stories aren't posted again. */
export const recentPosts = (history: PostRecord[], at: number) =>
  history.filter((p) => Date.parse(p.at) > at - REPEAT_MS);

/**
 * Words that say little about what a story is ("ঘিরে", "উপলক্ষে", "যা জানালেন"), left out of its subject on top of
 * keywords()' stopwords: "দুর্গাপূজা ঘিরে X" and "দুর্গাপূজা ঘিরে Y" aren't the same story for sharing them.
 */
const SUBJECT_STOPWORDS = new Set(["ঘির", "উপলক্ষ", "উপলক্ষ্য", "যা", "জানালেন", "বিশেষ", "শুরু", "চলছে", "হলো"]);

/** A title's subject: its keywords, less SUBJECT_STOPWORDS. */
export const subjectWords = (title: string) => keywords(title).filter((w) => !SUBJECT_STOPWORDS.has(w));

/** Titles of a story looked at for its subject, at most. */
const MAX_TITLES = 16;

/**
 * A story's subjects: the keywords of each of its titles (up to MAX_TITLES different ones). Outlets and channels
 * tell one story in many ways ("নিরাপত্তা নিয়ে নেই শঙ্কা…", "দুর্গাপূজায় কোনো নিরাপত্তা শঙ্কা নেই"), and grouping can
 * split it in two: matched by any of its titles, a story isn't posted twice because its two leads read differently.
 */
export function titleSubjects(titles: string[], max = MAX_TITLES): string[][] {
  const out: string[][] = [];
  const seen = new Set<string>();
  for (const title of titles) {
    const words = subjectWords(title);
    const key = [...words].sort().join(" ");
    if (words.length < 2 || seen.has(key)) continue;
    seen.add(key);
    out.push(words);
    if (out.length >= max) break;
  }
  return out;
}

/** Whether any title of one story is about the same thing as any of another's. */
export const sameStory = (a: string[][], b: string[][]) => a.some((x) => b.some((y) => sameSubject(x, y)));

/** A post's subjects, as recorded (records from before titleSubjects have only their lead's words). */
const postSubjects = (p: PostRecord) =>
  [p.words, ...(p.subjects ?? [])].map((w) => w.filter((x) => !SUBJECT_STOPWORDS.has(x))).filter((w) => w.length);

/** Whether a story (its titleSubjects) is the subject of a recent post, or of one of a carousel's cards. */
export const postedSubject = (recent: PostRecord[], subjects: string[][]) =>
  recent.some((p) => sameStory(subjects, postSubjects(p)));

/** What of a story can be posted: its reports to link to, and whether it goes out as a follow-up. */
export interface Postable<T> {
  entries: T[];
  /** When the story was last posted (ISO), if this is a follow-up of it. */
  followUpOf?: string;
}

/**
 * Whether a story can be posted, given the posts of the last REPEAT_MS (`recent`), and with which of its reports
 * (headlines, videos). Not posted lately (none of its reports, nor its subject): all of them. Posted less than
 * FOLLOW_UP_AFTER_MS ago: null. Posted before that: a follow-up, with the reports since then, when `minSources`
 * outlets or channels have reported it since; null when they haven't (no news since).
 */
export function postableEntries<T>(
  recent: PostRecord[],
  at: number,
  entries: T[],
  subjects: string[][],
  { key, time, source, minSources }: { key: (e: T) => string; time: (e: T) => number; source: (e: T) => string; minSources: number },
): Postable<T> | null {
  const keys = new Set(entries.map(key));
  const related = recent.filter((p) => p.keys.some((k) => keys.has(k)) || sameStory(subjects, postSubjects(p)));
  if (!related.length) return { entries };
  const last = Math.max(...related.map((p) => Date.parse(p.at)));
  if (at - last < FOLLOW_UP_AFTER_MS) return null;
  const posted = new Set(related.flatMap((p) => p.keys));
  const since = entries.filter((e) => time(e) > last && !posted.has(key(e)));
  return new Set(since.map(source)).size >= minSources ? { entries: since, followUpOf: new Date(last).toISOString() } : null;
}

/** A headline story's postableEntries: its headlines, by share key, time and outlet. */
const postableItems = (recent: PostRecord[], at: number, story: Story) =>
  postableEntries(recent, at, story.items, storySubjects(story), {
    key: (it) => shareKey(it.link),
    time: (it) => Date.parse(itemTime(it) ?? "") || 0,
    source: (it) => it.sourceId,
    minSources: FOLLOW_UP_OUTLETS,
  });

/**
 * The history, each post's subjects added to from the feeds now: `titlesOf` gives, for a key (share key, video id),
 * the titles of the whole story it is in now (`storyTitles`). A story keeps growing after it is posted (more
 * outlets, other channels' takes), and those later titles are the ones a second post would be made from. For picking
 * only; the history kept stays as it was.
 */
export function withFeedTitles(history: PostRecord[], titlesOf: (key: string) => string[] | undefined): PostRecord[] {
  return history.map((p) => {
    const titles = [...new Set(p.keys.flatMap((k) => titlesOf(k) ?? []))];
    return titles.length ? { ...p, subjects: [...(p.subjects ?? []), ...titleSubjects(titles, Infinity)] } : p;
  });
}

/** For withFeedTitles: each key's story's titles, from groups of [key, title] (a story's headlines, or videos). */
export function storyTitles(groups: [string, string][][]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const group of groups) {
    const titles = group.map(([, t]) => t);
    for (const [key] of group) out.set(key, [...(out.get(key) ?? []), ...titles]);
  }
  return out;
}

/** When each outlet or channel was last credited (ms), in posts of these kinds. */
export function lastCredited(history: PostRecord[], contents: PostContent[]): Map<string, number> {
  const last = new Map<string, number>();
  for (const p of history) {
    if (!contents.includes(contentOf(p))) continue;
    for (const id of [p.sourceId, ...(p.alsoCredited ?? [])]) last.set(id, Math.max(last.get(id) ?? 0, Date.parse(p.at)));
  }
  return last;
}

/** What to post: the story, and the headline of it to link to. */
export interface PostChoice {
  story: Story;
  item: NewsItem;
  /** Distinct outlets reporting it. */
  outlets: number;
  /** A follow-up of the story posted then (ISO): `item` is one of the reports since. */
  followUpOf?: string;
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

/**
 * Whether two keywords are one word: the same, or one a compound or a longer form of the other ("পূজা" in
 * "দুর্গাপূজা" and "পূজামণ্ডপ", "শঙ্কা" in "আশঙ্কা"). Short words only match exactly ("দল" isn't in "দলীয়").
 */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return [...short].length >= 4 && (long.startsWith(short) || long.endsWith(short));
}

/** Whether two keyword lists are about the same thing: most of the shorter one's words are in the other. */
export function sameSubject(a: string[], b: string[]): boolean {
  if (!a.length || !b.length) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  // Each word of the longer list matches once: "পূজা" and "দুর্গাপূজা" aren't two words shared with "দুর্গাপূজা".
  const left = [...long];
  let shared = 0;
  for (const w of short) {
    const i = left.findIndex((x) => x === w);
    const j = i >= 0 ? i : left.findIndex((x) => sameWord(w, x));
    if (j < 0) continue;
    left.splice(j, 1);
    shared++;
  }
  return shared >= 2 && shared / short.length >= 0.5;
}

/** A headline story's subjects: its lead's title first, then the rest of its headlines'. */
export const storySubjects = (story: Story) => titleSubjects([story.lead.title, ...story.items.map((it) => it.title)]);

/**
 * The next story to post, from `stories` (pageStories), or null when none passes: fresh, not posted in the last day
 * (none of its headlines, nor its subject), nothing sensitive in any of its headlines, its section not over its
 * daily cap, and a headline with a picture to link to. The most covered lately wins (Story.heat), less so when its
 * section had the post before.
 */
export function pickStory(stories: Story[], { now, at, history, hasPicture, breaking = false }: PickOptions): PostChoice | null {
  const recent = recentPosts(history, at);
  const day = dhakaDay(at);
  // Sections, their caps and their turns are the headlines' alone.
  const news = history.filter((p) => contentOf(p) === "news");
  const today = news.filter((p) => dhakaDay(p.at) === day);
  const perSection = new Map<Category, number>();
  for (const p of today) perSection.set(p.category, (perSection.get(p.category) ?? 0) + 1);
  const last = [...news].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];

  if (tooClose(history, at)) return null;
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
    const postable = postableItems(recent, at, story);
    if (!postable) continue;

    const item = creditedItem({ ...story, items: postable.entries }, history, hasPicture);
    if (!item) continue;
    const score = story.heat * (last && last.category === category ? SAME_SECTION_FACTOR : 1);
    if (!best || score > best.score) best = { pick: { story, item, outlets, followUpOf: postable.followUpOf }, score };
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
function creditedItem(
  story: Story,
  history: PostRecord[],
  hasPicture: (item: NewsItem) => boolean,
  used = new Set<string>(),
): NewsItem | null {
  const last = lastCredited(history, ["news", "headlines"]);
  let best: NewsItem | null = null;
  for (const it of story.items) {
    if (!hasPicture(it) || used.has(it.sourceId)) continue;
    if (!best || (last.get(it.sourceId) ?? 0) < (last.get(best.sourceId) ?? 0)) best = it;
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
    content: "news",
    title: item.title,
    sourceId: item.sourceId,
    category: storySection(story),
    keys: [...new Set(story.items.map((it) => shareKey(it.link)))],
    words: subjectWords(story.lead.title),
    subjects: storySubjects(story),
    ...(pick.followUpOf && { followUpOf: pick.followUpOf }),
  };
}

/**
 * A headlines carousel: the CAROUSEL_CARDS most covered fresh stories that pickStory's rules allow (not posted lately,
 * nothing sensitive, a picture), at most CAROUSEL_PER_SECTION from a section, each card from a different outlet (the
 * one credited least lately). Empty when there are fewer: one headline goes out instead.
 */
export function pickHeadlines(stories: Story[], { now, at, history, hasPicture }: PickOptions): PostChoice[] {
  if (tooClose(history, at)) return [];
  const recent = recentPosts(history, at);
  const cards: PostChoice[] = [];
  const used = new Set<string>();
  const perSection = new Map<Category, number>();
  const subjects: string[][][] = [];
  for (const story of stories) {
    if (cards.length >= CAROUSEL_CARDS) break;
    const outlets = new Set(story.items.map((it) => it.sourceId)).size;
    if (outlets < MIN_OUTLETS) continue;
    const latest = Date.parse(story.latest ?? "");
    if (Number.isNaN(latest) || now - latest > FRESH_MS) continue;
    const section = storySection(story);
    if (section === "opinion" || (perSection.get(section) ?? 0) >= CAROUSEL_PER_SECTION) continue;
    if (story.items.some((it) => isSensitive(it.title))) continue;
    const words = storySubjects(story);
    const postable = postableItems(recent, at, story);
    if (!postable || subjects.some((w) => sameStory(words, w))) continue;
    const item = creditedItem({ ...story, items: postable.entries }, history, hasPicture, used);
    if (!item) continue;
    cards.push({ story, item, outlets, followUpOf: postable.followUpOf });
    used.add(item.sourceId);
    perSection.set(section, (perSection.get(section) ?? 0) + 1);
    subjects.push(words);
  }
  return cards.length >= CAROUSEL_CARDS ? cards : [];
}

/** "সকালের", "দুপুরের", "বিকেলের" or "রাতের", by the Dhaka hour of `at`: a carousel's heading starts with it. */
export function partOfDay(at: number): string {
  const hour = new Date(at + DHAKA_OFFSET_MS).getUTCHours();
  return hour < 11 ? "সকালের" : hour < 15 ? "দুপুরের" : hour < 18 ? "বিকেলের" : "রাতের";
}

/** A headlines carousel's heading: "রাতের শীর্ষ ৫ খবর". */
export const headlinesHeading = (at: number, cards: number) =>
  `${partOfDay(at)} শীর্ষ ${localDigits(String(cards), "bn")} খবর`;

/** A headlines carousel's text: its heading, then each card's headline and outlet, numbered as the carousel has them. */
export function headlinesMessage(cards: PostChoice[], at: number): string {
  const lines = cards.map(
    ({ item }, i) => `${localDigits(String(i + 1), "bn")}. ${item.title} — ${sourceName(item.sourceId, item.sourceName, "bn")}`,
  );
  return `${headlinesHeading(at, cards.length)}\n\n${lines.join("\n")}`;
}

/** The record of a headlines carousel. */
export function headlinesRecord(
  cards: PostChoice[],
  fields: Pick<PostRecord, "kind" | "at" | "link" | "mode"> & Partial<Pick<PostRecord, "slot" | "id">>,
): PostRecord {
  return {
    ...fields,
    content: "headlines",
    title: headlinesHeading(Date.parse(fields.at), cards.length),
    sourceId: cards[0].item.sourceId,
    alsoCredited: cards.slice(1).map((c) => c.item.sourceId),
    category: "other",
    keys: [...new Set(cards.flatMap((c) => c.story.items.map((it) => shareKey(it.link))))],
    words: [],
    subjects: cards.flatMap((c) => storySubjects(c.story)),
  };
}

/** The history without posts older than HISTORY_MS. */
export const recentHistory = (history: PostRecord[], now: number) =>
  history.filter((p) => now - Date.parse(p.at) < HISTORY_MS);
