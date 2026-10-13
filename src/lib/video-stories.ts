import { channelName } from "./bn-names";
import { CHANNELS } from "./channels";
import { type ClusterDoc, clusterTitles, keywords, outcomesOf, stem } from "./stories";
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
/** A hyphen after a word's first letter or two: "গু-ন্ডা", "বি-স্ফোরক" (not "শিক্ষক-শিক্ষার্থী"). */
const HYPHEN_MASK = /(?<![\u0980-\u09FF])([\u0980-\u09FF]{1,2})-(?=[\u0980-\u09FF])/g;
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
  // How long or about how much: "২২ ঘণ্টা ধরে", "প্রায় ৭ ঘণ্টা", "সাড়ে ৫ ঘণ্টা".
  "ধরে","প্রায়","সাড়ে",
  // Numbers up to 31 in words (dropped as digits too, see videoKeywords): times and dates, or counts
  // ("ছয় ঘণ্টা", "৬ ঘণ্টা") that channels give differently.
  "দুই","তিন","চার","পাঁচ","ছয়","সাত","আট","দশ","এগারো","বারো","পনেরো","বিশ",
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
  অগ্নিকাণ্ড: "আগুন",
  স্থগিত: "বাতিল",
  ক্ষেপণাস্ত্র: "মিসাইল",
};

const SPELLING_OF: Record<string, string> = {
  ণ: "ন",
  শ: "স",
  ষ: "স",
  "ী": "ি",
  "ূ": "ু",
  ঈ: "ই",
  ঊ: "উ",
};
const SPELLINGS = new RegExp(`[${Object.keys(SPELLING_OF).join("")}]`, "g");

/**
 * A word as titles' words are compared. keywords() strips one ending, so a word and its inflections
 * can part ("চকবাজার" → "চকবাজা" but "চকবাজারের" → "চকবাজার"); stripping until none is left brings
 * them together. And letters titles use one for another are made one: "ঘন্টা" and "ঘণ্টা", "শাহেদ"
 * and "সাহেদ", "শ্রেণী" and "শ্রেণি".
 */
function root(word: string): string {
  let w = word.replace(SPELLINGS, (c) => SPELLING_OF[c]);
  for (let s = stem(w); s !== w; s = stem(w)) w = s;
  return w;
}

