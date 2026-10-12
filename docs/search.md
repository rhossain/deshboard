# Search: better matching now, 30 days of headlines next, AI later

A plan for the search box. It fills in step 5 of [subscriptions.md](subscriptions.md) ("Search and archive").

**Ground rules:** it costs nothing, and it has nothing that can run out or go down on its own. Everything runs in the
reader's browser on files the site already serves. Services with daily limits (AI, a database) come later, as
extras that the search still works without.

## 1. What was there

The search box filtered the headlines already in the browser (the last 72 hours) by plain text. It couldn't:

- Match across languages: "flood" didn't find "বন্যা", "bnp" didn't find "বিএনপি"
- Match other forms or spellings: "নির্বাচনে" vs "নির্বাচনের", "Chittagong" vs "Chattogram", ি vs ী
- Match words in any order: "dhaka rain" found nothing
- Find anything older than 3 days

## 2. Step 1: smarter matching (done)

`src/lib/search.ts` turns the query into terms. A headline matches when it has every term, in any order. Each term
matches:

| What | Example |
| --- | --- |
| Other forms of the word (the Bangla endings from `stories.ts`, English plurals) | "নির্বাচনে" finds "নির্বাচনের", "elections" finds "election" |
| Its equivalents in `src/lib/search-terms.ts` | "flood" finds "বন্যা", "Chittagong" finds "চট্টগ্রাম" and "Chattogram", "awami league" finds "আওয়ামী লীগ" |
| However the Bangla was written | য় ড় ঢ় ো ৌ precomposed or not, Bangla or English digits, invisible joiners. All of these occur in real headlines |
| Typing slips, in what the reader types | ি or ী, ু or ূ |

Where in a word a term may match:

- **English** at the start of a word: "rain" finds "rains", not "train".
- **Bangla the reader types** anywhere, as before: "ভোট" finds "গণভোট".
- **Equivalents from the word list** only at the start of a word, and English ones only as a whole word. So "train" →
  "রেলওয়ে" can't find "জেনারেল", and "বন্যা" → "flood" can't find "floodlit".

Small words ("in", "the", "ও", "এবং") are left out unless they're all the query has. The words found are
highlighted (`src/components/Highlight.tsx`) in every list: News, Top stories, Latest, Saved, Videos.

On four days of real headlines (5,679), a search takes 2–15 ms on a laptop:

| Query | Before | Now |
| --- | --- | --- |
| flood | 1 | 7 |
| bnp | 1 | 53 |
| election | 4 | 29 |
| chittagong | 1 | 68 |
| dhaka rain | 0 | 5 |
| ভোট | 16 | 17 |

**The word list** has 213 groups: places, countries, parties, people, crime, weather, health, economy,
education, sports, technology. Grow it from what readers search for. Every word must be specific: "us", "ai", "জেল"
or "রেল" would find "used", "aid", "জেলা", "জেনারেল". `npm test` checks that every word in a group finds every
other.

## 3. Step 2: the last 30 days (next)

The build already writes every headline of the last 72 hours to `public/data/days/<date>.json`, one file per Dhaka
day, so shared links to older headlines still work. Keep 30 days instead of 3, and search them in the browser.

**On the page.** The board searches what it has loaded, instantly, as now. Below the results, an **"Older
headlines"** section searches the day files, newest first. It loads one day at a time, shows matches as each day
arrives, and stops at 50 matches. "Search further back" carries on.

**Size.** A full day is about 1.4 MB, or about 230 KB compressed (what the browser actually downloads), for about 3,000
headlines. A search that finds its 50 matches in the last week downloads about 1.5 MB; all 30 days would be about
7 MB. So:

- Write a slimmer file just for searching, `public/data/search/<date>.json`, with only what a result row needs: the
  title, link, source id, time and language. Measure it; dropping fields and repeated text should make it a lot
  smaller.
- Fetch only once the reader stops typing (500 ms) and the query has at least 2 letters, and cancel when it changes.
- The files never change once the day is over, so browsers and Cloudflare cache them (`Cache-Control: immutable` for
  past days).

**Keeping 30 days through rebuilds.** Each run starts from the GitHub Actions cache (`.data`), which can be lost. So
before writing, `npm run fetch` downloads any missing past day from the live site
(`https://bartaboard.com/data/search/<date>.json`). The live site is the archive; nothing else stores it.

**Hosting.** Cloudflare Pages serves any amount of traffic for free. 30 more small files stay far below its 20,000
files per site.

**Both branches.** `static-export` builds the files in `npm run fetch`. `main` writes the same files from its own fetch
loop and serves them the same way.

## 4. Step 3: AI, later (when there is money or a clear need)

Each idea below improves search but depends on a service with daily limits. Search must keep working when the service
is down or out for the day, so each one adds to steps 1 and 2 and never replaces them.

| Idea | What it adds | Free option | Its limit |
| --- | --- | --- | --- |
| **Query expansion** | For words not in the list, an LLM adds the other language and spellings ("ধান" → "paddy") | Cloudflare Workers AI, 10,000 neurons a day, behind one small Worker. Doesn't train on queries | Runs out on busy days; then the search simply goes without it |
| **Archive beyond 30 days** | Months of headlines, searchable | Supabase Postgres (already used for accounts) with PGroonga, its full-text search for any language, Bangla included | 500 MB free: about 120 days. More needs Supabase Pro, $25 a month. Fits a paid Plus feature |
| **Search by meaning** | "দাম বাড়ল" finds "price hike" with no word in common | Embeddings (`bge-m3` on Workers AI) for Top Stories only, not every headline | A vector per headline would fill the free database in weeks |
| **AI summaries** | "How 8 papers covered this story" | Gemini Flash free tier, for public headlines only, never readers' queries | Free-tier data may be used for training; daily caps |

Queries show what people are looking for, so send them only to services that don't train on them (Workers AI, or a
paid plan), and add a line to the Privacy page before any of this goes live.

## 5. Files

| Where | What |
| --- | --- |
| `src/lib/search.ts` | Matching and highlight ranges (step 1) |
| `src/lib/search-terms.ts` | The word list (step 1) |
| `src/components/Highlight.tsx` | Marks the matched words (step 1) |
| `src/components/NewsBoard.tsx`, `VideoBoard.tsx` and the lists | Use the new matching and highlighting (step 1) |
| `scripts/test-parsers.ts` | Search tests (step 1) |
| `scripts/fetch-news.ts`, `src/lib/news.ts` | 30 days of search files, refilled from the live site (step 2) |
| `src/components/OlderResults.tsx` (new) | The "Older headlines" section (step 2) |
