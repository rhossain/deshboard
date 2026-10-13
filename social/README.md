# Bartaboard social kit

Profile, cover and highlight images for the Bartaboard social pages, in the site's colours and logo.

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
| `source/build.mjs` | | The script that draws them (Playwright + @fontsource Montserrat / Noto Sans Bengali + lucide-static). Edit the text or counts there and re-run. |

Facebook's desktop shows the cover at 820×312 with the profile photo over the bottom-left; the app shows roughly the
centre two-thirds. Everything that has to be read sits in that centre, and only the decorative cards sit at the edges.
The circle crop of the profile photo keeps the whole mark inside it, and it still reads at 40 px.

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
