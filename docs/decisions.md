# Product decisions

Choices made on purpose, with the reasons, so they aren't reopened without new evidence. Newest first.

## The Page's posts are reviewed in a queue, behind Cloudflare Access (19 October 2026)

**Decision:** posts for the Facebook Page go through a review queue: each slot's post is drafted an hour ahead, sent
to the owner on Telegram with Approve / Reject / Skip buttons, and posted on time unless rejected; breaking news posts
at once and the owner is told. The admin page sits behind Cloudflare Access; its data is in Cloudflare D1.

**Why:**

- The owner wants to see and change posts before they go out, but won't be at a desk ten times a day: posting unless
  rejected keeps the Page going without him, and a tap on Telegram is quicker than opening a page.
- Breaking news is worth only while it is breaking; waiting for a review would lose it.
- No server to run: Access, D1 and Pages Functions are free on the plan the site already uses, in the same account,
  and Access keeps the admin's pages and API closed to everyone else without writing a login.
- Supabase (reader accounts) pauses a free project after a week without use; the posting pipeline mustn't depend on it.
- Drafts an hour ahead, not a day: a story is only posted while it is still being reported, so a pick made much
  earlier would be stale by its time.

**How it works:** [admin.md](admin.md).

**Revisit if:** the owner rarely rejects anything after the first weeks (then the queue could post without drafting
ahead), or reviews need more than one person (add them to the Access policy).

## The theme follows the reader's device (14 October 2026)

**Decision:** keep "system" as the default theme. The site is light or dark as the reader's phone or computer is,
until they pick one with the theme switch (remembered in their browser). Light is not forced by default.

**Why:**

- Most readers already get the light theme: light mode is the out-of-the-box setting on almost every Android phone,
  iPhone and PC. Forcing light would only change things for readers who chose dark on purpose.
- Those readers often read news at night, in bed. A bright white page then is the reason they turned dark mode on,
  and a harsh flash is more likely to lose them than to win them.
- Facebook, WhatsApp and YouTube follow the system setting too. A shared link that opens bright white inside a dark
  Facebook app looks out of place.
- Nothing shows that dark is costing readers.

**How it works:** `src/lib/theme.ts` (`THEME_SCRIPT` applies a saved choice before the first paint) and the
`prefers-color-scheme` rules in `src/app/globals.css`.

**Revisit if:** analytics show many dark-mode visitors switching to light, or leaving sooner than light-mode ones.
Recording the theme each visit gets, and switches, as a Google Analytics event would show it. Until then, make the
light theme better (colours, contrast) rather than force it.
