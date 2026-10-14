# Promoting Bartaboard: Facebook and Instagram ads

How Bartaboard's own ads on Facebook and Instagram are measured. (Showing ads *on* Bartaboard is a different
plan: [ads.md](ads.md).)

The aim is readers who come back, not clicks. A news site is worth advertising only if the reader an ad brings
opens it again on another day, so every ad is judged by **cost per returning reader**.

## What the site does

- **Meta Pixel** (`src/components/MetaPixel.tsx`): dataset "Bartaboard website", id `1098005036277817`, in the
  Bartaboard business portfolio's Events Manager. Live builds get the id from `deploy.yml` (a `META_PIXEL_ID`
  repository variable overrides it; `off` turns it off). It sends:
  - `PageView` on the page a reader lands on, and on each later page (the Pixel follows the board's address changes);
  - `ReturnVisit` (custom event, `days` = days visited so far) on the first page of a day after a visit on an
    earlier day. Counted in the browser only (`src/lib/visits.ts`).
  Nothing else: no headlines read, no searches, no account details.
- **Consent**: the Pixel is the "Ads" purpose of the cookie question (`src/lib/consent.ts`). It runs straight away
  outside the EU/EEA, UK and Switzerland, and there only after a reader accepts ads; turning it off deletes `_fbp` and
  `_fbc`. The privacy policy's "Our ads on Facebook" section says what it collects.
- **Arrival tags kept** (`src/lib/landing.ts`): the board rewrites the address to its filters as it starts, which
  dropped `utm_*` and `fbclid` before Google Analytics or the Pixel had loaded. Both now read the address the reader
  arrived at: GA gets it as the first page's `page_location`, the Pixel's `_fbc` cookie is set from `fbclid`.

## Tagging links

Put this in each ad's **URL parameters** field in Ads Manager (Ad → Destination → Website → URL parameters). Meta
fills in the names, so one setting serves every ad:

```
utm_source={{site_source_name}}&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_term={{adset.name}}&utm_content={{ad.name}}
```

`{{site_source_name}}` becomes `fb`, `ig`, `msg` or `an`, so Google Analytics shows Facebook and Instagram apart.
Name campaigns, ad sets and ads plainly (`probashi-test`, `bd-18-45-broad`, `reel-scroll-bn`): those names are
what the reports show.

Website URL for the ad:

| Ad language | Website URL |
| --- | --- |
| Bangla | `https://bartaboard.com/bn/` |
| English | `https://bartaboard.com/` |

Links outside ads (no Ads Manager to fill them in):

| Where | Link |
| --- | --- |
| Facebook Page posts | `https://bartaboard.com/bn/?utm_source=facebook&utm_medium=social&utm_campaign=page_post` |
| Instagram bio | `https://bartaboard.com/bn/?utm_source=instagram&utm_medium=social&utm_campaign=bio` |
| WhatsApp channel | `https://bartaboard.com/bn/?utm_source=whatsapp&utm_medium=social&utm_campaign=channel` |
| Facebook groups | `https://bartaboard.com/bn/?utm_source=facebook&utm_medium=social&utm_campaign=groups` |

Shared headline links (`/s/…`) stay untagged: they carry the headline, and readers pass them on.

## Reading the results

- **Google Analytics** → Reports → Acquisition → Traffic acquisition, by *Session campaign* / *Session manual ad
  content*: sessions, engaged sessions and average engagement time per campaign and ad. Explore → Cohort exploration
  by first session campaign shows who came back.
- **Events Manager** → Bartaboard website → Overview: `PageView` and `ReturnVisit` counts. Test events checks a
  browser live.
- **Ads Manager**: make a **custom conversion** from the `ReturnVisit` event, and add it as a column. Its cost per
  result is the cost per returning reader.
- **Audiences**: a Custom Audience of website visitors (last 30 days) for showing ads again, cheaply, to readers
  who have already been; later a Lookalike of the `ReturnVisit` audience.

## Rules of thumb for the test week

- Traffic objective, optimised for **landing page views**; mobile only; **Audience Network off**.
- Pause an ad that costs more than twice the average per landing page view, or gets under 1% click-through, once it
  has spent about ৳1,500.
- No party names, leaders or election headlines in an ad (Meta treats those as political ads, which need ID checks
  and a "Paid for by" label). No outlet's logo as the ad's subject.
