"""Builds the Bartaboard logo kit (concept E: flat map card + Sora lowercase wordmark)."""
import io, os, re, json
import cairosvg, uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
from PIL import Image

OUT = "/home/claude/social/kit"
for d in ["svg", "png", "web"]:
    os.makedirs(f"{OUT}/{d}", exist_ok=True)

GREEN, RED, INK, MUTED = "#006A4E", "#F42A41", "#0F1720", "#5B6470"
D_GREEN, D_BARTA, D_INK, D_MUTED = "#0B8460", "#34D08A", "#F4F5F7", "#9AA3AE"
MAP_FULL = open("map-full.txt").read().strip()
MAP_MAIN = open("map-main.txt").read().strip()

# ---------- mark ----------
def mark(dark=False, size="full"):
    g = D_GREEN if dark else GREEN
    stroke = "" if dark else ' stroke="#DFE2E7" stroke-width="1"'
    needle = D_MUTED if dark else MUTED
    if size == "full":
        return f'''<rect x="4" y="17" width="44" height="34" rx="6.5" fill="{g}" transform="rotate(-10 26 34)"/>
<rect x="10" y="22" width="44" height="32" rx="6.5" fill="{RED}" transform="rotate(-3 32 38)"/>
<g transform="rotate(-5 35 28)">
<rect x="12" y="10" width="48" height="36" rx="6.5" fill="#FFFFFF"{stroke}/>
<path transform="translate(16 13.5) scale(0.2985)" fill="{GREEN}" d="{MAP_FULL}"/>
<rect x="37.5" y="18.5" width="18" height="3.2" rx="1.6" fill="#B9BFC8"/>
<rect x="37.5" y="24.9" width="18" height="3.2" rx="1.6" fill="#B9BFC8"/>
<rect x="37.5" y="31.3" width="18" height="3.2" rx="1.6" fill="#B9BFC8"/>
<rect x="37.5" y="37.7" width="11" height="3.2" rx="1.6" fill="#B9BFC8"/>
</g>
<line x1="44.6" y1="9.5" x2="42.2" y2="15" stroke="{needle}" stroke-width="1.4" stroke-linecap="round"/>
<circle cx="45" cy="8.8" r="4.8" fill="{RED}"/>
<circle cx="43.6" cy="7.4" r="1.4" fill="#FFFFFF" fill-opacity="0.65"/>'''
    if size == "small":  # 24–48 px: no needle, fewer lines, bolder
        return f'''<rect x="4" y="17" width="44" height="34" rx="6.5" fill="{g}" transform="rotate(-10 26 34)"/>
<rect x="10" y="22" width="44" height="32" rx="6.5" fill="{RED}" transform="rotate(-3 32 38)"/>
<g transform="rotate(-5 35 28)">
<rect x="12" y="10" width="48" height="36" rx="7" fill="#FFFFFF" stroke="{'#FFFFFF' if dark else '#C9CED6'}" stroke-width="1.6"/>
<path transform="translate(15.5 13) scale(0.3226)" fill="{GREEN}" d="{MAP_MAIN}"/>
<rect x="38.5" y="20" width="17" height="4.4" rx="2.2" fill="#B9BFC8"/>
<rect x="38.5" y="29" width="13" height="4.4" rx="2.2" fill="#B9BFC8"/>
</g>
<circle cx="45" cy="8.8" r="5.6" fill="{RED}"/>'''
    # tiny: 16 px favicon
    return f'''<rect x="2" y="15" width="50" height="40" rx="8" fill="{g}" transform="rotate(-10 26 34)"/>
<rect x="12" y="8" width="50" height="40" rx="8" fill="#FFFFFF" stroke="{'#FFFFFF' if dark else '#B9BEC7'}" stroke-width="3" transform="rotate(-5 36 28)"/>
<path transform="translate(17 11) scale(0.37)" fill="{GREEN}" d="{MAP_MAIN}"/>
<circle cx="48" cy="10" r="8" fill="{RED}"/>'''

