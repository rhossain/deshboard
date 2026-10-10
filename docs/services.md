# Services and where they're configured

Bartaboard runs on several hosted services, configured in their dashboards rather than in this repo. This page lists
each one: which account owns it, what is set there, and what to check when something breaks. It holds no secrets;
those stay in the dashboards and in GitHub's encrypted secrets. Last checked 10 October 2026.

| Service | Account | What it does |
| --- | --- | --- |
| Cloudflare | rshossain.bd@gmail.com | DNS for bartaboard.com, hosting (Pages), the www redirect |
| GitHub Actions | rhossain/deshboard | Fetches headlines, builds the site, uploads it every 15 minutes |
| cron-job.org | — | Starts the deploy workflow every 15 minutes |
| Supabase | org rshossain | Accounts, sessions and the `profiles` table |
| Google Cloud | hossain.robin007@gmail.com | "Continue with Google" |
| Resend | rshossain.bd | Sends the sign-in emails |
| Hostinger | — | Domain registrar; serves the old deshboard.rshossain.me address, which redirects here |

## Cloudflare

Account ID `d208ed5c0097c823cf0f1c01c73ea0fb`, zone `bartaboard.com` on the Free plan, nameservers
`galilea.ns.cloudflare.com` and `lars.ns.cloudflare.com`. The same account also holds the unrelated styloviz.dev site
and styloviz project; leave them alone.

- **Pages project `bartaboard`**, production branch `main`, custom domains `bartaboard.com` and `www.bartaboard.com`.
  Nothing builds on Cloudflare: the deploy workflow uploads `out/` with Wrangler. `public/_headers` and
  `public/_redirects` set headers and rewrites there.
- **Redirect rule** (Rules → Redirect Rules): `https://www.*` → `https://${1}`, 301, query string kept. Plain http
  goes to https first ("Always Use HTTPS"), then to the bare domain.
- **DNS records**
  - `bartaboard.com` and `www`: CNAME `bartaboard.pages.dev`, proxied.
  - Hostinger mail (MX `mx1`/`mx2.hostinger.com`, SPF TXT, `autoconfig`, `autodiscover`, `hostingermail-a/b/c` DKIM)
    and `_dmarc` (`p=none`): left as they were.
  - Resend, all **DNS only**: TXT `resend._domainkey` (DKIM key), CNAME `send` → `send.forge.rmta.net`, CNAME
    `rsend` → `rsend-apne1.forge.rmta.net`.

## GitHub Actions and cron-job.org

`.github/workflows/deploy.yml` (see the README's Deploy section) builds the `static-export` branch, commits `out/` to
the `deploy` branch for Hostinger, then runs `wrangler pages deploy out --project-name=bartaboard --branch=main`.

- Repository variables: `SITE_URL` = `https://bartaboard.com`, `CLOUDFLARE_ACCOUNT_ID`. The Cloudflare upload step is
  skipped without the latter.
- Repository secret: `CLOUDFLARE_API_TOKEN`, the Cloudflare API token Wrangler uploads with (made in Cloudflare →
  My Profile → API Tokens).
- cron-job.org calls `POST /repos/rhossain/deshboard/actions/workflows/deploy.yml/dispatches` with
  `{"ref":"main"}` every 15 minutes, using a fine-grained token that can only run this repo's Actions.

## Supabase

Project `bartaboard`, ref `errwyvuguelgifuusbky`, region Singapore (ap-southeast-1), Free plan.

- **Address and key used by the site** (`src/lib/supabase.ts`): `https://errwyvuguelgifuusbky.supabase.co` and the
  publishable key. Both are public by design; row-level security protects the data. The service key must never go in
  the site.
- **Database**: `supabase/migrations/` holds the schema. It is applied by pasting it into the SQL editor; there is no
  CLI link. New tables aren't exposed to the API until granted, and row-level security is on by default.
- **Authentication → URL Configuration**
  - Site URL: `https://bartaboard.com/account/`. Supabase falls back to it when a sign-in fails, for example "OAuth
    state has expired" after more than about 10 minutes on Google's screen.
  - Redirect URLs: `https://bartaboard.com/**`, `https://www.bartaboard.com/**`, `http://localhost:3000/**`.
- **Sign In / Providers**
  - Email: on. Email OTP length **6**, expiry 3600 seconds.
  - Google: on, with the client ID and client secret from Google Cloud below.
- **Emails → SMTP Settings**: `smtp.resend.com`, port 465, username `resend`, password = the Resend API key named
  "Supabase". Sender `Bartaboard <login@bartaboard.com>`. Custom SMTP raises the limit to 30 emails an hour (Rate
  Limits).
- **Emails → Templates**: "Magic link or OTP" and "Confirm sign up" (sent to first-time users) share one template.
  Subject `Your Bartaboard sign-in code: {{ .Token }}`; the body shows `{{ .Token }}` large plus a "sign in with one
  click" link to `{{ .ConfirmationURL }}`. Templates can only be edited while custom SMTP is on.

## Google Cloud

Project "Bartaboard" (`durable-sky-511119-q1`), under hossain.robin007@gmail.com. Google Auth Platform:

- **Branding**: name Bartaboard, support email hossain.robin007@gmail.com, home page `https://bartaboard.com/`, privacy
  `/privacy/`, terms `/terms/`, authorized domains `bartaboard.com` and `errwyvuguelgifuusbky.supabase.co`. No logo:
  adding one would require Google's verification.
- **Audience**: External, **In production**, so any Google account can sign in. Only the basic `email` and `profile`
  scopes are requested, so no verification is needed.
- **Client** "Bartaboard (Supabase)", type Web, client ID
  `41873090675-j1inibh8ecegu50hu357e9p18o3695sj.apps.googleusercontent.com`. JavaScript origin
  `https://bartaboard.com`; redirect URI `https://errwyvuguelgifuusbky.supabase.co/auth/v1/callback`. Its secret is
  stored only in Supabase; to replace it, add a new secret here and paste it into Supabase.
- Google's consent screen says "continue to errwyvuguelgifuusbky.supabase.co". Showing bartaboard.com instead needs a
  Supabase custom domain, a paid add-on.

## Resend

Account rshossain.bd, Free plan (3,000 emails a month, 100 a day).

- **Domain** `bartaboard.com`, verified, region Tokyo (ap-northeast-1), click and open tracking off. Tracking would
  rewrite the sign-in links.
- **API key** "Supabase": sending access only, limited to bartaboard.com. It was copied straight into Supabase's SMTP
  password, so if it's lost, create a new key and paste that in.
- **Emails** shows every message sent and whether it was delivered. Check here first when a code doesn't arrive.

## When something breaks

- **Sign-in code email doesn't arrive**: Resend → Emails (delivered or bounced?), then the spam folder, then Supabase →
  Logs → Auth (rate limit hit?).
- **Google sign-in lands on the account page with an error**: Supabase → Logs → Auth shows the reason. Check that
  Supabase's Google provider still has the client secret, and that the Google client's redirect URI matches the one
  above.
- **The site is stale**: GitHub → Actions → the latest "deploy" run, then cron-job.org's execution history.
