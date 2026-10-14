# Bartaboard social kit

Profile, cover and highlight images for the Bartaboard social pages, in the brand colours and the new logo (brand-kit/).

## Files

| File | Size | Where it goes |
| --- | --- | --- |
| `profile-green.png` | 1080×1080 | Profile photo everywhere (Facebook, Instagram, X, YouTube, LinkedIn). Main choice. |
| `profile-cream.png` | 1080×1080 | Light alternative of the same photo. |
| `facebook-cover-light.png` | 1640×624 | Facebook Page cover (2× the 820×312 desktop display). Main choice. |
| `facebook-cover-dark.png` | 1640×624 | Dark alternative of the cover. |
| `ig-highlight-01…09-*.png` | 1080×1920 | Instagram Story Highlight covers: Top stories, Politics, World, Business, Sports, Entertainment, Tech, Videos, About. |
| `x-header.png` | 1500×500 | X (Twitter) header. |
| `youtube-banner.png` | 2560×1440 | YouTube channel banner (text sits in the 1546×423 area every device shows). |
| `linkedin-cover.png` | 1128×191 | LinkedIn Page cover. |
| `previews/` | | How the covers look with the profile photo over them, and the profile photo at small sizes. |
| `source/build.mjs` | | The script that draws them (Playwright + @fontsource Sora / Noto Sans Bengali + lucide-static; logos from brand-kit/svg). Edit the text or counts there and re-run. |

Facebook's desktop shows the cover at 820×312 with the profile photo over the bottom-left; the app shows roughly the
centre two-thirds. Everything that has to be read sits in that centre, and only the decorative cards sit at the edges.
The circle crop of the profile photo keeps the whole mark inside it, and it still reads at 40 px.

## More covers and profile photos (v2)

Alternatives drawn from the final logo. Covers are 1640×624; profile photos are 1080×1080.

| File | What it is |
| --- | --- |
| `facebook-cover-v2-1-pinned-green.png` | The logo on a white card pinned to a green board |
| `facebook-cover-v2-2-bangla-headline.png` | "দেশের সব খবর, এক বোর্ডে" in large type, with the logo underneath |
| `facebook-cover-v2-3-map.png` | Bangladesh map with pins on the divisional cities: "দেশের প্রতিটি প্রান্তের খবর, এক বোর্ডে" |
| `facebook-cover-v2-4-flag.png` | Green field with the red flag disc behind the mark |
| `facebook-cover-v2-5-masthead.png` | Newspaper-style masthead with section names |
| `facebook-cover-v2-6-dark-fan.png` | Dark background with the mark's cards fanned out |
| `profile-v2-1-ring.png` | The mark inside a green ring with a red arc |
| `profile-v2-2-flag.png` | The mark on the red flag disc over green |
| `profile-v2-3-map-pin.png` | White Bangladesh map on green with a red pin at Dhaka |
| `profile-v2-4-b-monogram.png` | Lowercase "b" with the red flag disc in its bowl |
| `profile-v2-5-dark.png` | The mark on charcoal (for dark themes) |

## Instagram feed posts (1080×1350)

Portrait versions of the six launch posts, scheduled on @bartaboard.bd at 8:00 pm (Bangladesh time), one a day from 14 to 19 October 2026, alongside the Facebook posts.

| File | Post | Link in caption |
|---|---|---|
| `ig-post-1-how-it-works.png` | How it works: the three steps | bartaboard.com |
| `ig-post-2-every-corner.png` | Every corner: map with division pins | bartaboard.com |
| `ig-post-3-tv-videos.png` | TV news videos (dark) | bartaboard.com/videos |
| `ig-post-4-in-bangla.png` | In Bangla | bartaboard.com/bn |
| `ig-post-5-sources.png` | Our sources: 50+ outlets | bartaboard.com/sources |
| `ig-post-6-search-save.png` | Search and save | bartaboard.com |

Rebuild with `node source/ig_posts.mjs` from the build folder (needs Playwright, Sora and Noto Sans Bengali from @fontsource, `map-full.txt` and the kit SVGs).

## Page copy

- **Name:** Bartaboard
- **Username:** @bartaboard (or the nearest free one; keep it the same on every platform)
- **Category:** News & Media Website
- **Website:** https://bartaboard.com

**Facebook intro (101 characters max):**
> Bangladesh news on one board: Bangla & English headlines from 50+ newspapers and 30+ TV channels.

