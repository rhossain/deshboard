# Posting to the Facebook Page

The deploy posts the day's most covered stories to Bartaboard's Facebook Page
([facebook.com/bartaboard.bd](https://www.facebook.com/bartaboard.bd)) by itself, through Facebook's Page API. It
runs in the same GitHub Actions job as the news fetch, after the site is uploaded, so every post's link already
works. Paid ads are a different plan: [promotion.md](promotion.md).

- What to post: `src/lib/page-posts.ts` (headlines, and when), `src/lib/page-video-posts.ts` (videos)
- Posting it: `scripts/post-facebook.ts`, run by `.github/workflows/deploy.yml` (step "Post to the Facebook Page")

## What gets posted

**When.** Ten posts a day, at set times of the Dhaka day:

| Time | Post |
| --- | --- |
| 08:00 | headline |
| 09:15 | video |
| 10:30 | headline |
| 12:00 | video |
| 13:00 | roundup of 5 videos |
| 16:00 | headline |
| 17:30 | video |
| 19:00 | headline |
| 21:00 | roundup of 5 videos |
| 22:30 | headline |

A headline story breaking between those times (8 or more outlets within 90 minutes of its first headline) is posted
at once, at most twice a day. No two posts are less than 45 minutes apart. The deploy runs every 15 minutes, so a
post goes out within about 15 minutes of its time. After two weeks, Page Insights shows when the Page's readers are
actually online; the `FB_SLOTS` variable replaces the table: times, each a headline unless followed by `video` or
`roundup` (`08:00, 09:15 video, 13:00 roundup, 21:30`).

### Headlines

**Which story.** The story the most outlets are reporting lately (the Top stories ranking), if it:

- is in Bangla, and reported by **3 or more outlets**. A headline only one outlet has is too often a rumour, a
  scoop or a slant;
- is **still being reported**: its newest headline is under 2 hours old, its first under 12;
- wasn't posted in the last 24 hours, as the same headlines or as another story about the same thing;
- has **no sensitive words** in any of its headlines: sexual violence, suicide, graphic violence (কুপিয়ে, গলা কেটে,
  জবাই…), acid attacks, and pages that aren't news (রাশিফল, prayer times). The list is `SENSITIVE_BN` and
  `SENSITIVE_EN`;
- keeps its section under the **daily cap**: national 3, crime 1, other sections 2, opinion never. A story from the
  same section as the post before counts half, so sections take turns;
- has a headline **with a picture** in the share index (posts without one get a bare preview, so the story waits).

**Which outlet.** Of the story's headlines with a picture, the one from the outlet credited **least recently**. Over a
week every paper gets its turn, rather than the same few big ones: the Page is even-handed, as the board is.

**The post.** The headline, then the outlet and how many others report it, linking the headline's short link
(`bartaboard.com/s/…`). The link's preview shows the headline, the outlet's picture and "also reported by N other
outlets"; it opens Bartaboard's share page, with a button to the article. Facebook is asked to read the link afresh
first, so the preview is never stale. No article text, and no summary: the headline is the outlet's own.

```
সাবেক উপমন্ত্রী বীর মুক্তিযোদ্ধা আব্দুল হাই আর নেই

সংবাদ · আরও ২১টি সংবাদমাধ্যমেও এই খবর
https://bartaboard.com/s/261015-1npk6zjl
```

### Videos

TV channels' news videos from the Videos view (the channels' YouTube uploads). Each post links Bartaboard's page for
the video (`bartaboard.com/s/youtu.be/…`), which plays it there; its preview shows YouTube's thumbnail. Videos are
never downloaded or uploaded to the Page: the footage is the channels', and linking to it is what they publish it for.

**A video post** (09:15, 12:00, 17:30) is the video story most covered and watched lately, if:

- **2 or more channels** have it, and the newest is under 3 hours old;
- **no sensitive words** in any of its titles, the same list as headlines. Channels mask such words ("ধ/র্ষ/ণ",
  "আ গু ন"); they are unmasked first;
- neither its videos nor its subject were posted in the last 24 hours, **as a video or as a headline**: the Page
  doesn't post a fire as a headline at 10:30 and as a video at 12:00.

It credits the story's channel credited least recently (of its videos from the last 6 hours), the most watched among
equals.

```
গাজীপুরে বকেয়া বেতনের দাবিতে শ্রমিকদের মহাসড়ক অবরোধ

সময় টিভি · আরও ৬টি চ্যানেলেও এই খবর
https://bartaboard.com/s/youtu.be/89OZbHgCD2Y
```

**A roundup** (13:00, 21:00) is a carousel: the top five video stories since the last roundup (8 hours at most), one
card each, **every card from a different channel** and about a different thing. Stories two or more channels have
come first; a video only one channel has can fill in when it is much watched (2,000 views an hour). Each card links
the video's Bartaboard page, with its thumbnail, title and channel; the post's own link is the Videos page
(`/bn/videos/`). Its text numbers the five as the carousel has them:

```
দুপুরের শীর্ষ ৫ ভিডিও খবর

১. গাজীপুরে বকেয়া বেতনের দাবিতে শ্রমিকদের মহাসড়ক অবরোধ — সময় টিভি
২. ড্রাগ ইন্টারন্যাশনালে আগুনের পর বন্ধ উৎপাদন, গঠন হবে তদন্ত কমিটি — যমুনা টিভি
৩. আমানতকারীদের ১৮৮ কোটি টাকা ফেরত দিচ্ছে ন্যাশনাল ব্যাংক — চ্যানেল ২৪
৪. সারা দেশের মণ্ডপগুলোতে চলছে শেষ মুহূর্তের প্রস্তুতি — এখন টিভি
৫. বিএনপির সাবেক উপমন্ত্রী আব্দুল হাই মারা গেছেন — দেশ টিভি নিউজ
```

With fewer than three stories, a video post goes out instead. So does it if **Facebook refuses the carousel**:
carousels of links (`child_attachments`) are allowed only for links the Page can show as its own, which is what
**domain verification** (below) is for. Until bartaboard.com is verified, expect the roundups to come out as video
posts; the run's summary says so ("Roundup not posted …; posting a video instead"). Carousel cards are square, so
Facebook crops the thumbnails' sides.

## Turning it on: `FB_POSTING`

A repository variable (GitHub → Settings → Secrets and variables → Actions → Variables), in lower case:

| `FB_POSTING` | What happens |
| --- | --- |
| unset or `off` | Nothing. The posting steps are skipped. |
| `dry` | Each run picks as it would, posts nothing, and writes the pick to the run's summary page (Actions → the Deploy run → Summary). Needs no Facebook token: use it to judge the picks for a few days. |
| `review` | Each post is **scheduled 45 minutes ahead** of its time. It appears in Meta Business Suite → Content → Scheduled, where it can be edited or deleted before it goes out. A deleted post isn't replaced. |
| `on` | Posts at once. |

Setting it back to `off` stops posting from the next run (within 15 minutes); posts already scheduled in review
stay scheduled, so delete those in Business Suite if needed.

Suggested: `dry` for two or three days, then `review` for two weeks, then `on` once the picks are trusted.

## One-time setup in Meta

A Page access token that doesn't expire, made by a **system user** of the Bartaboard business portfolio (the one that
already has the Pixel). It belongs to the business, not to a person, so it keeps working if someone's password
changes or they leave.

