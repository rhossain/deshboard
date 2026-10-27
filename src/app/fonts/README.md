# Fonts

The site's web fonts, self-hosted (loaded by `src/app/layout.tsx` with `next/font/local`). All three are
published under the SIL Open Font License 1.1, which allows bundling them with the site.

| File | Font | What it is |
|---|---|---|
| `inter-latin.woff2` | Inter (variable) | Google Fonts' `latin` subset, weight axis cut to 400–700 |
| `inter-latin-ext.woff2` | Inter (variable) | the `latin-ext` subset (accented Latin), 400–700; fetched only when a page needs it |
| `noto-sans-bengali.woff2` | Noto Sans Bengali (variable) | the `bengali` subset, 400–700 |
| `fraunces-600-latin.woff2` | Fraunces | the `latin` subset at weight 600 (static), as Google serves it |

They started as the files Google Fonts served to this site's `next/font/google` builds (the same subsets,
so nothing changed visually). The variable ones were cut to the weights the site uses with fontTools:

```sh
pip install fonttools brotli
python3 - <<'EOF'
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
for name in ["inter-latin", "inter-latin-ext", "noto-sans-bengali"]:
    font = instancer.instantiateVariableFont(TTFont(f"{name}-full.woff2"), {"wght": (400, 700)})
    font.flavor = "woff2"
    font.save(f"{name}.woff2")
EOF
```

Why: the two preloaded files went from 157 KB to 112 KB (Noto Sans Bengali 108 → 76 KB, Inter 48 → 36 KB), and
a build no longer fetches anything from Google. To add a weight (say 300), re-cut from the full files with
`(300, 700)` and change `weight: "400 700"` in the layout.

## `og/`: the share image's fonts

`src/lib/og-card.tsx` draws every page's share picture at build time with Satori, which reads TTF, not WOFF2.
`og/` holds Fontsource's latin files for it (Sora 700, Inter 500 and 700; OFL), so the build fetches nothing.
No Bangla font: Satori has no shaping engine, and Bangla set without one comes out with its vowel signs in
the wrong places, so the pictures say their line in English (the pages' titles stay Bangla).
