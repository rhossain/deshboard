"""Rasterises the SVG kit into hi-res PNGs and compact web files."""
import io, os, sys
import cairosvg
from PIL import Image
sys.path.insert(0, ".")
import importlib.util
spec = importlib.util.spec_from_file_location("kit", "logo_kit.py"); kit = importlib.util.module_from_spec(spec); spec.loader.exec_module(kit)

OUT = kit.OUT
SVG = f"{OUT}/svg"

def render(svg_path_or_str, width=None, height=None):
    kw = {"url": svg_path_or_str} if svg_path_or_str.endswith(".svg") else {"bytestring": svg_path_or_str.encode()}
    if width: kw["output_width"] = width
    if height: kw["output_height"] = height
    return Image.open(io.BytesIO(cairosvg.svg2png(**kw))).convert("RGBA")

def save_png(im, path):
    im.save(path, optimize=True)

def save_webp(im, path):
    im.save(path, "WEBP", quality=92, method=6)

# ---- hi-res PNGs (transparent) ----
hires = {
    "bartaboard-logo-light": 4000, "bartaboard-logo-dark": 4000,
    "bartaboard-logo-compact-light": 3200, "bartaboard-logo-compact-dark": 3200,
    "bartaboard-logo-stacked-light": 2400, "bartaboard-logo-stacked-dark": 2400,
    "bartaboard-wordmark-light": 3000, "bartaboard-wordmark-dark": 3000,
    "bartaboard-mark": 2048, "bartaboard-mark-dark": 2048,
    "bartaboard-app-icon": 1024,
}
for name, w in hires.items():
    save_png(render(f"{SVG}/{name}.svg", width=w), f"{OUT}/png/{name}-{w}w.png")

# ---- square icons ----
CX, CY = 30.9, 29.5  # visual centre of the mark in its 64-unit box
def square_icon(k, bg=None, variant="full", dark=False):
    tx, ty = 32 - k * CX, 32 - k * CY
    bgr = f'<rect width="64" height="64" fill="{bg}"/>' if bg else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">{bgr}'
            f'<g transform="translate({tx:.2f} {ty:.2f}) scale({k})">{kit.mark(dark, variant)}</g></svg>')

W = f"{OUT}/web"
# favicons: hand-tuned simplified marks at the small sizes
ico16 = render(square_icon(1.0, None, "tiny"), 16, 16)
ico32 = render(square_icon(1.0, None, "small"), 32, 32)
ico48 = render(square_icon(1.0, None, "small"), 48, 48)
save_png(ico32, f"{W}/favicon-32.png"); save_png(ico16, f"{W}/favicon-16.png"); save_png(ico48, f"{W}/favicon-48.png")
ico48.save(f"{W}/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)], append_images=[ico16, ico32])
open(f"{W}/favicon.svg", "w").write(open(f"{SVG}/favicon.svg").read())
# Apple touch icon: full-bleed white (iOS rounds the corners itself)
save_png(render(square_icon(0.88, "#FFFFFF"), 180, 180).convert("RGB"), f"{W}/apple-touch-icon.png")
# Web-app manifest icons
save_png(render(square_icon(1.0, None), 192, 192), f"{W}/icon-192.png")
save_png(render(square_icon(1.0, None), 512, 512), f"{W}/icon-512.png")
save_png(render(square_icon(0.66, "#FFFFFF"), 512, 512).convert("RGB"), f"{W}/icon-maskable-512.png")

# ---- compact web logos (2x the CSS size, so they stay sharp on retina screens) ----
web = {
    # name: (svg, css height) -> exported at 2x height
    "header-light": ("bartaboard-logo-compact-light", 40),
    "header-dark": ("bartaboard-logo-compact-dark", 40),
    "logo-light": ("bartaboard-logo-light", 80),
    "logo-dark": ("bartaboard-logo-dark", 80),
    "mark": ("bartaboard-mark", 64),
    "mark-dark": ("bartaboard-mark-dark", 64),
}
sizes = {}
for name, (svg, h) in web.items():
    im = render(f"{SVG}/{svg}.svg", height=h * 2)
    save_webp(im, f"{W}/{name}.webp"); save_png(im, f"{W}/{name}.png")
    sizes[name] = (im.width // 2, h)
# minified SVG copies for inline/web use
for svg in ["bartaboard-logo-compact-light", "bartaboard-logo-compact-dark", "bartaboard-logo-light", "bartaboard-logo-dark", "bartaboard-mark", "bartaboard-mark-dark"]:
    s = open(f"{SVG}/{svg}.svg").read()
    s = "\n".join(l.strip() for l in s.splitlines()).replace(">\n<", "><")
    open(f"{W}/{svg.replace('bartaboard-logo-compact', 'header').replace('bartaboard-logo', 'logo').replace('bartaboard-', '')}.svg", "w").write(s)
print(sizes)
for d in ("png", "web"):
    for f in sorted(os.listdir(f"{OUT}/{d}")):
        print(d, f, os.path.getsize(f"{OUT}/{d}/{f}"))