/** A word as titles' words are compared, from the word as written ("গ্রেপ্তার" → "গ্রেপ্তা"). */
const stemmed = (word: string) => root(keywords(word)[0] ?? word);

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
    .replace(HYPHEN_MASK, "$1")
    .replace(SPACED, (run) => run.replaceAll(" ", ""));
  for (const stemmedOnce of keywords(clean)) {
    // Checked before root(): stripped further, words can turn into ignored ones ("মেয়ে" → "মে", May).
    if (ignored.has(stemmedOnce)) continue;
    const word = root(stemmedOnce);
    // Numbers up to 31 and years are times and dates; larger ones ("৩৫৩ জন আটক") are news.
    if (/^\d+$/.test(word) && (Number(word) <= 31 || /^(19|20)\d\d$/.test(word))) continue;
    // Clock times: "৫টা", "৬টার".
    if (/^\d+টা/.test(word)) continue;
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
 * Incidents: things that happen in one place, which channels follow all day from every angle
 * ("চকবাজারে বহুতল ভবনে আগুন", "৫ ঘণ্টাতেও নিয়ন্ত্রণে আসেনি", "সরু রাস্তা ও পানি সংকটে ভোগান্তি", "ছয়
 * ঘণ্টা পর নিয়ন্ত্রণে"). Those titles share too few words two by two to link, but the place's name
 * comes with the incident in nearly every title that has it: see incidentStories.
 */
// prettier-ignore
const INCIDENTS = [
  "আগুন","অগ্নিকাণ্ড","বিস্ফোরণ","ধস","ভবনধস","ভূমিকম্প","ডুবি","লঞ্চডুবি","নৌকাডুবি","সংঘর্ষ","দুর্ঘটনা",
];
/**
 * Words too general to name where an incident happened, however often they come with it on a day
 * with one big fire or crash.
 */
// prettier-ignore
const INCIDENT_GENERIC = [
  "রাজধানী","ভবন","বহুতল","বাণিজ্যিক","আবাসিক","মার্কেট","দোকান","কারখানা","গুদাম","বাড়ি","বস্তি","এলাকা",
  "ফায়ার","সার্ভিস","ইউনিট","নিয়ন্ত্রণ","ঘণ্টা","চেষ্টা","ভয়াবহ","ভয়াবহতা","নিহত","আহত","মৃত্যু","দগ্ধ","হতাহত",
  "সড়ক","মহাসড়ক","বাস","ট্রাক","ট্রেন","লঞ্চ","নৌকা","মোটরসাইকেল","অটোরিকশা","সিএনজি","গাড়ি","পুলিশ","ঘটনা",
  "দুই","পক্ষ","গ্রাম","উপজেলা","জেলা","শহর","বাজার","আজ","রাত","ভোর","লাগা","লাগল","পুড়ে","ছাই","ক্ষতি",
];
/** An incident and a word link titles when at least this many, from this many channels, have both... */
const INCIDENT_MIN_TITLES = 3;
const INCIDENT_MIN_CHANNELS = 3;
/** ...and the word comes with the incident in at least this share of the titles that have it. */
const INCIDENT_SHARE = 0.75;

let incidentLists: { incidents: Set<string>; generic: Set<string> } | undefined;
const incidentWords = () =>
  (incidentLists ??= {
    incidents: new Set(INCIDENTS.map(stemmed).map((w) => wordLists().same.get(w) ?? w)),
    generic: new Set(INCIDENT_GENERIC.map(stemmed)),
  });

/**
 * The titles about one incident, found by a place (or any name) that comes with it: "চকবাজার" in 29
 * titles, 28 of them with "আগুন". Each set is the titles with both, from enough channels, split where
 * more than MAX_GAP_MS passes between two of them, so two fires a day apart stay apart.
 */
function incidentStories(docs: ClusterDoc[], titleOutcomes: number[]): number[][] {
  const { incidents, generic } = incidentWords();
  const titlesWith = new Map<string, number[]>();
  docs.forEach((d, i) => {
    for (const w of d.words) {
      const list = titlesWith.get(w);
      if (list) list.push(i);
      else titlesWith.set(w, [i]);
    }
  });
  const stories: number[][] = [];
  for (const incident of incidents) {
    const withIncident = new Set(titlesWith.get(incident) ?? []);
    if (withIncident.size < INCIDENT_MIN_TITLES) continue;
    const anchors = new Set<string>();
    for (const i of withIncident)
      for (const w of docs[i].words) if (!incidents.has(w) && !generic.has(w)) anchors.add(w);
    for (const anchor of anchors) {
      const all = titlesWith.get(anchor)!;
      const both = all.filter((i) => withIncident.has(i));
      if (both.length < INCIDENT_MIN_TITLES || both.length < all.length * INCIDENT_SHARE) continue;
      // Titles telling another outcome than most of them do (killed, where most say arrested) stay out.
      const counts = new Map<number, number>();
      for (const i of both) if (titleOutcomes[i]) counts.set(titleOutcomes[i], (counts.get(titleOutcomes[i]) ?? 0) + 1);
      const usual = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
      const kept = both
        .filter((i) => !titleOutcomes[i] || !usual || titleOutcomes[i] & usual)
        .sort((a, b) => Date.parse(docs[a].time ?? "") - Date.parse(docs[b].time ?? ""));
      let part: number[] = [];
      const close = () => {
        if (
          part.length >= INCIDENT_MIN_TITLES &&
          new Set(part.map((i) => docs[i].source)).size >= INCIDENT_MIN_CHANNELS
        )
          stories.push(part);
      };
      for (const i of kept) {
        const last = part[part.length - 1];
        if (last !== undefined && Date.parse(docs[i].time ?? "") - Date.parse(docs[last].time ?? "") > MAX_GAP_MS) {
          close();
          part = [];
        }
        part.push(i);
      }
      close();
    }
  }
  return stories;
}

/** A video left alone joins a story when it has this much of the story's core (by weight)... */
const CORE_COVER = 0.8;

/**
 * Videos left alone, each to the story whose core (the words in more than half its videos) it has
 * nearly all of: "ক্যাম্পাস ত্যাগের আলটিমেটাম পার হতেই অবরুদ্ধ চুয়েট উপাচার্য" to the story of the
 * confined CUET VC (core চুয়েট, উপাচার্য, অবরুদ্ধ), though it shares too little with any one of its
 * videos. At least MIN_SHARED core words, within MAX_GAP_MS of the story, and not telling another
 * outcome; and the story is from two channels already. Cores are worked out once, so joining doesn't drift. In place.
 */
function attachSingles(
  groups: number[][],
  docs: ClusterDoc[],
  byRoot: Map<number, number[]>,
  outcomeOf: (words: Iterable<string>) => number,
) {
  const df = new Map<string, number>();
  for (const d of docs) for (const w of d.words) df.set(w, (df.get(w) ?? 0) + 1);
  const weight = (w: string) => Math.log(docs.length / (df.get(w) ?? 1));
  const times = docs.map((d) => Date.parse(d.time ?? ""));
  const cores = groups.map((members) => {
    const n = new Map<string, number>();
    for (const i of members) for (const w of docs[i].words) n.set(w, (n.get(w) ?? 0) + 1);
    const words = [...n].filter(([, k]) => k >= 2 && k * 2 > members.length).map(([w]) => w);
    return {
      words,
      mass: words.reduce((sum, w) => sum + weight(w), 0),
      outcome: outcomeOf(words),
      // Only stories two channels tell take others in: not one channel's repeats of a programme.
      channels: new Set(members.map((i) => docs[i].source)).size > 1,
      first: Math.min(...members.map((i) => times[i])),
      last: Math.max(...members.map((i) => times[i])),
    };
  });
  for (const [single] of [...byRoot.values()].filter((m) => m.length === 1)) {
    const words = new Set(docs[single].words);
    const outcome = outcomeOf(words);
    const t = times[single];
    let best = -1;
    let bestCover = CORE_COVER;
    cores.forEach((core, g) => {
      if (!core.channels) return;
      if (core.words.length < MIN_SHARED || t < core.first - MAX_GAP_MS || t > core.last + MAX_GAP_MS) return;
      if (outcome && core.outcome && !(outcome & core.outcome)) return;
      const shared = core.words.filter((w) => words.has(w));
      if (shared.length < MIN_SHARED) return;
      const cover = shared.reduce((sum, w) => sum + weight(w), 0) / core.mass;
      if (cover >= bestCover) [best, bestCover] = [g, cover];
    });
    if (best >= 0) groups[best].push(single);
  }
}

/**
 * The videos as groups, in the feed's order (newest first, by each group's newest video). Videos no
 * other channel has are groups of one. Pure; fast enough for the browser (a day's ~800 videos in a
 * few milliseconds).
 */
export function groupVideos(videos: Video[]): VideoGroup[] {
  const docs: ClusterDoc[] = videos.map((v) => ({
    words: videoKeywords(v.title),
    source: v.channel,
    time: v.publishedAt,
  }));
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
  // Titles that cluster, and titles about one incident, join (with each other's groups).
  const parent = videos.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  const join = (members: number[]) => members.forEach((i) => (parent[find(i)] = find(members[0])));
  clusters.forEach(join);
  const outcomeOf = outcomesOf(outcomeWords());
  incidentStories(
    docs,
    docs.map((d) => outcomeOf(d.words)),
  ).forEach(join);
  const byRoot = new Map<number, number[]>();
  videos.forEach((_, i) => {
    const r = find(i);
    const list = byRoot.get(r);
    if (list) list.push(i);
    else byRoot.set(r, [i]);
  });
  const joined = [...byRoot.values()].filter((m) => m.length > 1);
  attachSingles(joined, docs, byRoot, outcomeOf);
  // A story is news from two channels or more: one channel's videos alone stay apart.
  for (let g = joined.length - 1; g >= 0; g--)
    if (new Set(joined[g].map((i) => docs[i].source)).size < 2) joined.splice(g, 1);
  joined.forEach((members, g) => members.forEach((i) => (groupOf[i] = g)));

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
    const members = joined[g].map((k) => videos[k]).sort(newest);
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
