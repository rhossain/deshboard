# Subscriptions: plans, keyword alerts and accounts

A proposal, not a build. It covers what Bartaboard could charge for, and how keyword alerts and accounts would fit into
the current setup: a static site on Hostinger, rebuilt every 15 minutes by GitHub Actions, with no backend.

## 1. Ground rules

1. **Don't charge for the headlines.** They belong to the publishers, who give them away. Charge for what Bartaboard
   adds on top: alerts, search, sync, summaries and reports.
2. **Keep the free board as it is.** It brings in visitors through SEO and shared links. Don't take features away
   from it.
3. **Use local payments.** Stripe doesn't work in Bangladesh. Use SSLCommerz, aamarPay or ShurjoPay (bKash, Nagad,
   cards), or bKash's own tokenized/subscription API.
4. **Price in taka.** Keep it low for individuals; few will pay. Businesses are where the real money is.

## 2. Plans

### Free (what exists today, plus a taste of alerts)

- The board, Videos, Saved, pinned sources, sharing: unchanged, no account needed
- With a free account: **1 keyword alert, as a daily digest**, plus sync of saved and pinned items across devices

### Bartaboard Plus, for readers: ৳79–99/month or ৳699–799/year

| Feature | Why people would pay | Cost to run |
| --- | --- | --- |
| **Keyword alerts** (a name, a company, a district) by Telegram, email or push | Nothing else watches 59 Bangladeshi portals and 31 TV channels at once | Low. The fetch every 15 minutes already sees every new headline |
| Up to 10 keywords, sent **as they appear** (within about 15 minutes) | Free gets 1 keyword, once a day | Low |
| **Search and an archive beyond 72 hours** | The board forgets after 3 days | Medium. Needs a database of headlines |
| **Morning digest**: top stories by email or Telegram at 7am | A habit, which keeps people subscribed | Low |
| **AI summaries**: "how 8 papers covered this story", Bangla↔English translation | Builds on the Top Stories grouping (`src/lib/stories.ts`) | Charged per call, so cap it per day |

Not realistic: per-user faster refresh. The site is rebuilt for everyone every 15 minutes.

### Bartaboard Monitor, for businesses: ৳3,000–15,000/month. This is the stronger bet.

PR agencies, banks, telecoms, NGOs, embassies, political offices and corporate communications teams pay for media
monitoring, and much of it is still done by hand. Bartaboard already scrapes the sources this work needs.

- Many keywords and brands across every portal and TV channel, with Bangla and English variants
- A daily or weekly report as PDF or Excel: mentions per outlet, per day, Bangla and English coverage
- Team seats and shared collections
- CSV export, and an API or RSS feed of matching items
- Tiers by keywords and seats, for example **Starter** (5 keywords, 2 seats) and **Agency** (50 keywords, 10 seats)

A handful of business clients would earn more than thousands of individual subscribers.

## 3. Architecture: accounts and keyword alerts

### Main choice: a hosted backend (Supabase) instead of our own server

The static site can't hold accounts, receive payment callbacks or send messages. Rather than move off static hosting,
add a hosted backend that the browser and the deploy job both talk to. **Supabase** covers everything needed:

- **Auth**: email magic link and Google sign-in, from the browser
- **Postgres**, with row-level security, so the browser can read and write a user's own rows directly
- **Edge Functions** for the few things that must run on a server: the Telegram bot webhook and the payment callback

Its free tier (50k monthly users, 500 MB database) is enough to start. The static-export and main branches would both
use it the same way, so they stay in sync. Firebase would also work; Supabase fits better because alerts are SQL
queries, and Postgres can do the search later.

```
                     ┌────────────────────────────── Supabase ──────────────────────────────┐
  Browser            │                                                                      │
  (static site) ────►│ Auth (magic link, Google)        Postgres (RLS)                      │
   sign in, manage   │                                   profiles · alerts · channels       │
   alerts, sync      │                                   saved_items · pins                 │
   saved/pinned ────►│                                   seen_links · deliveries            │
                     │                                                                      │
  Telegram ─────────►│ Edge Function: telegram-webhook  (links a chat to an account)        │
  SSLCommerz/bKash ─►│ Edge Function: payment-callback  (sets profiles.plan, plan_until)    │
                     └──────────────────────────────────────────────────────────────────────┘
                                         ▲
  GitHub Actions, every 15 min           │ service key (GitHub secret)
  npm run fetch ──► npm run alerts ──────┘──► Telegram Bot API · email (Resend) · Web Push
                ──► npm run build ──► deploy branch ──► Hostinger
```

