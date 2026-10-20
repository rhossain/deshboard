# Instagram

Bartaboard posts carousels of headlines to Instagram through the same review queue as the Facebook Page
([admin.md](admin.md)): drafts ahead of each time, reviewed in the admin (Queue → Instagram) or on Telegram, posted
unless rejected. Built 20 October 2026.

## What goes out

- **Carousels of headlines**, at Instagram's own times (Settings → "Instagram's times"; by default the Page's five
  headline times, 08:00, 10:30, 16:00, 19:00 and 22:30). Picked by the Page's rules (page-posts.ts `pickHeadlines`:
  the most-covered fresh stories, one per outlet, not posted lately) against Instagram's own history. When too few
  stories pass, one headline goes out instead.
- **Pictures, not links.** Instagram shows no link previews, and links in captions can't be tapped. Each post is
  drawn as Bartaboard cards, 1080×1350 JPEG (src/lib/instagram-cards.ts): a green cover with the heading, the day and
  the numbered headlines, then one card per headline with its section, the headline, its outlet and how many other
  outlets carry it. No outlet's photos are used.
- **The caption** lists the headlines and their outlets, sends readers to bartaboard.com ("link in bio"), and adds a
  few tags. Editable in the admin, up to 2,200 characters.
- **No videos.** The board's videos are the channels' own, on YouTube, which Instagram can't link or embed;
  re-uploading them would be republishing their work. They stay Facebook-only.
- **No breaking-news posts** between the times (Facebook's breaking posts are link posts).

## How it works

```
every 15 minutes (deploy.yml → scripts/post-instagram.ts, after the Facebook step)
  1. drafts: each Instagram time gets one about 40 minutes ahead (the same lead as Facebook), refreshed every run
     until someone touches it, and sent to Telegram (📸 Instagram), with the cover picture as its preview
  2. pictures: drawn whenever a post's cards change (new draft, refresh, an edit in the admin), stored in the admin's
     database (table `media`), served at bartaboard.com/ig/<key>.jpg (functions/ig)
  3. what is due goes out: approved posts, and drafts whose policy lets them; 45 minutes late, skipped
```

Posting is Instagram's three steps (src/lib/instagram-graph.ts): a container per picture (Instagram fetches it from
bartaboard.com/ig/… then), a carousel container with the caption, and publishing it.

Everything else is shared with Facebook: Pause (and /pause on Telegram) stops both; the draft lead, the edit lock, the
policy for untouched drafts and the blocks a rejection adds apply to both. A rejected story is left out of both
platforms' picks.

**Editing.** As on Facebook: reorder, remove (a carousel keeps two), add or swap headlines from the board, up to nine
(the cover makes ten pictures, Instagram's limit). New cards, a new order or a new time, and the next run draws the
pictures again; until then the admin lists the cards instead. "Add a post" on the Instagram tab takes one headline from
the board (give it 20 minutes, for its picture to be drawn).

**Taking a post down** isn't possible from the admin: Instagram's API can't delete posts. Open it ("View on Instagram")
and delete it in the app.

## IG_POSTING

A repository variable (GitHub → Settings → Secrets and variables → Actions → Variables):

| IG_POSTING | What happens |
| --- | --- |
| unset or `off` | nothing |
| `dry` | drafts, pictures and Telegram as live; posts that come due become "trial picks", nothing goes to Instagram |
| `on` | posts to Instagram |

`IG_USER_ID` (variable, optional): the Instagram account's id. Without it the account connected to the Page is used.

Instagram allows 100 posts made through the API in 24 hours (Health shows how many are used); five a day is far below.

## Setting up

1. **An Instagram professional account.** In the Instagram app: profile → ☰ → Settings → "Account type and tools" →
   "Switch to professional account" → Business, category News & Media. Put **https://bartaboard.com** in the bio's
   link: every caption points there.
2. **Connect it to the Facebook Page**, in Meta Business Suite (business.facebook.com) → Settings → Accounts →
   Instagram accounts → Add (or from the Page: Settings → Linked accounts → Instagram). This also puts it in the
   Bartaboard business portfolio.
3. **Let the system user post to it.** Business settings → Users → System users → the one whose token is
   FB_PAGE_TOKEN → Assign assets → Instagram accounts → Bartaboard → full control.
4. **The app's permissions.** App Dashboard (developers.facebook.com) → the Bartaboard app → Use cases: add
   "Instagram API with Facebook Login" (or the Instagram use case that lists them) with **instagram_basic** and
   **instagram_content_publish**. For the business's own accounts, standard access is enough: no app review.
5. **A new system-user token** (Business settings → System users → Generate new token, the Bartaboard app, never
   expires) with the Page permissions it has now (pages_show_list, pages_read_engagement, pages_manage_posts, …) plus
   instagram_basic and instagram_content_publish. This is also the token rotation the setup notes asked for.
6. **Store it**: GitHub secret FB_PAGE_TOKEN, then run the ops workflow's **pages-secrets** task (the admin's Post now
   and Health use the Pages copy).
7. **The database**: run the ops workflow's **d1-migrate** task (migrations/0003_instagram.sql: the `media` table and
   posts' `permalink`). Facebook's queue doesn't depend on it.
8. **Check**: run the ops workflow's **ig-check** task: the token's Instagram permissions, the account connected to the
   Page, its posting allowance.
9. **Trial**: set IG_POSTING to `dry`. Drafts arrive on Telegram from the next Instagram time; look at the pictures
   and captions in the admin (Queue → Instagram).
10. **Live**: set IG_POSTING to `on`. The admin's badge says "Instagram · Live" after the next run.

## Where things are

| Part | Code |
| --- | --- |
| The run | `scripts/post-instagram.ts` (`npm run post:instagram`; locally, dry, with `--site https://bartaboard.com --db /tmp/ig.sqlite --pictures out/`) |
| The cards | `src/lib/instagram-cards.ts` (sharp; Pango and HarfBuzz set Bangla properly), fonts in `assets/fonts` (Noto Sans Bengali, OFL) |
| Caption, slide set, times | `src/lib/instagram-post.ts` (shared by the run, the admin and Telegram) |
| Instagram's API | `src/lib/instagram-graph.ts` |
| The pictures' address | `functions/ig/[name].ts`, from the `media` table (`social-store.ts` putMedia/getMedia) |
| The deploy step | `.github/workflows/deploy.yml` "Post to Instagram" (keep `main`'s copy the same: the timer runs `main`'s workflow) |

## When something breaks

- **"no Instagram professional account is connected to the Facebook Page"**: setup steps 1–2; ig-check shows what the
  token sees.
- **"(#10) … permission" or "(#200)"**: the token lacks instagram_content_publish, or the system user lacks the
  account (steps 3–5).
- **"Instagram couldn't take the pictures"**: Instagram couldn't fetch bartaboard.com/ig/… — open the picture's address
  from the admin; if Cloudflare's bot protection challenges it, allow `/ig/*` (Meta's fetcher must get through, as it
  does for link previews).
- **A post failed**: the next run tries again until 45 minutes after its time; "Try again" re-approves it. Telegram says
  why.
- **Stop Instagram only**: set IG_POSTING to `off` (or `dry`). Pause stops both platforms.
