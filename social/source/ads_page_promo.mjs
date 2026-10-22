// Bartaboard "follow the page" ad creative (1080×1080 + 1080×1350) rendered with Playwright.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(".");
const KIT = "../../brand-kit";
const OUT = path.join(ROOT, "out");
fs.mkdirSync(OUT, { recursive: true });
const f = (p) => "file://" + path.join(ROOT, p);
const font = (fam, w, file) =>
  `@font-face{font-family:'${fam}';font-weight:${w};src:url('${f("node_modules/@fontsource/" + file)}') format('woff2');}`;
const FONTS = [600, 700, 800]
  .map((w) => font("Sora", w, `sora/files/sora-latin-${w}-normal.woff2`))
  .concat([600, 700, 800].map((w) => font("Bengali", w, `noto-sans-bengali/files/noto-sans-bengali-bengali-${w}-normal.woff2`)))
  .join("\n");

const G = "#006a4e", R = "#f42a41", INK = "#0f1720", MUTED = "#5b6470", CREAM = "#f6f4ef";
const LOGO = "file://" + path.join(KIT, "svg/bartaboard-logo-light.svg");

const CHIPS = [
  ["রাজনীতি", G], ["Sports", "#e0303f"], ["অর্থনীতি", "#7d5c1e"], ["World", "#2a5bd7"],
  ["খেলা", "#e0303f"], ["Tech", "#6b3fd1"], ["জাতীয়", G], ["Business", "#7d5c1e"],
  ["বিনোদন", "#c2417a"], ["Education", G], ["আন্তর্জাতিক", "#2a5bd7"], ["Health", "#0f8a7a"],
];

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

// Decorative pinned cards: [x, y, rotation, chipIndex, back colour]
function cards(list, size) {
  const r = rng(11);
  const cw = size, ch = Math.round(size * 0.66);
  return list.map(([x, y, rot, ci, back]) => {
    const [label, color] = CHIPS[ci % CHIPS.length];
    const lines = [0.86, 0.94, 0.7].map((w) => `<i style="width:${Math.round((w - r() * 0.15) * 100)}%"></i>`).join("");
    return `<div class="card" style="left:${x}px;top:${y}px;width:${cw}px;height:${ch}px;transform:rotate(${rot}deg)">
      ${back ? `<div class="back" style="background:${back}"></div>` : ""}
      <div class="face"><b style="background:${color}">${label}</b>${lines}</div>
      <span class="pin" style="left:${(35 + r() * 30).toFixed(0)}%"></span></div>`;
  }).join("");
}

const css = (W, H) => `
${FONTS}
*{box-sizing:border-box;margin:0;padding:0}
body{width:${W}px;height:${H}px;overflow:hidden}
.page{position:relative;width:${W}px;height:${H}px;overflow:hidden;font-family:Bengali,Sora,sans-serif;color:${INK};
  background-color:${CREAM};
  background-image:radial-gradient(ellipse 70% 50% at 50% 55%,rgba(0,106,78,.10),rgba(0,106,78,0) 70%),radial-gradient(rgba(15,23,32,.075) 1.6px,transparent 2px);
  background-size:100% 100%,30px 30px}
.card{position:absolute;z-index:1}
.card .back{position:absolute;inset:0;border-radius:18px;transform:translate(-14px,12px) rotate(-4deg);opacity:.95}
.card .face{position:absolute;inset:0;border-radius:18px;background:#fff;border:1px solid #d9dce2;box-shadow:0 2px 4px rgba(23,25,28,.06),0 18px 34px -14px rgba(23,25,28,.28);padding:22px 24px;display:flex;flex-direction:column;gap:14px}
.card .face b{align-self:flex-start;color:#fff;font-weight:700;font-size:22px;line-height:1;padding:9px 16px 10px;border-radius:999px;font-family:Bengali,Sora}
.card .face i{display:block;height:11px;border-radius:6px;background:#c9ced6}
.card .pin{position:absolute;top:-16px;width:30px;height:30px;border-radius:50%;background:radial-gradient(circle at 35% 32%,#ff8a97,${R} 55%,#b81c2e);box-shadow:0 8px 12px -4px rgba(15,23,32,.45);z-index:3}
.card .pin::after{content:"";position:absolute;left:50%;top:26px;width:3px;height:16px;background:${MUTED};transform:translateX(-50%);border-radius:2px;z-index:-1}
.fade{position:absolute;inset:0;z-index:2;pointer-events:none;
  background:radial-gradient(ellipse 58% 52% at 50% 50%,${CREAM} 55%,rgba(246,244,239,0) 100%)}
.content{position:absolute;inset:0;z-index:4;display:flex;flex-direction:column;align-items:center;text-align:center}
.logo{width:470px;display:block}
.h1{font-weight:800;line-height:1.12;letter-spacing:-.005em}
.h1 .a{display:block;color:${INK}}
.h1 .b{display:inline-block;position:relative;color:${G}}
.ball{display:inline-block;width:52px;height:52px;border-radius:50%;vertical-align:middle;margin-left:16px;position:relative;top:-6px;
  background:radial-gradient(circle at 35% 32%,#ff8a97,${R} 55%,#b81c2e);box-shadow:0 10px 16px -6px rgba(15,23,32,.5)}
.sub{font-weight:600;color:${MUTED};line-height:1.4}
.sub em{font-style:normal;font-family:Sora;font-weight:700;color:${INK}}
.cta{display:inline-flex;align-items:center;gap:22px;background:${G};color:#fff;border-radius:999px;
  box-shadow:0 2px 3px rgba(0,106,78,.25),0 26px 44px -18px rgba(0,106,78,.65);font-weight:800;white-space:nowrap}
.cta .plus{display:grid;place-items:center;border-radius:50%;background:#fff;color:${G};font-family:Sora;font-weight:800;line-height:1}
.url{font-family:Sora;font-weight:700;color:${G}}
.stripe{position:absolute;left:0;right:0;bottom:0;height:14px;display:flex;z-index:7}
.stripe span{flex:1;background:${G}}.stripe span.r{flex:0 0 240px;background:${R}}
`;