**Facebook About / description:**
> Bartaboard brings Bangladesh's news together on one board. Latest headlines from 50+ Bangla and English newspapers,
> top stories, and 30+ TV news channels' videos, updated every 15 minutes. Every headline links straight to the paper
> that published it. দেশের সব খবর, এক বোর্ডে।

**Instagram bio (150 characters max):**
> Bangladesh News. On Your Board. 📌
> দেশের সব খবর, এক বোর্ডে
> 50+ newspapers · 30+ TV channels · Bangla & English

## Facebook & Instagram ads (October 2026)

In `ads/`. Bangla, built from real screens of the live site's **sports** section (no political headlines on screen,
so Meta doesn't treat them as political ads). Outlets appear by name only, never as the subject of an ad.

| File | Size | Use for |
|---|---|---|
| `bartaboard-reel-1-all-papers.mp4` | 1080×1920, 15 s | Reels & Stories, Bangladesh |
| `bartaboard-reel-2-probashi.mp4` | 1080×1920, 15 s | Reels & Stories, probashi (Gulf, Malaysia, Europe, US) |
| `bartaboard-reel-3-top-stories.mp4` | 1080×1920, 15 s | Reels & Stories, both |
| `bartaboard-feed-1-all-papers.png` | 1080×1350 | Feed, Bangladesh (pairs with reel 1) |
| `bartaboard-feed-2-probashi.png` | 1080×1350 | Feed, probashi (pairs with reel 2) |
| `bartaboard-feed-3-top-stories.png` | 1080×1350 | Feed, both (pairs with reel 3) |
| `bartaboard-feed-4-fifty-outlets.png` | 1080×1350 | Feed, both |
| `bartaboard-feed-video-1…3-*.mp4` | 1080×1350, 15 s | Feed version of each reel (the middle 4:5 of it) |
| `*-cover.png` | 1080×1920 | Thumbnails for the reels |

The videos are silent: add a track from Meta's music library in Ads Manager (Reels do better with sound). In each
ad, turn off Advantage+ creative "text improvements" and "visual touch-ups", which can rewrite or crop the Bangla.
In a video ad, give Feeds its `feed-video` (Ads Manager's "Replace media for Feeds" takes only video); the feed
images are for image ads.

**Ad text** (Website URL: `https://bartaboard.com/bn/`; URL parameters as in `docs/promotion.md`; button: Learn more):

1. **All papers**
   - Primary text: সকালে খবর পড়তে দশটা পত্রিকার সাইট একটা একটা করে খোলেন? 📰 বার্তাবোর্ডে ৫০টির বেশি সংবাদমাধ্যমের সর্বশেষ শিরোনাম এক পেজে, প্রতি ১৫ মিনিটে হালনাগাদ। ফ্রি, অ্যাপ নামাতে হবে না।
   - Headline: সব পত্রিকা, এক পেজে
   - Description: ফ্রি · অ্যাপ লাগবে না
2. **Probashi**
   - Primary text: প্রবাসে বসে দেশের খবর খুঁজতে এক সাইট থেকে আরেক সাইটে? 🌍 বার্তাবোর্ডে দেশের ৫০টির বেশি সংবাদমাধ্যমের খবর এক জায়গায়, বাংলা ও ইংরেজিতে, প্রতি ১৫ মিনিটে নতুন। একদম ফ্রি।
   - Headline: প্রবাসে বসেও দেশের সব খবর
   - Description: বাংলা ও English · ফ্রি
3. **Top stories**
   - Primary text: একই খবর কোন পত্রিকা কীভাবে লিখল, এক নজরে দেখুন। বার্তাবোর্ডের "শীর্ষ খবর" একই ঘটনার সব শিরোনাম পাশাপাশি সাজায়: যত বেশি মাধ্যমে খবর, তত ওপরে।
   - Headline: কে কী লিখল, এক নজরে
   - Description: ৫০টির বেশি সংবাদমাধ্যম · ফ্রি
4. **Fifty outlets** (image only)
   - Primary text: ৫০টির বেশি সংবাদমাধ্যম। একটি পেজ। ফ্রি। দেশের সব খবর এক জায়গায় পড়ুন।
   - Headline: দেশের সব খবর, এক জায়গায়
   - Description: bartaboard.com

Rebuild: `node source/ads_capture_screens.mjs` and `node source/ads_record_screens.mjs` record the phone screens from
the live site (analytics blocked), then `node source/ads_video.mjs` (Playwright frames → ffmpeg H.264) and
`node source/ads_images.mjs`, from the build folder as for the posts above.
