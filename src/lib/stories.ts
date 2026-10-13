import type { NewsItem } from "./types";

/**
 * Groups headlines from different outlets that report the same event, so the stories most outlets
 * are covering can be ranked first. Pure and fast enough to run in the browser on every update
 * (~5,000 headlines in a few tens of milliseconds).
 *
 * Headlines are reduced to weighted keywords: rare words (names, places, numbers) count for more
 * than common ones. Two headlines from different outlets are linked when most of the weight of the
 * shorter one is shared; linked headlines form a story. Bangla and English
 * headlines never share keywords, so each story stays in one language.
 */

export interface Story {
  /**
   * The link of its first headline (the earliest, by time then link): stays the same as outlets join and
   * the lead changes, so an open story stays open across updates.
   */
  id: string;
  /** The headline most similar to the rest of the story. */
  lead: NewsItem;
  /** Every headline in the story, the lead first, then newest first. One per outlet. */
  items: NewsItem[];
  /** Number of distinct outlets. */
  outlets: number;
  /** Most recent time in the story, if any headline has one. */
  latest?: string;
  /** What stories are ranked by: its outlets, each counting less the older its headline (see HALF_LIFE_MS). */
  heat: number;
}

export interface StoryOptions {
  /** Only stories covered by at least this many outlets are returned. Default 2. */
  minOutlets?: number;
  /** Headlines older than this are left out. Default 36 hours. */
  maxAgeMs?: number;
  now?: number;
}

/**
 * Linked when the shared keywords carry at least this share of the lighter headline's weight...
 * (lenient, since outlets add their own detail to the same core facts)
 */
const LINK_THRESHOLD = 0.6;
/** ...and this share of the heavier one's, so a short generic headline can't swallow longer ones. */
const LINK_THRESHOLD_MAX = 0.4;
/** ...and at least this many keywords are shared. */
const MIN_SHARED = 2;
/** Words in more than this share of headlines are too common to link two headlines on their own. */
const MAX_DF_SHARE = 0.02;
/**
 * An outlet's headline counts half as much towards its story's rank after this long, so a story still
 * being covered comes before a bigger one from yesterday. Undated headlines (homepage ones) count fully.
 */
const HALF_LIFE_MS = 12 * 3600_000;

/** The time used for ordering: the publish time, or when Bartaboard first saw the headline. */
export function itemTime(it: NewsItem): string | undefined {
  return it.publishedAt ?? it.seenAt;
}

/** Steps of NewsSeed.ages: a minute each, over the 72 hours the board keeps; the last holds anything older. */
const AGE_STEP_MS = 60_000;
const AGE_STEPS = (72 * 3600_000) / AGE_STEP_MS;

/** How many headlines are how old at `generatedAt`, in AGE_STEP_MS steps. Undated headlines aren't counted. */
export function ageSteps(items: NewsItem[], generatedAt: string): number[] {
  const at = Date.parse(generatedAt);
  const steps = new Array<number>(AGE_STEPS).fill(0);
  for (const it of items) {
    const t = Date.parse(itemTime(it) ?? "");
    if (Number.isNaN(t)) continue;
    steps[Math.min(Math.max(Math.floor((at - t) / AGE_STEP_MS), 0), AGE_STEPS - 1)]++;
  }
  // Trailing empty steps left out, to keep the file small.
  let end = steps.length;
  while (end > 0 && !steps[end - 1]) end--;
  return steps.slice(0, end);
}

/**
 * About how many headlines are later than `since`, from ageSteps: the step `since` falls in counts in
 * proportion to the part of it that is later.
 */
export function countSince(ages: number[], generatedAt: string, since: string): number {
  const later = (Date.parse(generatedAt) - Date.parse(since)) / AGE_STEP_MS;
  let n = 0;
  for (let i = 0; i < ages.length && i < later; i++) n += ages[i] * Math.min(later - i, 1);
  return Math.round(n);
}

/**
 * ISO times compared as plain strings, newest first; no time ("" or undefined) goes last. Not
 * localeCompare: the first call loads the browser's collation data, a pause on a slow phone.
 */
export function newestFirst(a: string | undefined, b: string | undefined): number {
  const x = a ?? "";
  const y = b ?? "";
  return x < y ? 1 : x > y ? -1 : 0;
}

