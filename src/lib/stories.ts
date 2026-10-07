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
  /** Stable while the lead headline stays the same. */
  id: string;
  /** The headline most similar to the rest of the story. */
  lead: NewsItem;
  /** Every headline in the story, the lead first, then newest first. One per outlet. */
  items: NewsItem[];
  /** Number of distinct outlets. */
  outlets: number;
  /** Most recent time in the story, if any headline has one. */
  latest?: string;
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

/** The time used for ordering: the publish time, or when Deshboard first saw the headline. */
export function itemTime(it: NewsItem): string | undefined {
  return it.publishedAt ?? it.seenAt;
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

// Longest first. Stripped only when at least two letters remain.
const BN_SUFFIXES = ["গুলোর", "গুলো", "দের", "য়ের", "য়", "ের", "েরা", "কে", "তে", "টির", "টি", "টা", "র", "রা", "ে"];
const BN_DIGITS = /[০-৯]/g;

function stem(word: string): string {
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

/** Groups headlines into stories covered by several outlets, most-covered first. */
export function findStories(items: NewsItem[], options: StoryOptions = {}): Story[] {
  const { minOutlets = 2, maxAgeMs = 36 * 3600_000, now = Date.now() } = options;
  const cutoff = new Date(now - maxAgeMs).toISOString();

  // One headline per link; recent (or undated: homepage headlines are current by definition).
  const seen = new Set<string>();
  const docs: { item: NewsItem; words: string[] }[] = [];
  for (const item of items) {
    const t = itemTime(item);
    if (seen.has(item.link) || (t && t < cutoff)) continue;
    seen.add(item.link);
    docs.push({ item, words: keywords(item.title) });
  }
  if (docs.length < 2) return [];

  // Document frequency → weight (inverse document frequency). Very common words still count
  // towards a headline's weight (so they can tell two headlines apart) but never link two headlines.
  const df = new Map<string, number>();
  for (const d of docs) for (const w of d.words) df.set(w, (df.get(w) ?? 0) + 1);
  const maxDf = Math.max(3, Math.ceil(docs.length * MAX_DF_SHARE));
  const weight = new Map<string, number>();
  for (const [w, n] of df) weight.set(w, Math.log(docs.length / n));

  const vecs = docs.map((d) => d.words);
  const sets = vecs.map((ws) => new Set(ws));
  const mass = vecs.map((ws) => ws.reduce((sum, w) => sum + weight.get(w)!, 0));

  /** The link score of two headlines, 0 when they are not about the same event. */
  const similarity = (i: number, j: number) => {
    let w = 0;
    let n = 0;
    for (const word of vecs[i]) {
      if (!sets[j].has(word)) continue;
      w += weight.get(word)!;
      n++;
    }
    if (n < MIN_SHARED || !mass[i] || !mass[j] || w / Math.max(mass[i], mass[j]) < LINK_THRESHOLD_MAX) return 0;
    const score = w / Math.min(mass[i], mass[j]);
    return score >= LINK_THRESHOLD ? score : 0;
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

  // Union-find over linked pairs; `affinity` remembers how central each headline is.
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
      if (docs[i].item.sourceId === docs[j].item.sourceId) continue;
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

  // Links chain: A~B and B~C can join two different events through a bridging headline. Split each
  // group around its most central headlines: each takes the remaining members close to it.
  const clusters: number[][] = [];
  for (const members of groups.values()) {
    if (members.length < minOutlets) continue;
    if (members.length === 2) {
      clusters.push(members);
      continue;
    }
    const left = members.sort((a, b) => affinity[b] - affinity[a]);
    while (left.length) {
      const lead = left.shift()!;
      const cluster = [lead];
      for (let k = left.length - 1; k >= 0; k--) {
        if (similarity(lead, left[k])) cluster.push(...left.splice(k, 1));
      }
      clusters.push(cluster);
    }
  }

  const stories: Story[] = [];
  for (const [leadIdx, ...members] of clusters) {
    // One headline per outlet: the one closest to the lead.
    const byOutlet = new Map<string, number>([[docs[leadIdx].item.sourceId, leadIdx]]);
    const closeness = (i: number) => similarity(leadIdx, i);
    for (const i of members) {
      const id = docs[i].item.sourceId;
      const cur = byOutlet.get(id);
      if (cur === undefined || (cur !== leadIdx && closeness(i) > closeness(cur))) byOutlet.set(id, i);
    }
    if (byOutlet.size < minOutlets) continue;

    const picked = [...byOutlet.values()];
    const lead = docs[leadIdx].item;
    const rest = picked
      .filter((i) => i !== leadIdx)
      .map((i) => docs[i].item)
      .sort((a, b) => newestFirst(itemTime(a), itemTime(b)));
    const latest = picked
      .map((i) => itemTime(docs[i].item))
      .reduce<string | undefined>((a, b) => (b && (!a || b > a) ? b : a), undefined);
    stories.push({ id: lead.link, lead, items: [lead, ...rest], outlets: byOutlet.size, latest });
  }

  return stories.sort((a, b) => b.outlets - a.outlets || newestFirst(a.latest, b.latest));
}
