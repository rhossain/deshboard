# Ads: plan and what readers are told

A plan, not a build. Bartaboard shows no ads today. Ads and paid plans (see [subscriptions.md](subscriptions.md))
are how it will pay for itself, and readers are told so now, on the About, Privacy and Terms pages, so neither
comes as a surprise.

## 1. Ground rules

1. **Ads never look like headlines.** Each is labelled "Ad" / "বিজ্ঞাপন", sits in its own box and is never mixed into
   a list of headlines without that label.
2. **The free board stays whole.** No feature is taken away from the free board to make room for ads or to sell a plan.
3. **Readers hear first.** The privacy policy names the ad provider and what it collects before the first ad is
   shown, not after.
4. **No reader data for advertisers.** Account emails, saved items, pins and keyword alerts are never shared with
   advertisers or used to target ads.
5. **Ads must not hurt the page.** Each slot has a fixed height (no layout shift), loads after the headlines and never
   delays the first paint. Core Web Vitals and the SEO work in [seo.md](seo.md) come first.

## 2. Options

| Option | Fits | Notes |
| --- | --- | --- |
| **Google AdSense** | First choice to start | Works on a static site: one script plus `<ins>` slots. Needs approval, `public/ads.txt`, and a Google-certified consent banner (CMP) for visitors from the EEA, UK and Switzerland. Uses cookies, so the privacy policy must say so. Pays little per Bangladeshi visitor. |
| **Direct sponsors** | Once traffic is steady | A Bangladeshi brand sponsors a section or the morning digest. An image and a link we host ourselves: no third-party script, no cookies, nothing new to disclose beyond "sponsored". Earns more per view, needs selling. |
| **Other networks** | Only if AdSense says no | More intrusive formats and weaker privacy terms. Avoid pop-ups, auto-playing video and redirects. |

## 3. Where ads go

- **Newsstand**: one slot after every few source cards on phones, a single sidebar or between-rows slot on larger
  screens.
- **Latest**: one slot every 20–30 headlines, labelled, the same height as a row group.
- **Top stories, Videos**: after the first screen, never above it.
- **Never on**: `/account/`, `/privacy/`, `/terms/`, the share pages' headline itself, or inside the video player.
- Ads respect the dark theme where the network allows it.

## 4. Paid plans and ads

- An ad-free board is a natural Plus perk: Plus readers see no ads while signed in. Decide this before ads launch,
  so the plan's description and the ads ship together.
- A reader who never signs in still sees the same free board, with ads.

## 5. How it would be switched on

Like plans (`PLANS` in `src/lib/plans.ts`), behind a repository variable:

- `ADS` = `on` turns slots on; anything else renders nothing and loads no ad script. Both branches read it the same
  way (`static-export` at build time from `deploy.yml`, `main` from the server's environment).
- `?ads=preview` shows them on one device to check placement before launch.

## 6. Checklist before the first ad

1. Pick the provider; get AdSense approval (or sign the first sponsor).
2. **Update the privacy policy** (`src/components/pages/PrivacyPage.tsx`, English and Bangla): who shows ads, what
   they collect (cookies, IP address, device), the opt-out links, and the consent banner where required. Change its
   date. Remove "no tracking cookies" from the About page if the provider sets any.
3. Update the About page's "Free, with ads and paid plans to come" section to say ads are now shown.
4. Add `public/ads.txt` (AdSense).
5. Add the consent banner if serving AdSense to EEA/UK/Swiss visitors.
6. Check layout shift and load time on a phone with ads on (`?ads=preview`), in both themes.
7. Port to both branches (`main` and `static-export`).

## 7. Where readers are told

Keep these in step whenever the plan changes, in English and Bangla:

| Page | What it says now |
| --- | --- |
| About (`src/components/pages/AboutPage.tsx`) | "Free, with ads and paid plans to come": no ads, analytics or tracking cookies today; ads planned, labelled and disclosed first; paid plans optional, free features stay free |
| Privacy (`src/components/pages/PrivacyPage.tsx`) | "Ads" section: none yet; the policy is updated with the provider and what it collects before the first ad; advertisers never get account data |
| Terms (`src/components/pages/TermsPage.tsx`) | "Ads and paid plans": ads are labelled and come from advertisers; plans not on sale yet; price and refunds shown before paying |