// prettier-ignore
const STOPWORDS = new Set([
  // English
  "a","an","the","and","or","but","of","in","on","at","to","for","from","by","with","as","is","are","was","were",
  "be","been","has","have","had","it","its","this","that","these","those","after","before","over","under","into",
  "amid","says","say","said","will","would","can","could","not","no","new","more","than","up","out","about","his",
  "her","their","they","he","she","we","you","who","what","why","how","when","where","all","also","may","just",
  "bangladesh","bd","dhaka","govt","government","day","year","today","news","video","photos","live","update",
  // Bangla
  "ও","এবং","বা","না","নয়","হয়","হবে","হলো","হল","হয়েছে","করে","করা","করতে","করেছে","করবে","করলেন","করেন","বলে",
  "বললেন","বলেন","দিয়ে","দিলেন","নিয়ে","থেকে","জন্য","পর","পরে","আগে","মধ্যে","সঙ্গে","সাথে","কাছে","ওপর","উপর",
  "এই","সেই","যে","কি","কী","কে","কেন","কোন","তার","তাদের","আর","আরও","এক","একটি","এখন","আজ","বছর","দিন","শুরু",
  "চায়","চান","নেই","আছে","গেল","গেছে","যাবে","যায়","হচ্ছে","দেশ","দেশের","বাংলাদেশ","ঢাকা","সরকার","প্রধান",
  "নতুন","বিষয়","মতো","বেশি","কম","সব","সবার","শেষ","ভিডিও","ছবি","লাইভ",
]);

// Longest first. Stripped only when at least two letters remain. The search box (search.ts) stems with these too.
const BN_SUFFIXES = ["গুলোর", "গুলো", "দের", "য়ের", "য়", "ের", "েরা", "কে", "তে", "টির", "টি", "টা", "র", "রা", "ে"];
const BN_DIGITS = /[০-৯]/g;

export function stem(word: string): string {
  if (/^[a-z0-9]+$/.test(word)) {
    if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
    return word;
  }
  for (const suffix of BN_SUFFIXES) {
    if (word.endsWith(suffix) && [...word.slice(0, -suffix.length)].length >= 2) {
      return word.slice(0, -suffix.length);
    }
  }
  return word;
}

