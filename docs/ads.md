# Ads: plan and what readers are told

*Ads shown **on** Bartaboard. Bartaboard's own ads on Facebook and Instagram, and the Meta Pixel that measures them,
are in [promotion.md](promotion.md).*

A plan, not a build. Bartaboard shows no ads today and launches without them; ads come once traffic is steady
(see [When to start](#when-to-start)). Ads and paid plans (see [subscriptions.md](subscriptions.md)) are how it will
pay for itself.

The site's pages say only what runs today: Cloudflare Web Analytics (no cookies) and no ads, with ads "planned".
The wording for when ads and Google Analytics arrive is drafted below in [Wording for launch](#8-wording-for-launch),
ready to put back into the pages, along with the cookie question already built behind `CONSENT`.

## When to start

- Launch without ads, and watch Cloudflare Web Analytics (Cloudflare → Analytics & Logs → Web Analytics →
  bartaboard.com) from the first day.
- Apply for AdSense once traffic is steady, for example a few thousand visitors a day for a month, with readers
  coming back. Google gives no number, but turns down new or quiet sites, and aggregators risk being judged
  "low-value content"; the section intros, FAQ, About and outlet pages are the site's own content.
- Ads earn little per Bangladeshi visitor, so revenue follows traffic; direct sponsors pay more per view.

## 1. Ground rules

1. **Ads never look like headlines.** Each is labelled "Ad" / "বিজ্ঞাপন", sits in its own box and is never mixed into
   a list of headlines without that label.
2. **The free board stays whole.** No feature is taken away from the free board to make room for ads or to sell a plan.
3. **Readers hear first.** The privacy policy names the ad provider and what it collects before the first ad is
   shown, not after. A provider other than AdSense needs adding to it first.
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
- `CONSENT` = `on` turns on the cookie question (`src/lib/consent.ts`, `src/components/ConsentBanner.tsx`): readers
  outside Bangladesh get a card with Accept / Reject / Choose before any analytics or ad cookie, and "Cookie
  choices" in the footer to change it later. Bangladesh is told by Cloudflare's country for the connection
  (`/cdn-cgi/trace`, falling back to the device's time zone); readers there aren't asked. An analytics or ad script
  loads only when `allowed("analytics")` / `allowed("ads")` says so, so turn `CONSENT` on with the first one.
  `?consent=preview` shows the card on one device. It stays off at launch: Cloudflare Web Analytics sets no cookies
  and needs no consent. Its card links to the privacy policy's Ads section, so that section's launch wording (below)
  goes in first.

## 6. Checklist before the first ad

1. Pick the provider; get AdSense approval (or sign the first sponsor).
2. Update the privacy policy, the About page and the FAQ with the wording in [section 8](#8-wording-for-launch),
   and change the policy's date. A provider other than AdSense needs naming there too.
3. Decide where readers are asked (section 5): Google's own consent message alone, for the EEA, UK, Switzerland
   and the US states that need one, or also our card for everyone outside Bangladesh. The policy's consent
   sentence says whichever is chosen.
4. Add `public/ads.txt` (AdSense).
5. ~~Add the consent banner~~ Built (above), for everyone outside Bangladesh. **AdSense still needs Google's own
   consent message for the EEA, UK and Switzerland:** Google only serves personalised ads there with a
   Google-certified consent platform (IAB TCF). AdSense has a free one (Privacy & messaging → European regulations
   message); turn it on for those countries and load ads there only after it answers. Our card covers analytics
   and the rest of the world.
6. Check layout shift and load time on a phone with ads on (`?ads=preview`), in both themes.
7. Port to both branches (`main` and `static-export`).

## 7. Where readers are told

Keep these in step whenever the plan changes, in English and Bangla:

| Page | What it says now |
| --- | --- |
| About (`src/components/pages/AboutPage.tsx`) | "Free, with ads and paid plans to come": no ads and no tracking cookies today, visits counted without cookies; ads planned, labelled, and named in the privacy policy before the first; paid plans optional, free features stay free |
| Privacy (`src/components/pages/PrivacyPage.tsx`) | No personal data kept for readers without an account; no ads, no tracking cookies; "Analytics": Cloudflare Web Analytics, no cookies, only totals; "Ads": none yet, the policy changes before the first |
| FAQ (`src/lib/intros.ts`) | "Is it free?": free, no ads, no account needed |
| Terms (`src/components/pages/TermsPage.tsx`) | "Ads and paid plans": ads are labelled and come from advertisers; plans not on sale yet; price and refunds shown before paying |

## 8. Wording for launch

Drafted 13 October 2026 and taken off the pages until ads start: put it back in English and Bangla, with the
policy's date changed. The consent sentence fits the cookie card in section 5; reword it if only Google's message
asks (for example "Where the law requires it, we ask for your consent before ad cookies are set").

### Privacy policy (`src/components/pages/PrivacyPage.tsx`)

"Reading without an account", in place of "There are no ads and no tracking cookies":

> We may use analytics and show ads, and both can use cookies: see Analytics and Ads below for what those services
> collect and how to opt out.
>
> আমরা অ্যানালিটিক্স ব্যবহার করতে ও বিজ্ঞাপন দেখাতে পারি, আর দুটোই কুকি ব্যবহার করতে পারে: সেবাগুলো কী তথ্য নেয়
> আর কীভাবে বেরিয়ে থাকবেন, তা নিচের অ্যানালিটিক্স ও বিজ্ঞাপন অংশে দেখুন।

**Analytics** (`id="analytics"`), only if Google Analytics is added:

> To learn how the site is used and how fast it loads, we may use analytics services such as Cloudflare Web Analytics
> and Google Analytics. They record things like the pages you open, the site you came from, your browser and device,
> and your approximate location (from your IP address), and some use cookies or similar identifiers to recognise a
> returning visitor. Bartaboard doesn't keep any of it: these services process it under their own privacy policies,
> and we see only totals, such as page views and visits, to improve the site. Read [how Google uses information from
> sites that use its services](https://policies.google.com/technologies/partner-sites); you can opt out of Google
> Analytics with the [Google Analytics opt-out browser add-on](https://tools.google.com/dlpage/gaoptout).
>
> সাইট কীভাবে ব্যবহার হয় আর কত দ্রুত খোলে তা বুঝতে আমরা ক্লাউডফ্লেয়ার ওয়েব অ্যানালিটিক্স বা গুগল অ্যানালিটিক্সের মতো
> সেবা ব্যবহার করতে পারি। এগুলো রাখে আপনি কোন পাতা খুলছেন, কোন সাইট থেকে এসেছেন, আপনার ব্রাউজার ও ডিভাইস, আর আপনার
> আইপি ঠিকানা থেকে আনুমানিক অবস্থানের মতো তথ্য; কোনো কোনোটি আবার-আসা ভিজিটরকে চিনতে কুকি বা এ ধরনের শনাক্তকারী
> ব্যবহার করে। এর কিছুই বার্তাবোর্ড রাখে না: সেবাগুলো নিজেদের গোপনীয়তা নীতি অনুযায়ী এই তথ্য সামলায়, আর সাইট ভালো
> করতে আমরা দেখি শুধু মোট হিসাব, যেমন কতবার পাতা খোলা হলো বা কতজন এলেন। [গুগল এ তথ্য কীভাবে ব্যবহার
> করে](https://policies.google.com/technologies/partner-sites) পড়ে দেখতে পারেন; [Google Analytics opt-out browser
> add-on](https://tools.google.com/dlpage/gaoptout) দিয়ে গুগল অ্যানালিটিক্স থেকে বেরিয়ে থাকতে পারেন।

**Ads** (`id="ads"`). The first two bullets are the sentences AdSense's policies require:

> To pay for running Bartaboard, we may show ads, including from Google AdSense and other ad networks. Ads are marked
> as ads and kept apart from the headlines. The ad networks collect what is described below under their own privacy
> policies; Bartaboard doesn't keep it.
>
> - Third-party vendors, including Google, use cookies to serve ads based on your prior visits to Bartaboard and
>   other websites.
> - Google's use of advertising cookies enables it and its partners to serve ads to you based on your visits to
>   Bartaboard and/or other sites on the Internet.
> - You can opt out of personalised advertising in Google's [My Ad Center](https://myadcenter.google.com/), and out of
>   some other vendors' cookies at [aboutads.info](https://optout.aboutads.info/).
> - Outside Bangladesh, we ask for your consent before any analytics or ad cookies are set, and you can change your
>   choice at any time from "Cookie choices" at the foot of the page. We tell where you are from Cloudflare's country
>   for your connection, which isn't kept.
> - We never give advertisers your account's email address, saved stories or alerts.
>
> বার্তাবোর্ড চালানোর খরচ মেটাতে আমরা গুগল অ্যাডসেন্স ও অন্যান্য বিজ্ঞাপন নেটওয়ার্কের বিজ্ঞাপন দেখাতে পারি।
> বিজ্ঞাপনে "বিজ্ঞাপন" লেখা থাকে, আর সেগুলো শিরোনাম থেকে আলাদা থাকে। নিচে যে তথ্যের কথা বলা আছে, তা বিজ্ঞাপন
> নেটওয়ার্কগুলো নিজেদের গোপনীয়তা নীতি অনুযায়ী নেয়; বার্তাবোর্ড তা রাখে না।
>
> - গুগলসহ তৃতীয় পক্ষের বিক্রেতারা বার্তাবোর্ডে ও অন্য ওয়েবসাইটে আপনার আগের ভিজিটের ভিত্তিতে বিজ্ঞাপন দেখাতে কুকি
>   ব্যবহার করে।
> - বিজ্ঞাপন কুকির মাধ্যমে গুগল ও তার অংশীদাররা বার্তাবোর্ডে এবং/অথবা ইন্টারনেটের অন্য সাইটে আপনার ভিজিটের
>   ভিত্তিতে আপনাকে বিজ্ঞাপন দেখাতে পারে।
> - ব্যক্তিগতকৃত বিজ্ঞাপন বন্ধ করতে পারেন গুগলের [My Ad Center](https://myadcenter.google.com/)-এ, আর অন্য কিছু
>   বিক্রেতার কুকি বন্ধ করতে পারেন [aboutads.info](https://optout.aboutads.info/)-তে।
> - বাংলাদেশের বাইরে কোনো অ্যানালিটিক্স বা বিজ্ঞাপন কুকি রাখার আগে আমরা আপনার সম্মতি চাই, আর পাতার নিচে "কুকির
>   পছন্দ" থেকে যেকোনো সময় সিদ্ধান্ত বদলাতে পারেন। আপনি কোথায় আছেন তা আমরা বুঝি আপনার সংযোগের জন্য
>   ক্লাউডফ্লেয়ারের জানানো দেশ থেকে, যা রাখা হয় না।
> - আপনার অ্যাকাউন্টের ইমেইল ঠিকানা, সংরক্ষিত খবর বা অ্যালার্ট আমরা কখনো বিজ্ঞাপনদাতাদের দিই না।

**Cookies and your choices**:

> You can block or delete cookies in your browser's settings. Bartaboard still works without them; ads may just be
> less relevant.
>
> ব্রাউজারের সেটিংস থেকে কুকি আটকাতে বা মুছতে পারেন। কুকি ছাড়াও বার্তাবোর্ড চলে; শুধু বিজ্ঞাপন হয়তো কম প্রাসঙ্গিক
> হবে।

Description (page metadata): "What Bartaboard, its analytics and its ads collect about you, your choices, and how to
delete your data." / "বার্তাবোর্ড, এর অ্যানালিটিক্স ও বিজ্ঞাপন আপনার সম্পর্কে কী তথ্য নেয়, আপনার কী বেছে নেওয়ার
আছে, আর কীভাবে মুছবেন।"

### About (`src/components/pages/AboutPage.tsx`)

Heading "Free, paid for by ads and optional plans" / "বিনা মূল্যে; খরচ মেটে বিজ্ঞাপন ও ঐচ্ছিক প্ল্যানে", and:

> **Your data.** Your saved stories, pinned sources and settings stay in your own browser. We may use analytics to
> see how the site is used, and ads may use cookies; the privacy policy says what each collects and how to opt out.
>
> **Ads.** To pay for running Bartaboard, we may show ads. They are marked as ads and kept apart from the headlines.
>
> **আপনার তথ্য।** আপনার সংরক্ষিত খবর, পিন করা উৎস আর সেটিংস আপনার নিজের ব্রাউজারেই থাকে। সাইট কীভাবে ব্যবহার
> হয় তা দেখতে আমরা অ্যানালিটিক্স ব্যবহার করতে পারি, আর বিজ্ঞাপন কুকি ব্যবহার করতে পারে; কোনটি কী তথ্য নেয় আর কীভাবে
> বেরিয়ে থাকবেন, তা আছে গোপনীয়তা নীতিতে।
>
> **বিজ্ঞাপন।** বার্তাবোর্ড চালানোর খরচ মেটাতে আমরা বিজ্ঞাপন দেখাতে পারি। বিজ্ঞাপনে "বিজ্ঞাপন" লেখা থাকে, আর
> সেগুলো শিরোনাম থেকে আলাদা থাকে।

### FAQ (`src/lib/intros.ts`), "Is it free?"

> Yes. Reading Bartaboard is free, and you don't need an account. It may show ads to pay for itself.
>
> হ্যাঁ। বার্তাবোর্ড পড়তে কোনো টাকা লাগে না, অ্যাকাউন্টও লাগে না। খরচ মেটাতে বিজ্ঞাপন দেখানো হতে পারে।
