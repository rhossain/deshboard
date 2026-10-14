# Repository security, and moving it to private

The GitHub repository (rhossain/deshboard) is public. This page records what that exposes, what was locked down on
14 October 2026, and what it would take to make the repository private. It holds no secrets.

## What "public" means here

Anyone can read, clone and fork the code. Nobody but the owner can change it:

| Question | Answer |
| --- | --- |
| Who can push or merge? | Only `rhossain`, the sole collaborator (admin) |
| Can strangers open pull requests? | Yes, but only the owner can merge them |
| Do pull requests from forks see secrets? | No. CI (`ci.yml`) runs on them without secrets, and a first-time contributor's run waits for approval |
| Can a stranger start the deploy? | No. `deploy.yml` starts only by `workflow_dispatch`, which needs write access |
| What can the workflow token do? | Read only (default workflow permissions: read) |
| Where do the keys live? | In GitHub's encrypted secrets (`CLOUDFLARE_API_TOKEN`, `YOUTUBE_API_KEY`), never in the code |

### Secret check (14 October 2026)

The current files and the full history of the code and config (981 commits, leaving out the `news/`, `bn/` and
`public/` data folders, JSON and images) were searched for API keys, tokens, private keys, Supabase service-role keys,
Google OAuth client secrets and `.env` files. Nothing was found. GitHub's own secret scan, run right after it was
turned on, found nothing either.

## Settings turned on (14 October 2026)

All of these are in the repository's Settings and can be undone there.

1. **Secret scanning and push protection** (Settings → Advanced Security). A push containing a recognised token (GitHub,
   Cloudflare, AWS, Google, Stripe and others) is rejected before it goes public. "Non-provider patterns" did not
   switch on; it appears to need GitHub's paid Advanced Security.
2. **Dependabot alerts and security updates** (Settings → Advanced Security). When a dependency has a known
   vulnerability, Dependabot opens a pull request with the fix.
3. **Ruleset "Protect main and static-export"** (Settings → Rules → Rulesets, id 25067029). It blocks force-pushes and
   deleting `main` or `static-export`. Normal pushes still work. It has no admin bypass, so a stolen login can't get
   past it either. To force-push on purpose: set the ruleset to Disabled, push, then set it back to Active.

## License (14 October 2026)

`LICENSE` on both branches (static-export `1f1659c07`, main `d1e48a628`) says the code is "all rights reserved".
Nobody may copy, modify, host, deploy, sell or build a competing service from it without written permission, and the
Bartaboard / বার্তাবোর্ড name and logo are protected. Permission requests go to support@bartaboard.com.
`package.json` has `"license": "UNLICENSED"` on both branches.

What it does and doesn't do:

- It's a legal notice, not a lock. Someone can still copy the code; the notice gives clear grounds to act against a
  copy that's running publicly, for example with a DMCA takedown to GitHub or to the copycat's host.
- GitHub's Terms of Service let anyone view and fork a public repository on GitHub. The license says a fork gives no
  right to use the code anywhere else.
- Code already copied while the repository was public stays copied. Going private only stops new copies.

## Moving to private

Making the repository private is the only thing that actually stops people reading and copying the code. The cost is
GitHub Actions minutes, which are unlimited for public repositories but limited for private ones.

### What the site uses now

Measured on 14 October 2026 from the last 20 runs of each workflow:

| Workflow | How often | Average run | Billed per run* |
| --- | --- | --- | --- |
| `deploy.yml` | Every 15 minutes (96 a day, about 2,880 a month) | about 1 min 53 s (longest 2 min 26 s) | 2–3 minutes |
| `ci.yml` | Each push and pull request | about 1 min 13 s | 2 minutes |

\* GitHub rounds each job up to a whole minute.

So the deploy alone needs about **5,800–8,600 minutes a month**. GitHub's free plan includes 2,000 minutes a month for
private repositories, and GitHub Pro 3,000. These were the limits as of 2026; check GitHub's billing page before
deciding. Above the limit, GitHub bills per minute, or stops the workflows if the spending limit is $0.

### Options

1. **Private, and pay for the extra minutes.** The simplest option: nothing in the site changes. Set a spending limit
   in GitHub's billing settings first so the bill can't run away.
2. **Private, and deploy less often.** Every 30 minutes halves the minutes, every hour quarters them. Change the
   cron-job.org timer, and `UPDATE_EVERY_MS` in `src/components/schedule.ts` on static-export, to match. Hourly
   (about 1,440–2,160 minutes) roughly fits the free plan with little room for CI.
3. **Private, and build somewhere else.** Cloudflare Pages can build straight from a private GitHub repository, but
   each Cloudflare build is limited in time and the free plan allows only so many builds a month, so a 15-minute
   schedule may not fit there either. Another runner (a small server running the fetch and `wrangler pages deploy`)
   is possible, but more to look after.
4. **Two repositories.** Keep a private repository with the code, and let it publish to Cloudflare from Actions on a
   cheaper schedule, or keep only the scheduled fetch-and-deploy job in a public repository. This only works if the
   public part contains no code worth protecting, which isn't true today: the deploy builds the whole site.

### Checklist for going private

1. Choose one of the options above, and set a GitHub spending limit if paying for minutes.
2. Settings → General → Danger Zone → Change visibility → Private.
3. Check that the fine-grained token cron-job.org uses still dispatches `deploy.yml` (it is limited to this
   repository's Actions, which keep working when it's private), and watch the next timed run in the Actions tab.
4. Check the settings above are still on. On a private repository, secret scanning and push protection need GitHub's
   paid Advanced Security, and rulesets need GitHub Pro or higher, so on the free plan they may stop applying.
   Dependabot keeps working.
5. Keep the `LICENSE`; it still matters for any copy made while the repository was public.
6. Update `docs/services.md` and this page.
