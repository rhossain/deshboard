import { channelName } from "./bn-names";
import { CHANNELS } from "./channels";
import { type ClusterDoc, clusterTitles, keywords } from "./stories";
import type { Video } from "./types";

/**
 * Groups videos from different TV channels that report the same news, so the Videos view shows one
 * card per story with the other channels' takes beneath it (see VideoBoard).
 *
 * Built on the same matching as Top stories (clusterTitles), with three things video titles need:
 * - Channels mask touchy words ("গ্রে/প্তা/র", "হা'ম'লা", "বি*স্ফো*রক"); the marks are taken out so
 *   the word is whole again.
 * - Bulletins ("সন্ধ্যা ৬টার সংবাদ · ১২ অক্টোবর ২০২৬") share their words with every other channel's
 *   bulletin but no news: channel names, bulletin words, times of day, dates and small numbers never
 *   count, so a bulletin is left with too little to link on.
 * - Stricter links than for headlines: video titles are longer and wordier, and a wrong group (two
 *   stories about the same person, say) is worse than two cards for one story.
 */

/** A group of videos about one story from two or more channels (a channel may have several), newest first. */
export interface VideoGroup {
  /** The newest video's id; stable while that stays the newest. */
  id: string;
  videos: Video[];
}

/** Marks inside a word, between two letters: "গ্রে/প্তা/র", "কি'শো'র", "বি*স্ফো*রক", "আ\\গুন", "আ~গু~ন", "আ.লীগ". */
const MASKS = /(?<=[\p{L}\p{M}])(?:[/\\*'’‘.~]+|\/\s)(?=[\p{L}\p{M}])/gu;
/** Zero-width joiners and non-joiners, which some channels leave inside or after words. */
const INVISIBLE = /[\u200b-\u200d\u2060\ufeff]/g;

// prettier-ignore
const BULLETIN_WORDS = [
  // Bulletins and programmes
  "সংবাদ","খবর","শিরোনাম","নিউজ","টপ","টেন","বুলেটিন","প্রতিদিন","সারাদেশ","দেশজুড়ে","আজকে","আজকের",
  "সরাসরি","প্রমো","পর্ব","টকশো","বিস্তারিত","একনজরে","news","top","ten","bulletin","headlines","live","episode",
  "full","tv","channel","shorts","promo","talk","show","exclusive",
  // Times of day
  "সকাল","দুপুর","বিকেল","বিকাল","সন্ধ্যা","রাত","ভোর","টা","টায়","টার","ঘটিকা","তারিখ","am","pm",
  // Months and days
  "জানুয়ারি","ফেব্রুয়ারি","মার্চ","এপ্রিল","মে","জুন","জুলাই","আগস্ট","সেপ্টেম্বর","অক্টোবর","অক্টোবরর","নভেম্বর","ডিসেম্বর",
  "january","february","march","april","may","june","july","august","september","october","november","december",
  "শনিবার","রবিবার","সোমবার","মঙ্গলবার","বুধবার","বৃহস্পতিবার","শুক্রবার",
];

/** Two spellings of one thing, counted as one word. */
const SAME_WORDS: Record<string, string> = {
  ভিসি: "উপাচার্য",
  vc: "উপাচার্য",
  গ্রেফতার: "গ্রেপ্তার",
  সোনা: "স্বর্ণ",
  আলীগ: "আওয়ামী",
};

/** A word as titles' words are compared: stemmed by keywords() ("গ্রেপ্তার" → "গ্রেপ্তা"). */
const stemmed = (word: string) => keywords(word)[0] ?? word;

let words: { ignored: Set<string>; same: Map<string, string> } | undefined;
/**
 * Words that never link two videos (the bulletin words above, and every channel's name in both
 * languages), and SAME_WORDS stemmed. Worked out on first use.
 */
function wordLists() {
  if (words) return words;
  const names = CHANNELS.flatMap((c) => [c.name, channelName(c.id, c.name, "bn")]).join(" ");
  words = {
    ignored: new Set([...keywords(BULLETIN_WORDS.join(" ")), ...keywords(names)]),
    same: new Map(Object.entries(SAME_WORDS).map(([a, b]) => [stemmed(a), stemmed(b)])),
  };
  return words;
}

/**
 * A word spelt out in loose letters, "আ গু ন" or "নি হ ত": three or more Bangla pieces of one or two
 * characters in a row. Real words that short ("ও", "না") don't come three at a time.
 */
const SPACED = /(?<![\u0980-\u09FF])[\u0980-\u09FF]{1,2}(?: [\u0980-\u09FF]{1,2}){2,}(?![\u0980-\u09FF])/g;

/** The words of a video title that say what it is about. */
export function videoKeywords(title: string): string[] {
  const { ignored, same } = wordLists();
  const out = new Set<string>();
  const clean = title
    .normalize("NFC")
    .replace(INVISIBLE, "")
    .replace(MASKS, "")
    .replace(SPACED, (run) => run.replaceAll(" ", ""));
  for (const word of keywords(clean)) {
    // Numbers up to 31 and years are times and dates; larger ones ("৩৫৩ জন আটক") are news.
    if (/^\d+$/.test(word) && (Number(word) <= 31 || /^(19|20)\d\d$/.test(word))) continue;
    // Clock times: "৫টা", "৬টার".
    if (/^\d+টা/.test(word)) continue;
    if (ignored.has(word)) continue;
    out.add(same.get(word) ?? word);
  }
  return [...out];
}

/**
 * Linked when the shared words carry this much of the lighter title's weight (Top stories: 0.6)...
 * Tuned on two days' feeds (350 and 780 videos) by reading every group: stricter splits one story
 * into several cards; looser starts joining different events.
 */
const LINK_THRESHOLD = 0.55;
/** ...and of the heavier one's (Top stories: 0.4)... */
const LINK_THRESHOLD_MAX = 0.4;
/** ...and at least this many words are shared... */
const MIN_SHARED = 3;
/** ...and the two came out within this long of each other. */
const MAX_GAP_MS = 12 * 3600_000;
/**
 * ...and they don't tell different outcomes for the same people: "শীর্ষ সন্ত্রাসী নিহত" and "শীর্ষ
 * সন্ত্রাসী গ্রেপ্তার" are two events.
 */
// prettier-ignore
const OUTCOMES = [
  ["নিহত", "মৃত্যু", "লাশ", "মরদেহ", "প্রাণ"],
  ["গ্রেপ্তার", "গ্রেফতার", "আটক"],
  ["রিমান্ড"],
  ["জামিন", "মুক্তি", "মুক্ত", "খালাস"],
];
let outcomes: string[][] | undefined;
const outcomeWords = () => (outcomes ??= OUTCOMES.map((set) => set.map(stemmed)));

/**
 * The videos as groups, in the feed's order (newest first, by each group's newest video). Videos no
 * other channel has are groups of one. Pure; fast enough for the browser (a day's ~800 videos in a
 * few milliseconds).
 */
export function groupVideos(videos: Video[]): VideoGroup[] {
  const docs: ClusterDoc[] = videos.map((v) => ({ words: videoKeywords(v.title), source: v.channel, time: v.publishedAt }));
  const groupOf = new Array<number>(videos.length).fill(-1);
  const clusters = clusterTitles(docs, {
    linkThreshold: LINK_THRESHOLD,
    linkThresholdMax: LINK_THRESHOLD_MAX,
    minShared: MIN_SHARED,
    maxGapMs: MAX_GAP_MS,
    onePerSource: false,
    rejoin: true,
    exclusive: outcomeWords(),
  });
  clusters.forEach((members, g) => members.forEach((i) => (groupOf[i] = g)));

  const newest = (a: Video, b: Video) => (a.publishedAt < b.publishedAt ? 1 : a.publishedAt > b.publishedAt ? -1 : 0);
  const groups: VideoGroup[] = [];
  const placed = new Set<number>();
  for (let i = 0; i < videos.length; i++) {
    const g = groupOf[i];
    if (g < 0) {
      groups.push({ id: videos[i].id, videos: [videos[i]] });
      continue;
    }
    // A group takes the place of its first video in the feed's order.
    if (placed.has(g)) continue;
    placed.add(g);
    const members = clusters[g].map((k) => videos[k]).sort(newest);
    groups.push({ id: members[0].id, videos: members });
  }
  return groups;
}

/**
 * The videos (untagged, newest first) with `story` set on each one in a group: the id of the group's newest video. Done once
 * as the feed is built, so readers' browsers only collect them (see VideoBoard).
 */
export function tagStories(videos: Video[]): Video[] {
  const story = new Map<string, string>();
  for (const g of groupVideos(videos)) if (g.videos.length > 1) for (const v of g.videos) story.set(v.id, g.id);
  return videos.map((v) => {
    const id = story.get(v.id);
    return id ? { ...v, story: id } : v;
  });
}
