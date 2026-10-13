import { stem } from "./stories";

/**
 * The search box's matching, for headlines and videos alike (docs/search.md). A query becomes a list of
 * terms, and a title matches when it has every term, in any order. Each term matches:
 *
 * - Other forms of the word: "নির্বাচনে" finds "নির্বাচনের", "elections" finds "election"
 * - Its equivalents in search-terms.ts: "flood" finds "বন্যা", "Chittagong" finds "Chattogram"
 * - However the Bangla was written: precomposed or decomposed য় ড় ঢ় ো ৌ, Bangla or English digits, invisible
 *   joiners, and in what the reader types, ি or ী and ু or ূ
 *
 * English matches at the start of a word: "rain" finds "rains", not "train". Bangla the reader types matches
 * inside words too, as it always has ("ভোট" finds "গণভোট"); its equivalents only at the start of one.
 */
export interface Search {
  matches(text: string): boolean;
  /** Where the terms occur in `text`, as [start, end) pairs in order, for highlighting. */
  ranges(text: string): [number, number][];
}

/** One way to write a term: group 1 is the character before the word, group 2 the term itself. */
interface Alternative {
  test: RegExp;
  all: RegExp;
}

const BN_DIGITS = /[০-৯]/g;
const JOINERS = /[\u200c\u200d]/g;
const SEPARATOR = /[^\p{L}\p{M}\p{N}]+/u;
const WORD_CHAR = /[\p{L}\p{M}\p{N}\u200c\u200d]/u;

/** Words left out of a query, unless the query is nothing else. */
// prettier-ignore
const STOPWORDS = new Set([
  "a","an","the","of","in","on","at","to","for","from","by","with","and","or","is","are","was","were","be",
  "ও","এবং","বা","এর","যে","থেকে","জন্য","নিয়ে","সঙ্গে","কি","কী",
].map((w) => w.normalize("NFC")));

