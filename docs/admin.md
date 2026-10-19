# The admin: reviewing the Facebook Page's posts

Bartaboard's admin, at [bartaboard.com/admin/](https://bartaboard.com/admin/), and its Telegram bot
([@bartaboard_bot](https://t.me/bartaboard_bot)) let the owner see, change, approve or stop each post before it goes to
the Facebook Page. How posts are picked is [facebook-posting.md](facebook-posting.md); this page is what sits on top of
it. Set up 19 October 2026.

## How it works

```
every 15 minutes (deploy.yml → scripts/post-facebook.ts)
  1. the Page's posts made the old way are copied in (shadow; before the switch)
  2. drafts: each slot gets one about 40 minutes ahead (settings: draftLeadMinutes; the 16:45 run for a 17:30 slot),
     refreshed every run until someone
     touches it, and sent to Telegram with buttons
  3. what is due goes out: approved posts, and drafts whose policy lets them; an hour late, skipped
  4. breaking news between the slots, by its own policy
```

A draft is made about 40 minutes ahead (until 19 October an hour), not a day: a story is only posted while it is still being reported (its newest headline
under two hours old, see facebook-posting.md), so an earlier pick would be stale by its time. Those 40 minutes, less the edit lock, are the review window: for a 17:30 post, from about 16:47 to 17:25.

**Policies.** What happens to a draft nobody touched by its time:

| Policy | Slot drafts (default) | Breaking news (default) |
| --- | --- | --- |
| Posts unless rejected (`auto_unless_rejected`) | ✓ | |
| Posts by itself (`auto`) | | ✓, and Telegram says so, with a link to take it down |
| Needs approval (`manual`) | | |

A draft a person approved or edited is **locked**: it goes out exactly as they left it, and the picker no longer
refreshes it. One nobody touched is the picker's: if it no longer passes the checks at its time, a fresh pick replaces
it. **Rejecting** a draft leaves its story out for a day (and, if asked, its outlet or section), so the next run drafts
something else for the slot. **Skipping** leaves the slot empty.

**The edit lock.** A post can be edited until 5 minutes before its time (Settings: "Lock edits before a post goes
out", 0–15 minutes). From then on the picker stops refreshing its draft too, so what the admin and Telegram show at
that moment is exactly what goes out; approve, reject and skip stay open until it goes. A post's new time must be at
least the lock ahead. The deploy runs at :00, :15, :30 and :45 and posts about 2–3 minutes into the run, so a 17:30
post goes out around 17:32, and one set for 17:23 goes with the 17:30 run. With FB_POSTING=review the queue hands
each post to Facebook 20 minutes ahead (as a scheduled post), which closes editing earlier than the lock: once the
queue is live, FB_POSTING=on keeps the 5-minute window.

**Editing a post's items.** Edit lists the post's cards: reorder them, remove one (a carousel keeps at least two;
Facebook takes 2 to 10), or add one from a search over the board's headlines and videos right now. A single post's
item can be replaced. The text follows the cards (heading, numbered list) until you type in it. Cards a person added
are checked just before the post goes out (each link answers, each picture loads); one that fails stops the post, and
Telegram says which. **Add a post** takes one headline or video from the board as a post of its own, or text and a
link you write. **Pause** stops everything going out; drafts are still
made, and those whose time passes are skipped.

**FB_QUEUE** (repository variable) chooses the path:

| FB_QUEUE | What happens |
| --- | --- |
| off (unset) | the old path only: each run picks and posts what is due |
| `shadow` | the old path posts; the queue runs after it **dry**: drafts, Telegram, "trial picks", nothing to Facebook |
| `on` | the queue posts (FB_POSTING still says how: `review` schedules each post 20 minutes ahead in Meta Business Suite, `on` posts at its time, `dry` posts nothing) |

Switching back to off loses nothing: in `on`, the queue keeps the old path's history file (`.social/facebook.json`) in
step from the database. "Post now" in the admin works only when the last run was a live queue run.

## Where things are

| Part | Code |
| --- | --- |
| The page | `src/app/admin/page.tsx`, `src/components/admin/*` |
| The API (Pages Functions, behind Access) | `functions/api/admin/*`; actions in `src/lib/social-actions.ts` |
| The door | `functions/api/admin/_middleware.ts` (checks the Access JWT, and that changes come from the admin's own origin) |
| The database | D1 `bartaboard-social`, bound as `SOCIAL_DB` (`wrangler.toml`); schema `migrations/`; `src/lib/social-db.ts`, `src/lib/social-store.ts` |
| The queue | `scripts/post-facebook.ts` (`queueMain`, `compose`); rules `src/lib/social-queue.ts`; settings `src/lib/social-settings.ts` |
| Telegram | `functions/api/telegram.ts` (buttons, /status, /pause, /resume); messages `src/lib/telegram-review.ts` |
| Setup and maintenance | `.github/workflows/ops.yml` (below) |
| Tests | `npm run test:social` (the store, the rules, the actions, the messages, on Node's SQLite against the real schema) |

### Database tables

`posts` (every post from draft to posted; one live post a slot; each Facebook post once; a `version` that every change
names, so an edit in the admin and a run never overwrite each other), `blocks` (what the picker leaves out, until
when), `settings`, `audit` (every change, by whom: `panel:<email>`, `telegram`, `deploy`), `insights`, `runs`.

## Signing in

Cloudflare Access (Zero Trust team `bartaboard.cloudflareaccess.com`, application "Bartaboard admin") covers
`bartaboard.com/admin` and `bartaboard.com/api/admin`. Its policy allows one address, `rshossain.bd@gmail.com`, which
signs in with a one-time code sent by email; the session lasts 24 hours. To let someone else in, add their address to
the policy (Zero Trust → Access → Applications → Bartaboard admin → Policies), or set `ADMIN_EMAIL` and rerun
`access-setup`. The API checks the Access token itself as well, so it stays closed even if the application were removed.

`/api/telegram` is outside Access: it accepts only requests carrying the webhook's secret
(`X-Telegram-Bot-Api-Secret-Token`), and acts only for the admin's own chat (`TELEGRAM_ADMIN_CHAT_ID`).

## The ops workflow

The laptop's shells can't reach Cloudflare's, Telegram's or Facebook's APIs, so setup steps run on GitHub Actions:
`.github/workflows/ops.yml`, dispatched by hand (Actions tab → Ops → Run workflow, or the API). Each reports in the
run's summary.

| Task | Does |
| --- | --- |
| `whoami` | the token's account; KV namespaces, D1 databases, the Pages project's bindings |
| `d1-create`, `d1-migrate` | the database, and the schema (`migrations/`) applied remotely |
| `d1-query` | one SQL statement (`arg`), its rows reported |
| `d1-import-history` | the old path's history (`.social/facebook.json`, from the deploy's cache) copied in |
| `d1-token-check` | `SOCIAL_DB_TOKEN` can read the database |
| `access-setup` | the Zero Trust team (`arg`: its name, first time), the login method, the application and policy |
| `pages-secrets` | `FB_PAGE_TOKEN`, `FB_APP_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` copied to the Pages project |
| `telegram-chat-id`, `telegram-webhook`, `telegram-test` | who wrote to the bot; the webhook; a test message |
| `fb-token-check` | whose Facebook token it is, its scopes and expiry |

## Secrets and settings

| Name | Where | What |
| --- | --- | --- |
| `SOCIAL_DB_TOKEN` | GitHub secret | Cloudflare token, Account › D1 › Edit only: the deploy's way into the database |
| `CLOUDFLARE_OPS_TOKEN` | GitHub secret | Cloudflare token for the ops workflow (D1, Pages, Access, KV read, Zone read) |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` | GitHub and Pages secrets | the bot; the webhook's shared secret |
| `FB_PAGE_TOKEN`, `FB_APP_SECRET` | GitHub and Pages secrets | as for the deploy (facebook-posting.md) |
| `FB_QUEUE`, `ADMIN_EMAIL`, `TELEGRAM_ADMIN_CHAT_ID` | GitHub variables | the path; who may sign in; the admin's chat |
| `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, `FB_PAGE_ID`, `FB_APP_ID`, `TELEGRAM_ADMIN_CHAT_ID` | `wrangler.toml` `[vars]` | public ids the Functions need |

## When something breaks

- **The admin says "not signed in"**: the Access session ran out (24 hours). Reload the page and sign in again.
- **No drafts on Telegram**: Health shows when the deploy last ran; Telegram's webhook state is the `telegram-webhook`
  task's report. A draft also doesn't come when nothing passes the rules yet: the slot's row in the queue says so.
- **A post failed**: its card and Telegram message say Facebook's reason; the next run tries again until 45 minutes
  after its time. "Try again" re-approves it now.
- **Something went out that shouldn't have**: "Take down" on its card (or in History) removes it from the Page; it
  stays in the history, so the story isn't posted again.
- **Stop everything**: /pause on Telegram, or "Pause posting" in the admin. To leave the queue entirely, set FB_QUEUE
  to off: the old path takes over with nothing lost.