### Data model

```sql
-- One row per account, created on sign-up by a trigger on auth.users.
create table profiles (
  id          uuid primary key references auth.users on delete cascade,
  plan        text not null default 'free',   -- 'free' | 'plus' | 'monitor'
  plan_until  timestamptz,                    -- paid until; null for free
  created_at  timestamptz not null default now()
);

-- A keyword alert. `terms` holds the variants one thing goes by: {"ঢাকা ব্যাংক","Dhaka Bank"}.
create table alerts (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references profiles on delete cascade,
  terms       text[] not null,
  sources     text[],                          -- limit to these source/channel ids; null = all
  include_videos boolean not null default true,
  mode        text not null default 'digest',  -- 'instant' (paid) | 'digest'
  paused      boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Where a user gets alerts. Several per user are fine.
create table channels (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references profiles on delete cascade,
  kind        text not null,                   -- 'telegram' | 'email' | 'push'
  address     text not null,                   -- chat id, email address, or push subscription JSON
  verified    boolean not null default false,
  unique (user_id, kind, address)
);

-- Every headline/video link the alert job has already handled, so each is matched once. Pruned after 7 days.
create table seen_links (
  link        text primary key,
  first_seen  timestamptz not null default now()
);

-- What was sent. The unique key makes a re-run (or a retried Actions job) never send twice.
create table deliveries (
  alert_id    bigint not null references alerts on delete cascade,
  link        text not null,
  title       text not null,
  source_id   text not null,
  matched_at  timestamptz not null default now(),
  sent_at     timestamptz,                     -- null until delivered (digest rows wait for the digest)
  primary key (alert_id, link)
);

-- Sync for what lives in localStorage today (src/components/saved.ts, pinned.ts).
create table saved_items (
  user_id uuid references profiles on delete cascade,
  key text, kind text, entry jsonb, saved_at timestamptz,
  primary key (user_id, key)
);
create table pins (
  user_id uuid references profiles on delete cascade,
  kind text,                                   -- 'news' | 'videos'
  ids text[] not null, off boolean not null default false,
  primary key (user_id, kind)
);
```

**Row-level security:** users can read and write only their own `alerts`, `channels`, `saved_items` and `pins`, and
read their own `profiles` row and `deliveries`. `profiles.plan` is **not** writable from the browser; only the
payment function sets it. A trigger on `alerts` rejects inserts past the plan's limit (free 1, plus 10, monitor 50) and
`mode = 'instant'` on free, so a modified client can't get around them. `seen_links` and `deliveries` are written only
with the service key.

### Accounts on a static site

- `@supabase/supabase-js` runs in the browser. Sign-in is a dialog with "Email me a link" and "Continue with Google".
  The redirect lands on a client-only page (`/account/`) that finishes the sign-in. No server routes are needed, so it
  works with `output: "export"`.
- **No account is still the default.** Saved and pinned items keep working from localStorage. On first sign-in, the
  local lists are merged into the account (union of saved items, local pin order first), and from then on every change
  is written to both. Signing out keeps the local copy.
- The Supabase URL and anon key are public by design and go in `NEXT_PUBLIC_*` build variables. The service key stays
  only in GitHub secrets and Edge Functions.
- `/account/` page: email, plan, alerts (add/edit terms, choose sources, instant vs digest), delivery channels
  (connect Telegram, verify email, enable push), "Delete my account".

### The alert job: `scripts/send-alerts.ts` (`npm run alerts`)

It runs in `deploy.yml` right after `npm run fetch` and before `npm run build`, as its own step marked
`continue-on-error: true`, so an alert outage never blocks the site from updating.

1. **Read what was just fetched**: `public/data/news.json` items and `public/data/videos.json` videos.
2. **Find what's new**: insert every link into `seen_links` with `on conflict do nothing returning link`. Only the
   returned links are new. The ledger lives in Postgres rather than `.data/` because the Actions cache can be evicted,
   and a lost cache would resend a whole day of alerts. On the very first run, record everything and send nothing.
   (This mirrors the "baseline" rule in `src/lib/first-seen.ts`.)
