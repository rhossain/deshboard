# Product decisions

Choices made on purpose, with the reasons, so they aren't reopened without new evidence. Newest first.

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
