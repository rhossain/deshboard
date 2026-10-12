# Search: across Bangla and English, 30 days back, AI later

A plan for the search box. It fills in step 5 of [subscriptions.md](subscriptions.md) ("Search and archive").

**Ground rules:** it costs nothing, and it has nothing that can run out or go down on its own. Everything runs in the
reader's browser on files the site already serves. Services with daily limits (AI, a database) come later, as
extras that the search still works without.

## 1. What was there

The search box filtered the headlines on the board (each outlet's newest) by plain text. It couldn't:

- Match across languages: "flood" didn't find "বন্যা", "bnp" didn't find "বিএনপি"
- Match other forms or spellings: "নির্বাচনে" vs "নির্বাচনের", "Chittagong" vs "Chattogram", ি vs ী
- Match words in any order: "dhaka rain" found nothing
- Find anything that had left the board

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

## 3. Step 2: the last 30 days (done)

The board holds each outlet's newest headlines (about 3,500 in all), which for the busiest is less than a day. The
search now carries on past it into every headline of the last 30 days.

**The day files.** One file per Dhaka day, `/data/days/<date>.json` (`NewsDay`), with every headline the fetch has
seen that day. The build used to keep 72 hours of them, for shared links; it now keeps 30 days (`src/lib/archive.ts`).
The fetch's cache only reaches back 72 hours, so each run merges what it has into the day files kept before
(`.data/days`, which the Actions cache carries from run to run). A slimmer search-only file was measured and isn't
worth it: compressed, it is 3% smaller.

**If the Actions cache is lost.** `npm run fetch` downloads any kept day it is missing from the live site
(`SITE_URL`, set for the fetch step in `deploy.yml`). The live site is the backup; nothing else stores the archive.

**On the page** (`src/components/OlderResults.tsx`). Once the board has every headline, an **"Earlier headlines"**
section under its results searches the day files:

- From today back, a day at a time, leaving out what the board already shows and repeats of the same headline
- Half a second after the reader stops typing; a new search or filter starts over
- A round stops after 7 days or 20 more matches; "Search further back" runs the next one
- Ends at the first missing day, and says how far back it looked ("Searched back to Friday 9 October")
- Rows look and work like the Latest list's: highlighted, with Save and Share
- When the board itself has nothing, it says "Nothing among the latest headlines" rather than "Nothing found"

**Size.** A full day is about 3 MB, or about 290 KB compressed (what the browser downloads). A search that finds
its first 20 matches today downloads about 300 KB; a full round of 7 days, about 2 MB. Files are downloaded once
per visit, and only when someone searches.

**Hosting.** Cloudflare Pages serves any amount of traffic for free; 30 files are far below its 20,000 per site. On
the `deploy` branch, a past day's file stops changing once its headlines have left the cache, so it adds no commits.

**`main`.** The server merges each background refresh into the same day files under its data folder (`.data/days`,
or `NEWS_DATA_DIR`), and serves them at the same address (`src/app/data/days/[file]/route.ts`). The page code is the
same on both branches.

The archive fills up from the day this goes live: 30 days after, it holds a full 30 days.

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
| `src/lib/search.ts`, `src/lib/search-terms.ts` | Matching, highlight ranges, the word list (step 1) |
| `src/components/Highlight.tsx` | Marks the matched words (step 1) |
| `src/components/NewsBoard.tsx`, `VideoBoard.tsx` and the lists | Use the new matching and highlighting (step 1) |
| `src/lib/archive.ts` | Which days are kept, and merging a day (step 2) |
| `scripts/fetch-news.ts` (static-export), `src/lib/news.ts` and `src/app/data/days/` (main) | Writing and serving the day files (step 2) |
| `src/components/OlderResults.tsx` | The "Earlier headlines" section (step 2) |
| `scripts/test-parsers.ts` | Search and archive tests |