3. **Load active alerts** with their owners' plans and verified channels: one query, at most a few thousand rows, held
   in memory.
4. **Match** each new title against each alert's terms (see "Matching Bangla and English" below). With about 100 new
   items a run, this takes milliseconds even with thousands of alerts.
5. **Record matches** in `deliveries` (`on conflict do nothing`). Again, only the rows actually inserted go on.
6. **Group before sending**: when one story shows up from many outlets, send one message per alert listing them
   ("Dhaka Bank: 6 outlets, Prothom Alo, The Daily Star, …"), using the same grouping as `findStories` in
   `src/lib/stories.ts`. Cap instant alerts at about 10 messages per user per hour; anything beyond waits for the next
   digest.
7. **Send** instant matches now, through Telegram, email and Web Push, then set `sent_at`. Digest matches stay
   unsent.
8. **Digest**: on the first run after 7:00 Dhaka time, collect each user's unsent rows into one message and send it.
9. **Prune** `seen_links` older than 7 days and `deliveries` older than 30 days (90 days for Monitor, which reports
   on them).

Links in messages point to Bartaboard's own share pages (`sharePath` / `videoSharePath` in `src/lib/share.ts`), not
straight to the outlet. That brings readers back to the site, and the links work after the headline leaves the board.

**Latency:** at most about 15 minutes plus the job's run time. That's fine for news alerts, and it's also the most
we can promise without our own server.

### Matching Bangla and English

- Normalize both the title and the term: Unicode NFC, remove zero-width characters (ZWJ/ZWNJ) and `্‌` variants,
  collapse spaces, lowercase Latin letters, and map Bangla digits ০–৯ to 0–9.
- **English**: whole-word match (`\bterm\b`), so "Sun" doesn't match "Sunday".
- **Bangla**: match the term as a **prefix of a word**. Bangla adds case endings straight onto the word (ঢাকা →
  ঢাকার, ঢাকায়), so whole-word matching would miss most hits.
- No automatic transliteration. Each alert holds several `terms`, and the form suggests adding the other script
  ("Also add ঢাকা ব্যাংক?"). A small hand-made list of common names could fill this in later.
- Possibly later: a `-term` exclusion, and requiring two terms together, which Monitor clients will ask for.

### Delivery channels, in the order to build them

1. **Telegram bot**: free, instant and reliable. To connect, `/account/` opens
   `t.me/BartaboardBot?start=<one-time token>`. The bot's webhook (an Edge Function) matches the token to the user and
   saves the chat id.
2. **Email** through Resend (3,000/month free) or Amazon SES: needed for digests and for Monitor reports. Ask the user
   to confirm the address first.
3. **Web Push**: needs a service worker and VAPID keys. The `web-push` package can send from the Actions step. On iPhone
   it only works once the site is added to the Home Screen (the manifest is already there).
4. Later: WhatsApp (Meta charges per conversation, so offer it only on Monitor).

### Payments and plans

#### Payment options

No option is free. Every way of collecting money automatically takes a cut of each payment, and the Bangladeshi
gateways also seem to charge a setup fee. These figures were found on 10 October 2026 from partly dated or third-party
sources; ask each provider for its current rate card in writing before signing up.

| Option | Setup | Per payment | Needs | Automatic? |
| --- | --- | --- | --- | --- |
| **bKash Personal Retail Account (PRA)** | ৳0 | Not published; a 2026 third-party guide says 1.5–2%, an older bKash table says free. Cash-out and transfers cost extra | NID, an unused SIM registered to that NID, proof of SIM ownership. No trade license | No |
| **SSLCommerz** | about ৳15,000 (older source) | about 2.5% cards, 1.85–2.1% mobile wallets | Trade license, business bank account | Yes |
| **aamarPay** | ৳4,000–15,000 depending on plan (older source) | Not published | Trade license, business bank account | Yes |
| **ShurjoPay** | Not found | Not found | Trade license, business bank account | Yes |
| **bKash Payment Gateway** (merchant) | Ask bKash | about 1.5–2% (third-party guide) | Trade license, bank account, website | Yes |
| **Paddle / Lemon Squeezy** | ৳0 | about 5% + 50¢ | Charges in US dollars, which most Bangladeshi readers can't pay | Yes |