function words(text: string): string[] {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(JOINERS, "")
    .replace(BN_DIGITS, (d) => String(d.charCodeAt(0) - 0x09e6))
    .replace(/[’']s\b/g, "")
    .split(SEPARATOR)
    .filter(Boolean);
}

/** The forms a typed word is looked up by: stemming twice catches "সরকারের" → "সরকার" → "সরকা". */
function forms(word: string): string[] {
  const once = stem(word);
  return [word, once, stem(once)];
}

/** One way of writing a group's meaning, as words, with the forms each word is known by. */
interface Phrase {
  group: string[][];
  words: string[];
  known: string[][];
}

// The word list (search-terms.ts): every way of writing each group, as lists of words, indexed by the forms
// of each phrase's first word so a query word finds its phrases at once. Empty until installSearchTerms:
// the page loads the list only once someone searches (see useSearch), and searches the words as typed until then.
const BY_FIRST = new Map<string, Phrase[]>();

/** Indexes the word list for compileSearch; once is enough. */
export function installSearchTerms(terms: string[][]): void {
  if (BY_FIRST.size) return;
  for (const group of terms.map((g) => g.map(words))) {
    for (const w of group) {
      const phrase: Phrase = { group, words: w, known: w.map((x) => [x, stem(x)]) };
      for (const key of new Set(phrase.known[0])) BY_FIRST.set(key, [...(BY_FIRST.get(key) ?? []), phrase]);
    }
  }
}

export function hasSearchTerms(): boolean {
  return BY_FIRST.size > 0;
}

/** Whether the query's words from `at` start with `phrase` (each word in any of its forms). */
function startsWith(query: string[][], at: number, phrase: Phrase): boolean {
  if (at + phrase.words.length > query.length) return false;
  return phrase.known.every((known, i) => query[at + i].some((f) => known.includes(f)));
}

/**
 * Characters that can be written more than one way, each as a regex that accepts every way: ো and ৌ, precomposed
 * or as two marks. Escaped here and below, so no editor can merge the two ways into one.
 */
// prettier-ignore
const VARIANTS: Record<string, string> = {
  "\u09cb": "(?:\u09cb|\u09c7\u09be)", "\u09cc": "(?:\u09cc|\u09c7\u09d7)",
};
/** Short and long ি/ী and ু/ূ, often mistyped: forgiven in what the reader types, not in search-terms.ts. */
// prettier-ignore
const LOOSE: Record<string, string> = {
  "\u09bf": "[\u09bf\u09c0]", "\u09c0": "[\u09bf\u09c0]", "\u09c1": "[\u09c1\u09c2]", "\u09c2": "[\u09c1\u09c2]",
};
const NUKTA = "\u09bc";
const PRECOMPOSED: Record<string, string> = {
  "\u09af": "\u09df",
  "\u09a1": "\u09dc",
  "\u09a2": "\u09dd",
};
const BANGLA = /[\u0980-\u09ff]/;
const NOT_WORD = "[^\\p{L}\\p{M}\\p{N}]";

function escape(ch: string): string {
  return ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A regex source for one word. */
function wordPattern(word: string, loose: boolean): string {
  const chars = [...word];
  let out = "";
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (/\d/.test(ch)) out += `[${ch}${String.fromCharCode(0x09e6 + Number(ch))}]`;
    else if (chars[i + 1] === NUKTA && PRECOMPOSED[ch]) {
      out += `(?:${ch}${NUKTA}|${PRECOMPOSED[ch]})`;
      i++;
    } else out += (loose && LOOSE[ch]) || VARIANTS[ch] || escape(ch);
    if (BANGLA.test(ch)) out += "[\u200c\u200d]*";
  }
  return out;
}

/**
 * One way to write a term. A word the reader typed is stemmed, so "বৃষ্টির" also finds "বৃষ্টিতে", and in Bangla
 * it may sit inside a word, as in the old search: "ভোট" finds "গণভোট". Words from search-terms.ts are already
 * plain (stemming "বৃষ্টি" would cut off its "টি"), and must start a word, so "train" → "রেলওয়ে" can't bring in
 * anything unexpected; an English one must also end it.
 */
/**
 * The endings a Bangla word takes in headlines: case, plural, emphasis ("ঢাকায়", "পুলিশের", "শিশুদের",
 * "সরকারও"). A word from search-terms.ts matches only with one of these, so "আসাম" doesn't find "আসামি"
 * (accused) and "ভূমি" doesn't find "ভূমিকম্প". Compounds worth finding are listed in their group instead.
 */
// prettier-ignore
const BN_ENDINGS = [
  "র", "ের", "এর", "ে", "য়", "তে", "কে", "দের", "দেরকে", "রা", "েরা", "য়ের", "য়ে", "টি", "টির", "টা", "গুলো",
  "গুলোর", "গুলোতে", "সহ", "ই", "ও", "েই", "েও", "রই", "রও", "তেই", "তেও", "কেই", "কেও", "য়ই", "য়ও", "দেরও",
].map((e) => wordPattern(e.normalize("NFC"), false)).join("|");

/** A stem this short ("শহ", "নগ", "সাগ": under 4 characters, vowel signs included) is too short to go anywhere. */
const SHORT_STEM = 4;

/**
 * A word the reader typed, stemmed: "বৃষ্টির" also finds "বৃষ্টিতে" and, inside or across words, "বজ্রবৃষ্টি" and
 * "বৃষ্টিপাত". A short stem can't go anywhere: "শহর" stems to "শহ", which would find "শহীদ", as "নগর" → "নগ"
 * would "জনগণ" and "খবর" → "খব" "রাখবে". Such a word is found as typed, anywhere ("মহানগর"), or its stem
 * starting a word and ending it, give or take an ending. A short word that wasn't stemmed goes anywhere, as
 * typed: it may be the start of a longer one still being typed ("ঢা" on the way to "ঢাকা").
 */
function typedPattern(word: string): string {
  const s = stem(word);
  if (!BANGLA.test(s) || s === word || [...s].length >= SHORT_STEM) return wordPattern(s, true);
  const stemmed = wordPattern(s, true);
  const whole = `(?:${BN_ENDINGS})?(?=${NOT_WORD}|$)`;
  // The stem first in both ways (the word starts with it), so the regex can look for it alone.
  const rest = wordPattern(word.slice(s.length), true);
  return `${stemmed}(?:${rest}|(?<=(?:^|${NOT_WORD})${stemmed})${whole})`;
}

function alternative(phrase: string[], typed: boolean): Alternative {
  const body = phrase.map((w) => (typed ? typedPattern(w) : wordPattern(w, false))).join(`${NOT_WORD}+`);
  const before = typed && BANGLA.test(phrase[0]) ? "()" : `(^|${NOT_WORD})`;
  // An equivalent is a whole word, give or take an ending: "flood" finds "floods", not "floodlit"; "বন্যা"
  // finds "বন্যায়", not a longer word. An English ending may double a consonant ("banned").
  const ending = BANGLA.test(phrase[phrase.length - 1]) ? BN_ENDINGS : "s|es|e?d|[a-z]?ed|[a-z]?ing";
  const after = typed ? "" : `(?:${ending})?(?=${NOT_WORD}|$)`;
  const source = `${before}(${body})${after}`;
  return { test: new RegExp(source, "iu"), all: new RegExp(source, "giu") };
}

/** The query as a Search, or null when it has nothing to search for. */
export function compileSearch(query: string): Search | null {
  const typed = words(query.slice(0, 200));
  const typedForms = typed.map(forms);
  const terms: { alternatives: Alternative[]; stopword: boolean }[] = [];
  for (let at = 0; at < typed.length;) {
    // The longest group phrase the query has here, if any.
    let best: { group: string[][]; length: number } | undefined;
    for (const f of new Set(typedForms[at])) {
      for (const phrase of BY_FIRST.get(f) ?? []) {
        if (phrase.words.length > (best?.length ?? 0) && startsWith(typedForms, at, phrase))
          best = { group: phrase.group, length: phrase.words.length };
      }
    }
    if (best) {
      // What was typed, as typed, and its equivalents.
      const alternatives = [alternative(typed.slice(at, at + best.length), true)];
      for (const phrase of best.group) alternatives.push(alternative(phrase, false));
      terms.push({ alternatives, stopword: false });
      at += best.length;
    } else {
      terms.push({
        alternatives: [alternative([typed[at]], true)],
        stopword: STOPWORDS.has(typed[at]),
      });
      at++;
    }
  }
  const kept = terms.some((t) => !t.stopword) ? terms.filter((t) => !t.stopword) : terms;
  if (!kept.length) return null;

  return {
    matches: (text) => kept.every((t) => t.alternatives.some((a) => a.test.test(text))),
    ranges(text) {
      const found: [number, number][] = [];
      for (const t of kept) {
        for (const a of t.alternatives) {
          for (const m of text.matchAll(a.all)) {
            // To the end of the word: "নির্বাচন" lights up all of "নির্বাচনের".
            const start = m.index + m[1].length;
            let end = start + m[2].length;
            while (end < text.length && WORD_CHAR.test(text[end])) end++;
            found.push([start, end]);
          }
        }
      }
      found.sort((x, y) => x[0] - y[0]);
      const merged: [number, number][] = [];
      for (const r of found) {
        const last = merged[merged.length - 1];
        if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
        else merged.push(r);
      }
      return merged;
    },
  };
}