function page({ W, H, layout, hSize, subSize, ctaSize, gaps, cardSize }) {
  const [gTop, g1, g2, g3, g4] = gaps;
  return `<div class="page">
  ${cards(layout, cardSize)}
  <div class="fade"></div>
  <div class="content" style="padding-top:${gTop}px">
    <img class="logo" src="${LOGO}">
    <div class="h1" style="font-size:${hSize}px;margin-top:${g1}px">
      <span class="a">দেশের সব খবর,</span>
      <span class="b">এক বোর্ডে<span class="ball"></span></span>
    </div>
    <div class="sub" style="font-size:${subSize}px;margin-top:${g2}px">৫০+ পত্রিকা · ৩০+ টিভি চ্যানেল · বাংলা ও <em>English</em></div>
    <div class="cta" style="font-size:${ctaSize}px;padding:${Math.round(ctaSize*0.42)}px ${Math.round(ctaSize*1.1)}px ${Math.round(ctaSize*0.42)}px ${Math.round(ctaSize*0.5)}px;margin-top:${g3}px">
      <span class="plus" style="width:${Math.round(ctaSize*1.25)}px;height:${Math.round(ctaSize*1.25)}px;font-size:${Math.round(ctaSize*0.95)}px">+</span>
      <span>পেজটি ফলো করুন</span>
    </div>
    <div class="url" style="font-size:${Math.round(subSize*0.9)}px;margin-top:${g4}px">bartaboard.com</div>
  </div>
  <div class="stripe"><span></span><span class="r"></span><span></span></div>
</div>`;
}

// Cards hug the edges and leave the centre clear.
const SQUARE = [
  [-20, 40, -7, 2, G], [300, -70, 4, 1, null], [700, -55, -5, 2, R], [900, 120, 6, 3, null],
  [-30, 330, 5, 4, null], [905, 420, -6, 5, G], [-25, 640, -4, 6, R], [895, 720, 5, 7, null],
  [150, 930, -5, 8, null], [560, 960, 4, 9, G], [-20, 950, 6, 10, null], [860, 980, -4, 11, R],
];
const PORTRAIT = [
  [-20, 40, -7, 2, G], [300, -70, 4, 1, null], [700, -55, -5, 2, R], [900, 120, 6, 3, null],
  [-30, 330, 5, 4, null], [905, 420, -6, 5, G], [-25, 640, -4, 6, R], [895, 720, 5, 7, null],
  [-30, 950, 6, 8, null], [900, 1020, -5, 9, G], [150, 1215, -5, 10, null], [560, 1240, 4, 11, R], [-20, 1250, 3, 1, null], [870, 1270, -4, 5, null],
];

const IMAGES = [
  ["bartaboard-ad-follow-page-1080x1080", 1080, 1080, page({ W: 1080, H: 1080, layout: SQUARE, hSize: 118, subSize: 36, ctaSize: 42, gaps: [96, 64, 30, 58, 30], cardSize: 230 })],
  ["bartaboard-ad-follow-page-1080x1350", 1080, 1350, page({ W: 1080, H: 1350, layout: PORTRAIT, hSize: 128, subSize: 38, ctaSize: 46, gaps: [140, 90, 36, 84, 36], cardSize: 240 })],
];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
for (const [name, W, H, body] of IMAGES) {
  const pg = await browser.newPage({ viewport: { width: W, height: H } });
  const file = path.join(OUT, `${name}.html`);
  fs.writeFileSync(file, `<!doctype html><html><head><meta charset="utf-8"><style>${css(W, H)}</style></head><body>${body}</body></html>`);
  await pg.goto("file://" + file);
  await pg.evaluate(() => document.fonts.ready);
  await pg.waitForTimeout(400);
  await pg.screenshot({ path: path.join(OUT, `${name}.png`) });
  await pg.close();
  console.log(name);
}
await browser.close();