- **Start with the bKash PRA.** Customers pay by scanning its QR code or typing its number, then enter the
  transaction ID on `/account/`; the plan is set by hand in Supabase after checking the bKash app. It costs nothing
  upfront and shows whether anyone will pay. It is fine for the first 10–50 subscribers and becomes a chore after that.
  Don't collect on a personal bKash account: bKash's rules don't allow business payments on it, and the PRA exists for
  this.
- **Move to a gateway** (SSLCommerz or aamarPay) once checking by hand is tedious. The payment's IPN/callback goes to
  the `payment-callback` Edge Function, which checks it with the gateway's validation API, then sets `profiles.plan`
  and `plan_until`. Supabase's free tier covers the function, so the provider's fees are the only new cost.
- Paddle or Lemon Squeezy only make sense for foreign Monitor clients.

Sources: [bKash PRA](https://www.bkash.com/en/page/personal-retail-account),
[bKash online business](https://www.bkash.com/index.php/en/business/online-business),
[PhotonPay: payment methods in Bangladesh](https://www.photonpay.com/hk/blog/article/payment-methods-in-Bangladesh),
[UNB: online payment gateway](https://unb.com.bd/news/tag/83231),
[USAID bKash document](https://pdf.usaid.gov/pdf_docs/PA00N3SK.pdf).

#### Plans
- Most Bangladeshi payers prefer to pay up front for a period. Sell 1, 6 or 12 months instead of automatic monthly
  charges, and send a renewal reminder by email or Telegram 3 days before `plan_until`.
- When a plan runs out, the account drops back to free: instant alerts become a digest, and alerts past the limit are
  paused, not deleted.
- Monitor is billed by invoice and bank transfer at first. Set the plan by hand in the Supabase dashboard.

### Costs to start

| Item | Monthly |
| --- | --- |
| Supabase free tier | ৳0 (Pro is $25 once past the free tier) |
| Resend free tier | ৳0 up to 3,000 emails |
| Telegram Bot API | ৳0 |
| GitHub Actions | ৳0 (public repo) or within the private-repo minutes, since alerts add a few seconds per run |
| Payments | ৳0 setup with a bKash PRA; a gateway adds a setup fee (up to about ৳15,000) and about 2–2.5% per payment |

### Privacy

Alerts reveal what people watch, sometimes politicians or rival companies. Store only an email address and the
alerts, never share them, let people delete their account and everything in it, and give the page a short privacy
notice saying so.

## 4. What changes in the repo

| Where | Change |
| --- | --- |
| `scripts/send-alerts.ts` (new), `package.json` | The alert job; `npm run alerts` |
| `src/lib/match.ts` (new) | Normalizing and matching, with tests in `scripts/test-parsers.ts` |
| `.github/workflows/deploy.yml` | An alerts step after `fetch` (`continue-on-error`); `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `TELEGRAM_BOT_TOKEN`, `RESEND_API_KEY` secrets |
| `src/lib/supabase.ts` (new) | The browser client |
| `src/app/account/` (new) | Sign-in, alerts, channels, plan, delete account |
| `src/components/saved.ts`, `pinned.ts` | Also write to Supabase when signed in; merge on first sign-in |
| `supabase/` (new) | SQL migrations, RLS policies, the `telegram-webhook` and `payment-callback` functions |
| Both branches | The same code on `main` and `static-export`. `main` could later move the alert job into the server's own fetch loop, but doesn't have to |

## 5. Order of work

1. **Check demand first.** Add a "Get alerts for a keyword" button that saves an email and a keyword to a waitlist
   (a single Supabase table). Separately, offer Monitor by hand to 5–10 PR agencies or companies as a paid pilot, with
   reports you put together yourself.
2. **Accounts + sync**: sign-in, `/account/`, synced saved and pinned items. Useful on its own, and everything after
   it needs it.
3. **Alerts on Telegram, free tier only** (1 keyword, daily digest), so the matching and delivery get tested on real
   users before anyone pays.
4. **Payments + Plus**: instant alerts, 10 keywords, email digests.
5. **Search and archive**: keep headlines in Postgres beyond 72 hours, using full-text search with a trigram index for
   Bangla.
6. **Monitor**: several seats per account, scheduled PDF/Excel reports, CSV export and an API.