# ---------- text to outlines ----------
def load(weight):
    p = f"node_modules/@fontsource/sora/files/sora-latin-{weight}-normal.woff2"
    data = open(p, "rb").read()
    tt = TTFont(io.BytesIO(data))
    tt.flavor = None
    raw = io.BytesIO(); tt.save(raw)
    tt = TTFont(io.BytesIO(raw.getvalue()))
    face = hb.Face(raw.getvalue())
    font = hb.Font(face)
    return tt, font

FONTS = {w: load(w) for w in (500, 700)}

def text_path(text, weight, size, x, y, tracking_em=0.0):
    """Returns (svg path d, advance width, bounds) for text laid out with HarfBuzz (kerning on)."""
    tt, font = FONTS[weight]
    upem = tt["head"].unitsPerEm
    buf = hb.Buffer(); buf.add_str(text); buf.guess_segment_properties()
    hb.shape(font, buf, {"kern": True, "liga": True})
    gs = tt.getGlyphSet(); order = tt.getGlyphOrder()
    s = size / upem
    pen = SVGPathPen(gs)
    bp = BoundsPen(gs)
    cx = 0
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        name = order[info.codepoint]
        # flip y (font units are y-up)
        t = (s, 0, 0, -s, x + (cx + pos.x_offset) * s, y - pos.y_offset * s)
        gs[name].draw(TransformPen(pen, t))
        gs[name].draw(TransformPen(bp, t))
        cx += pos.x_advance + tracking_em * upem
    cmds = re.sub(r"(-?\d+\.\d)\d+", r"\1", pen.getCommands())
    return cmds, (cx - tracking_em * upem) * s, bp.bounds

# ---------- composition ----------
def wordmark(x, y, dark=False, size=88):
    d1, w1, b1 = text_path("barta", 700, size, x, y, -0.045)
    d2, w2, b2 = text_path("board", 700, size, x + w1 - 0.045 * size, y, -0.045)
    c1 = D_BARTA if dark else GREEN
    c2 = D_INK if dark else INK
    bounds = (min(b1[0], b2[0]), min(b1[1], b2[1]), max(b1[2], b2[2]), max(b1[3], b2[3]))
    return f'<path fill="{c1}" d="{d1}"/>\n<path fill="{c2}" d="{d2}"/>', bounds

def tagline(x, y, dark=False, size=19):
    d, w, b = text_path("Bangladesh news, on your board.", 500, size, x, y)
    return f'<path fill="{D_MUTED if dark else MUTED}" d="{d}"/>', b

def svg_doc(body, vb, title):
    x, y, w, h = vb
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x:.2f} {y:.2f} {w:.2f} {h:.2f}" '
            f'width="{w:.0f}" height="{h:.0f}" role="img" aria-label="{title}">\n<title>{title}</title>\n{body}\n</svg>\n')

def trim(body, title, pad=0.0, canvas=(-50, -50, 1400, 600)):
    """Render on a big canvas, measure the ink, and return an SVG whose viewBox hugs it (+pad)."""
    tmp = svg_doc(body, canvas, title)
    scale = 4
    png = cairosvg.svg2png(bytestring=tmp.encode(), output_width=int(canvas[2] * scale))
    im = Image.open(io.BytesIO(png)); bb = im.getchannel("A").point(lambda a: 255 if a > 2 else 0).getbbox()
    x0 = canvas[0] + bb[0] / scale - pad; y0 = canvas[1] + bb[1] / scale - pad
    x1 = canvas[0] + bb[2] / scale + pad; y1 = canvas[1] + bb[3] / scale + pad
    return svg_doc(body, (x0, y0, x1 - x0, y1 - y0), title)

MS = 140 / 64  # mark scale in lockups

