# Bartaboard logo kit

Concept E: the pinned news card with the Bangladesh map, and the lowercase **barta**board wordmark set in Sora Bold.
All text is converted to outlines, so the SVGs look the same everywhere without the font installed.

## Which file to use

| Where | File |
| --- | --- |
| Site header (light theme) | `web/header-light.svg` (or `.webp` / `.png`, 2× for a 40 px tall header) |
| Site header (dark theme) | `web/header-dark.svg` (or `.webp` / `.png`) |
| About page, footer, emails (with tagline) | `web/logo-light.svg` / `web/logo-dark.svg` (or `.webp` / `.png`, 2× for 80 px tall) |
| Mark on its own (loading screens, watermarks, avatars) | `web/mark.svg` / `web/mark-dark.svg` |
| Favicon | `web/favicon.ico` (16/32/48) + `web/favicon.svg` (switches to the dark mark in dark mode) |
| iPhone home screen | `web/apple-touch-icon.png` (180×180) |
| Web-app manifest | `web/icon-192.png`, `web/icon-512.png`, `web/icon-maskable-512.png` (`"purpose": "maskable"`) |
| Print, signage, press, social graphics | `svg/` (vector masters) or `png/` (transparent, 2000–4000 px wide) |

Light versions go on white or light backgrounds. Dark versions go on near-black backgrounds (around `#0D1012`).

## The files

**`svg/`: vector masters (you can scale these to any size)**
- `bartaboard-logo-light.svg` / `-dark.svg`: mark + wordmark + tagline, horizontal
- `bartaboard-logo-compact-light.svg` / `-dark.svg`: mark + wordmark, no tagline
- `bartaboard-logo-stacked-light.svg` / `-dark.svg`: mark above the wordmark and tagline, for square spaces
- `bartaboard-wordmark-light.svg` / `-dark.svg`: the name only
- `bartaboard-mark.svg` / `-dark.svg`: the icon only
- `bartaboard-mark-small.svg`: simplified icon for 24–48 px (no needle, two lines)
- `bartaboard-app-icon.svg`: icon on a white rounded tile (1024)
- `favicon.svg`

**`png/`: high resolution, transparent background.** The width is in each file name, e.g. `bartaboard-logo-light-4000w.png`.

**`web/`: compact, ready to serve.** All raster files are exported at 2× their display size, so they stay sharp on retina screens.

| File | Display size (CSS px) | Weight |
| --- | --- | --- |
| `header-light.webp` / `-dark` | 219 × 40 | about 7 KB |
| `logo-light.webp` / `-dark` | 438 × 80 | about 18 KB |
| `mark.webp` / `-dark` | 74 × 64 | about 5 KB |
| `header-*.svg` | any | about 9 KB |

## Using it on the site

```html
<!-- header: SVG is sharpest; swap by theme -->
<img src="/brand/header-light.svg" width="219" height="40" alt="Bartaboard" class="logo-on-light">
<img src="/brand/header-dark.svg"  width="219" height="40" alt="" aria-hidden="true" class="logo-on-dark">

<!-- favicons (in Next.js App Router: put favicon.ico, icon.svg and apple-icon.png in src/app/) -->
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
```

## Colours

| Name | Hex | Use |
| --- | --- | --- |
| Flag green | `#006A4E` | "barta", map, back card (light) |
| Flag red | `#F42A41` | pin, middle card |
| Ink | `#0F1720` | "board" (light) |
| Slate | `#5B6470` | tagline (light), pin needle |
| Line grey | `#B9BFC8` | headline lines on the card |
| Bright green | `#34D08A` | "barta" (dark) |
| Dark-mode green | `#0B8460` | back card (dark) |
| Off-white | `#F4F5F7` | "board" (dark) |
| Mist | `#9AA3AE` | tagline (dark) |

**Typeface:** Sora (Bold 700 for the wordmark, Medium 500 for the tagline), from Google Fonts, under the SIL Open Font License.

## Rules

- **Clear space:** leave at least the height of the pin head on every side.
- **Minimum size:** compact logo 100 px wide on screen, full logo with tagline 220 px wide. Below 48 px use the mark only, and below 24 px use the favicon.
- **Don't** recolour, stretch, rotate or add effects. Don't put the light logo on dark photos; use the dark version, or put the logo on a solid panel.

## Regenerating

`source/` has the scripts that drew everything:
- `logo_kit.py` makes the SVGs.
- `logo_export.py` makes the PNG, WebP and ICO files.
- `map-full.txt` and `map-main.txt` hold the traced Bangladesh outline.

They need the Python packages `cairosvg`, `uharfbuzz`, `fonttools[woff]` and `Pillow`, plus `npm i @fontsource/sora`.