1. **An app.** [developers.facebook.com](https://developers.facebook.com/apps) → Create app. Name it "Bartaboard
   poster", pick the use case for managing a Page's content (“Manage everything on your Page”), and connect it to the
   Bartaboard business portfolio.
2. **Make it live.** In the app's settings (App settings → Basic) set the privacy policy URL to
   `https://bartaboard.com/privacy/` and a category, then switch **App mode** to **Live**. While an app is in
   development, what it posts is shown only to the people who have a role on the app. No App Review is needed: the
   app only posts to a Page of its own business.
3. **A system user.** [business.facebook.com](https://business.facebook.com/settings) → Business settings → Users →
   System users → Add, an **Admin** system user called "bartaboard-poster". Then Assign assets → Pages → the
   Bartaboard Page, with **full control** (or at least "Create content").
4. **Its token.** On the system user, Generate new token → the app from step 1 → token expiry **Never** →
   permissions `pages_show_list`, `pages_read_engagement` and `pages_manage_posts`. Copy the token.
5. **The Page's own token.** The token from step 4 is the system user's; posting needs the Page's. Open
   [Graph API Explorer](https://developers.facebook.com/tools/explorer/), paste the token in "Access token", and run
   `GET me/accounts`. The Bartaboard entry has the Page's `id` and its `access_token`. Check it in the
   [Access Token Debugger](https://developers.facebook.com/tools/debug/accesstoken/): Type "Page", Expires "Never".
6. **GitHub.** Repository → Settings → Secrets and variables → Actions:
   - secret `FB_PAGE_TOKEN`: the Page's access token from step 5;
   - variable `FB_PAGE_ID`: the Page's id from step 5;
   - variable `FB_POSTING`: `dry`, then `review`, then `on` (above).

The token is a password to the Page: only ever in the GitHub secret, never in the code, a chat or a document.

Also worth doing once, for the Page and the site:

- **Domain verification** (Business settings → Brand safety → Domains → Add `bartaboard.com`): pick the DNS TXT
  record and add it in Cloudflare's DNS, then add the Page under the domain's "Assigned assets". It proves
  Bartaboard's links are the Page's own, lets the business control how they are previewed, and is what the video
  roundups' carousels need.
- The Page's **"Visit website"** button to `https://bartaboard.com/bn/`, and a **pinned post** saying what
  Bartaboard is, so a reader who arrives from a post knows what the Page is.

## Checking on it

- **Each run's pick**: Actions → Deploy → a run → Summary: what was posted (or would have been), its section, how
  many outlets, which was credited. A run with nothing due says so in the step's log.
- **Problems**: a Facebook error (an expired token, a permission missing) shows as a warning on the run and is tried
  again next run; it never stops the deploy. Error code 190 means the token is no longer valid: make a new one
  (steps 4–5).
- **What was posted** is kept in `.social/facebook.json`, in the Actions cache `facebook-posts-…`, for the repeat,
  daily-cap and outlet-turn rules. Deleting that cache only forgets the last week's history.
- **How it does**: Page Insights → Content: reach and link clicks per post, which sections and times work. Shared
  links stay untagged (promotion.md), so in Google Analytics they show as referrals from facebook.com.

## Trying it locally

```
npx tsx scripts/post-facebook.ts --site https://bartaboard.com
```

prints what the next headline slot would post from the live site's headlines, whatever the time; add
`--content video` or `--content roundup` for the videos. It never posts and keeps no history.