/** Distinct keywords of a headline. */
export function keywords(title: string): string[] {
  const words = title
    .normalize("NFC")
    .toLowerCase()
    .replace(BN_DIGITS, (d) => String(d.charCodeAt(0) - 0x09e6))
    .replace(/[’']s\b/g, "")
    .split(/[^\p{L}\p{M}\p{N}]+/u);
  const out = new Set<string>();
  for (const w of words) {
    if (!w || STOPWORDS.has(w)) continue;
    if (/^\d+$/.test(w) && w.length < 2) continue;
    const s = stem(w);
    if ([...s].length < 2 || STOPWORDS.has(s)) continue;
    out.add(s);
  }
  return [...out];
}

/** A title to group: its keywords, who published it, and when (ISO; undefined if unknown). */
export interface ClusterDoc {
  words: string[];
  source: string;
  time?: string;
}

export interface ClusterOptions {
  /** Shared keywords' share of the lighter title's weight needed to link two titles. */
  linkThreshold?: number;
  /** ...and of the heavier one's. */
  linkThresholdMax?: number;
  /** ...and the fewest keywords they must share. */
  minShared?: number;
  /** Titles further apart in time than this never link (both need a time). */
  maxGapMs?: number;
  /**
   * Each group keeps one title per source, the one closest to its lead (Top stories). Off, a source's
   * several takes on the story all join it (Videos: a channel's follow-ups).
   */
  onePerSource?: boolean;
  /**
   * One story told in many ways (a fire, its toll, the firefighting) stays one group: after splitting
   * a chained group, parts whose leads link are joined again, and a title left on its own joins the
   * part it links to most when that's two or more of its titles. Then groups whose cores link (the
   * words most of their titles share, held to the same thresholds) are joined.
   */
  rejoin?: boolean;
  /**
   * Sets of words for outcomes that rule each other out (killed / arrested / remanded…). Two titles
   * that each name one, but not the same one, are different events however much else they share.
   */
  exclusive?: string[][];
}

/**
 * Groups titles from different sources that are about the same event: the shared core of Top stories
 * and the Videos view. Returns groups of indices into `docs`, each led by its most central title, with
 * every other member linked to that lead (links don't chain). Single titles are left out.
 */
export function clusterTitles(docs: ClusterDoc[], options: ClusterOptions = {}): number[][] {
  const {
    linkThreshold = LINK_THRESHOLD,
    linkThresholdMax = LINK_THRESHOLD_MAX,
    minShared = MIN_SHARED,
    maxGapMs = Infinity,
    onePerSource = true,
    rejoin = false,
    exclusive = [],
  } = options;
  if (docs.length < 2) return [];

  // Document frequency → weight (inverse document frequency). Very common words still count
  // towards a title's weight (so they can tell two titles apart) but never link two titles.
  const df = new Map<string, number>();
  for (const d of docs) for (const w of d.words) df.set(w, (df.get(w) ?? 0) + 1);
  const maxDf = Math.max(3, Math.ceil(docs.length * MAX_DF_SHARE));
  const weight = new Map<string, number>();
  for (const [w, n] of df) weight.set(w, Math.log(docs.length / n));

  const vecs = docs.map((d) => d.words);
  const sets = vecs.map((ws) => new Set(ws));
  const mass = vecs.map((ws) => ws.reduce((sum, w) => sum + weight.get(w)!, 0));
  const times = docs.map((d) => (d.time ? Date.parse(d.time) : NaN));
  const outcomes = outcomesOf(exclusive);
  const outcome = vecs.map(outcomes);

  /** The link score of two titles, 0 when they are not about the same event. */
  const similarity = (i: number, j: number) => {
    if (Math.abs(times[i] - times[j]) > maxGapMs || clash(outcome[i], outcome[j])) return 0;
    let w = 0;
    let n = 0;
    for (const word of vecs[i]) {
      if (!sets[j].has(word)) continue;
      w += weight.get(word)!;
      n++;
    }
    if (n < minShared || !mass[i] || !mass[j] || w / Math.max(mass[i], mass[j]) < linkThresholdMax) return 0;
    const score = w / Math.min(mass[i], mass[j]);
    return score >= linkThreshold ? score : 0;
  };

  const postings = new Map<string, number[]>();
  vecs.forEach((ws, i) => {
    for (const w of ws) {
      if (df.get(w)! > maxDf) continue;
      const list = postings.get(w);
      if (list) list.push(i);
      else postings.set(w, [i]);
    }
  });

  // Union-find over linked pairs; `affinity` remembers how central each title is.
  const parent = docs.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  const affinity = new Float64Array(docs.length);

  // Candidates share at least one uncommon word; only those are scored.
  const candidates = new Set<number>();
  for (let i = 0; i < docs.length; i++) {
    candidates.clear();
    for (const w of vecs[i]) for (const j of postings.get(w) ?? []) if (j > i) candidates.add(j);
    for (const j of candidates) {
      if (docs[i].source === docs[j].source) continue;
      const score = similarity(i, j);
      if (!score) continue;
      parent[find(i)] = find(j);
      affinity[i] += score;
      affinity[j] += score;
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < docs.length; i++) {
    const root = find(i);
    const g = groups.get(root);
    if (g) g.push(i);
    else groups.set(root, [i]);
  }

  // Links chain: A~B and B~C can join two different events through a bridging title. Split each
  // group around its most central titles: each takes the remaining members close to it.
  const clusters: number[][] = [];
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const left = members.sort((a, b) => affinity[b] - affinity[a]);
    const parts: number[][] = [];
    while (left.length) {
      const lead = left.shift()!;
      const part = [lead];
      for (let k = left.length - 1; k >= 0; k--) if (similarity(lead, left[k])) part.push(...left.splice(k, 1));
      parts.push(part);
    }
    if (rejoin && parts.length > 1) rejoinParts(parts, similarity);
    for (const [lead, ...rest] of parts) {
      let picked = rest;
      if (onePerSource) {
        // One title per source: the one closest to the lead.
        const bySource = new Map<string, number>();
        for (const i of rest) {
          if (docs[i].source === docs[lead].source) continue;
          const cur = bySource.get(docs[i].source);
          if (cur === undefined || similarity(lead, i) > similarity(lead, cur)) bySource.set(docs[i].source, i);
        }
        picked = [...bySource.values()];
      }
      if (picked.some((i) => docs[i].source !== docs[lead].source)) clusters.push([lead, ...picked]);
    }
  }
  if (rejoin) joinByCore(clusters, docs, weight, { linkThreshold, linkThresholdMax, minShared, maxGapMs, exclusive });
  return clusters;
}

/** See ClusterOptions.rejoin. Parts are led by their first title, most central first; joins in place. */
function rejoinParts(parts: number[][], similarity: (i: number, j: number) => number) {
  for (let p = 1; p < parts.length; p++) {
    const part = parts[p];
    let into = -1;
    if (part.length > 1) {
      into = parts.findIndex((q, k) => k < p && similarity(q[0], part[0]) > 0);
    } else {
      let best = 1;
      parts.forEach((q, k) => {
        if (k === p || q.length < 2) return;
        const links = q.reduce((n, i) => n + (similarity(i, part[0]) > 0 ? 1 : 0), 0);
        if (links > best) [best, into] = [links, k];
      });
    }
    if (into < 0) continue;
    parts[into].push(...part);
    parts.splice(p--, 1);
  }
}

/** Which of the `exclusive` sets a title's words name, as a bit mask (0: none). */
export function outcomesOf(exclusive: string[][]): (words: Iterable<string>) => number {
  const bit = new Map<string, number>();
  exclusive.forEach((set, k) => set.forEach((w) => bit.set(w, (bit.get(w) ?? 0) | (1 << k))));
  return (words) => {
    let mask = 0;
    for (const w of words) mask |= bit.get(w) ?? 0;
    return mask;
  };
}

/** Both name an outcome and they have none in common. */
const clash = (a: number, b: number) => !!a && !!b && !(a & b);

/**
 * See ClusterOptions.rejoin. A group's core is the words in at least half its titles (in both, for two).
 * Biggest groups first, each later group joins the first whose core links to its own; cores aren't
 * updated as groups grow, so joins don't chain. Joins in place.
 */
function joinByCore(
  clusters: number[][],
  docs: ClusterDoc[],
  weight: Map<string, number>,
  { linkThreshold, linkThresholdMax, minShared, maxGapMs, exclusive }: Required<Omit<ClusterOptions, "onePerSource" | "rejoin">>,
) {
  const outcomes = outcomesOf(exclusive);
  clusters.sort((a, b) => b.length - a.length);
  const cores = clusters.map((c) => {
    const n = new Map<string, number>();
    for (const i of c) for (const w of docs[i].words) n.set(w, (n.get(w) ?? 0) + 1);
    const words = [...n].filter(([, k]) => k * 2 >= c.length && k >= 2).map(([w]) => w);
    const times = c.map((i) => Date.parse(docs[i].time ?? "")).filter((t) => !Number.isNaN(t));
    return {
      words: new Set(words),
      outcome: outcomes(words),
      mass: words.reduce((sum, w) => sum + weight.get(w)!, 0),
      first: Math.min(...times),
      last: Math.max(...times),
    };
  });
  const links = (a: (typeof cores)[number], b: (typeof cores)[number]) => {
    if (a.first - b.last > maxGapMs || b.first - a.last > maxGapMs || clash(a.outcome, b.outcome)) return false;
    let w = 0;
    let n = 0;
    for (const word of a.words) {
      if (!b.words.has(word)) continue;
      w += weight.get(word)!;
      n++;
    }
    return (
      n >= minShared &&
      !!a.mass &&
      !!b.mass &&
      w / Math.max(a.mass, b.mass) >= linkThresholdMax &&
      w / Math.min(a.mass, b.mass) >= linkThreshold
    );
  };
  for (let k = 1; k < clusters.length; k++) {
    const into = cores.findIndex((core, j) => j < k && links(core, cores[k]));
    if (into < 0) continue;
    clusters[into].push(...clusters[k]);
    clusters.splice(k, 1);
    cores.splice(k--, 1);
  }
}

/** Groups headlines into stories covered by several outlets, the most covered lately first (see Story.heat). */
export function findStories(items: NewsItem[], options: StoryOptions = {}): Story[] {
  const { minOutlets = 2, maxAgeMs = 36 * 3600_000, now = Date.now() } = options;
  const cutoff = new Date(now - maxAgeMs).toISOString();

  // One headline per link; recent (or undated: homepage headlines are current by definition).
  const seen = new Set<string>();
  const docs: (ClusterDoc & { item: NewsItem })[] = [];
  for (const item of items) {
    const t = itemTime(item);
    if (seen.has(item.link) || (t && t < cutoff)) continue;
    seen.add(item.link);
    docs.push({ item, words: keywords(item.title), source: item.sourceId });
  }

  const stories: Story[] = [];
  for (const cluster of clusterTitles(docs)) {
    if (cluster.length < minOutlets) continue;
    const [lead, ...rest] = cluster.map((i) => docs[i].item);
    rest.sort((a, b) => newestFirst(itemTime(a), itemTime(b)));
    let latest: string | undefined;
    let heat = 0;
    for (const i of cluster) {
      const t = itemTime(docs[i].item);
      if (t && (!latest || t > latest)) latest = t;
      heat += t ? 0.5 ** (Math.max(now - Date.parse(t), 0) / HALF_LIFE_MS) : 1;
    }
    let first = lead;
    for (const it of rest) {
      const a = itemTime(it) ?? "\uffff";
      const b = itemTime(first) ?? "\uffff";
      if (a < b || (a === b && it.link < first.link)) first = it;
    }
    stories.push({ id: first.link, lead, items: [lead, ...rest], outlets: cluster.length, latest, heat });
  }

  return stories.sort((a, b) => b.heat - a.heat || b.outlets - a.outlets || newestFirst(a.latest, b.latest));
}