def lockup(dark=False, with_tagline=True):
    m = f'<g transform="scale({MS})">\n{mark(dark)}\n</g>'
    x = 140 + 18
    # wordmark baseline chosen so the text block is centred on the mark's visual centre (y ≈ 64)
    if with_tagline:
        yW = 70
        wm, wb = wordmark(x, yW, dark)
        tg, tb = tagline(x + 3, yW + 32, dark)
        top, bot = wb[1], tb[3]
        dy = 64 - (top + bot) / 2
        body = f'{m}\n<g transform="translate(0 {dy:.2f})">\n{wm}\n{tg}\n</g>'
    else:
        yW = 90
        wm, wb = wordmark(x, yW, dark)
        dy = 64 - (wb[1] + wb[3]) / 2
        body = f'{m}\n<g transform="translate(0 {dy:.2f})">\n{wm}\n</g>'
    return body

def stacked(dark=False):
    m = f'<g transform="translate(0 0) scale({220/64})">\n{mark(dark)}\n</g>'
    wm, wb = wordmark(0, 0, dark, size=96)
    tg, tb = tagline(0, 0, dark, size=21)
    ww = wb[2] - wb[0]; tw = tb[2] - tb[0]
    cx = 110  # mark centre x
    wm, wb = wordmark(cx - ww / 2 - wb[0], 300, dark, size=96)
    tg, tb = tagline(cx - tw / 2 - tb[0], 340, dark, size=21)
    return f'{m}\n{wm}\n{tg}'

files = {}
T = "Bartaboard"
files["bartaboard-mark.svg"] = trim(f'<g transform="scale(10)">{mark(False)}</g>', T, canvas=(-20, -20, 700, 700))
files["bartaboard-mark-dark.svg"] = trim(f'<g transform="scale(10)">{mark(True)}</g>', T, canvas=(-20, -20, 700, 700))
files["bartaboard-mark-small.svg"] = trim(f'<g transform="scale(10)">{mark(False, "small")}</g>', T, canvas=(-20, -20, 700, 700))
files["bartaboard-logo-light.svg"] = trim(lockup(False, True), T, pad=2)
files["bartaboard-logo-dark.svg"] = trim(lockup(True, True), T, pad=2)
files["bartaboard-logo-compact-light.svg"] = trim(lockup(False, False), T, pad=2)
files["bartaboard-logo-compact-dark.svg"] = trim(lockup(True, False), T, pad=2)
files["bartaboard-logo-stacked-light.svg"] = trim(stacked(False), T, pad=2, canvas=(-400, -50, 1100, 500))
files["bartaboard-logo-stacked-dark.svg"] = trim(stacked(True), T, pad=2, canvas=(-400, -50, 1100, 500))
wm, _ = wordmark(0, 100, False); files["bartaboard-wordmark-light.svg"] = trim(wm, T, pad=1)
wm, _ = wordmark(0, 100, True); files["bartaboard-wordmark-dark.svg"] = trim(wm, T, pad=1)
# favicon.svg: square, small-size mark, switches to the dark-mode mark when the browser is dark
files["favicon.svg"] = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
<style>.d{{display:none}}@media (prefers-color-scheme:dark){{.l{{display:none}}.d{{display:inline}}}}</style>
<g class="l">{mark(False, "small")}</g><g class="d">{mark(True, "small")}</g>
</svg>
'''
# app icon: white rounded-square tile (for stores/app shortcuts that don't mask)
files["bartaboard-app-icon.svg"] = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="1024" height="1024">
<rect width="64" height="64" rx="14.5" fill="#FFFFFF"/>
<g transform="translate(5.5 6.5) scale(0.83)">{mark(False)}</g>
</svg>
'''
for name, s in files.items():
    s = re.sub(r"(\d+\.\d{3})\d+", r"\1", s)  # trim float noise
    open(f"{OUT}/svg/{name}", "w").write(s)
    files[name] = s
print({k: len(v) for k, v in files.items()})
json.dump(list(files), open(f"{OUT}/svg-list.json", "w"))
