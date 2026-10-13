// Renders the Bartaboard social kit to ./out with Playwright (Chromium at /opt/pw-browsers).
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(".");
const OUT = path.join(ROOT, "out");
fs.mkdirSync(OUT, { recursive: true });
const f = (p) => "file://" + path.join(ROOT, p);
const font = (fam, w, file) =>
  `@font-face{font-family:'${fam}';font-weight:${w};src:url('${f("node_modules/@fontsource/" + file)}') format('woff2');}`;
const FONTS = [300, 400, 500, 600, 700, 800, 900]
  .map((w) => font("Montserrat", w, `montserrat/files/montserrat-latin-${w}-normal.woff2`))
  .concat([400, 500, 600, 700, 800].map((w) => font("Bengali", w, `noto-sans-bengali/files/noto-sans-bengali-bengali-${w}-normal.woff2`)))
  .join("\n");

const THEMES = {
  light: {
    bg: "#f6f4ef", bg2: "#ece7dc", dot: "rgba(23,25,28,.09)", ink: "#17191c", muted: "#5d6168",
    card: "#ffffff", line: "#c9ccd2", shadow: "0 2px 4px rgba(23,25,28,.06), 0 14px 30px -12px rgba(23,25,28,.22)",
    logo: "bartaboard-logo-light-trim.png", pill: "#0c6b4f", pillInk: "#fff", glow: "rgba(38,190,96,.10)",
  },
  dark: {
    bg: "#0f1113", bg2: "#08090a", dot: "rgba(235,232,226,.07)", ink: "#ebe8e2", muted: "#a3a7ae",
    card: "#1c1f23", line: "#3a3e45", shadow: "0 2px 4px rgba(0,0,0,.3), 0 18px 36px -14px rgba(0,0,0,.7)",
    logo: "bartaboard-logo-dark-trim.png", pill: "#26be60", pillInk: "#06140e", glow: "rgba(38,190,96,.13)",
  },
};

// Headline chips on the decorative cards, half Bangla, half English, like the board itself.
const CHIPS = [
  ["রাজনীতি", "#0c6b4f"], ["Sports", "#d4342c"], ["অর্থনীতি", "#7d5c1e"], ["World", "#2a5bd7"],
  ["খেলা", "#d4342c"], ["Tech", "#6b3fd1"], ["জাতীয়", "#0c6b4f"], ["Business", "#7d5c1e"],
  ["বিনোদন", "#c2417a"], ["Education", "#0c6b4f"], ["আন্তর্জাতিক", "#2a5bd7"], ["Health", "#0f8a7a"],
];

// Seeded RNG so every render is identical.
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/** Cards on a jittered grid, skipping any that would touch the `keep` rectangles (logo/text zones). */
function placed(list, size, seed) {
  const r = rng(seed);
  const cw = size, ch = size * 0.66;
  return list.map(([x, y, rot, chip, back]) => {
    const c = chip == null ? null : CHIPS.find((k) => k[0] === chip) ?? CHIPS[0];
    const lines = [0.86, 0.94, 0.7].map((w) => `<i style="width:${Math.round((w - r() * 0.15) * 100)}%"></i>`).join("");
    const bk = { g: "#136b3a", r: "#d4342c" }[back];
    return `<div class="card" style="left:${x}px;top:${y}px;width:${cw}px;height:${ch}px;transform:rotate(${rot}deg)">
      ${bk ? `<div class="back" style="background:${bk}"></div>` : ""}
      <div class="face">${c ? `<b style="background:${c[1]}">${c[0]}</b>` : `<i style="width:40%;opacity:0"></i>`}${lines}</div>
      <span class="pin" style="left:${(35 + r() * 30).toFixed(0)}%"></span></div>`;
  }).join("");
}

function cards({ W, H, size, keep, seed = 7, density = 1, layout }) {
  if (layout) return placed(layout, size, seed);
  const r = rng(seed);
  const cw = size, ch = size * 0.66;
  const stepX = cw * 1.25 / density, stepY = ch * 1.45 / density;
  let html = "", i = 0;
  for (let y = -ch * 0.35; y < H; y += stepY) {
    const off = (Math.round(y / stepY) % 2) * stepX * 0.5;
    for (let x = -cw * 0.4 + off; x < W; x += stepX) {
      const jx = x + (r() - 0.5) * cw * 0.35, jy = y + (r() - 0.5) * ch * 0.4;
      const pad = size * 0.12;
      const hit = keep.some((k) => jx < k.x + k.w + pad && jx + cw > k.x - pad && jy < k.y + k.h + pad && jy + ch > k.y - pad);
      if (hit || jy < 10 || jy + ch > H - 14) continue;
      const rot = (r() - 0.5) * 9;
      const [label, color] = CHIPS[i % CHIPS.length];
      const back = ["#136b3a", "#d4342c", null, null][Math.floor(r() * 4)];
      const lines = [0.86, 0.94, 0.7].map((w) => `<i style="width:${Math.round((w - r() * 0.15) * 100)}%"></i>`).join("");
      html += `<div class="card" style="left:${jx}px;top:${jy}px;width:${cw}px;height:${ch}px;transform:rotate(${rot.toFixed(2)}deg)">
        ${back ? `<div class="back" style="background:${back}"></div>` : ""}
        <div class="face">${jx < 0 ? `<i style="width:40%;opacity:0"></i>` : `<b style="background:${color}">${label}</b>`}${lines}</div>
        <span class="pin" style="left:${(30 + r() * 40).toFixed(0)}%"></span></div>`;
      i++;
    }
  }
  return html;
}

const BASE = (t, size) => `
${FONTS}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%}
body{background:${t.bg};font-family:Montserrat,Bengali,sans-serif;color:${t.ink};overflow:hidden;position:relative;
  -webkit-font-smoothing:antialiased}
.board{position:absolute;inset:0;
  background:
    radial-gradient(ellipse 55% 70% at 50% 48%, ${t.glow}, transparent 70%),
    radial-gradient(${t.dot} ${Math.max(1.2, size * 0.008)}px, transparent ${Math.max(1.4, size * 0.009)}px) 0 0/${size * 0.16}px ${size * 0.16}px,
    linear-gradient(180deg, ${t.bg}, ${t.bg2});}
.card{position:absolute}
.card .back{position:absolute;inset:0;border-radius:${size * 0.08}px;transform:translate(${-size * 0.05}px,${size * 0.05}px) rotate(-4deg)}
.card .face{position:absolute;inset:0;background:${t.card};border-radius:${size * 0.08}px;box-shadow:${t.shadow};
  padding:${size * 0.1}px ${size * 0.1}px;display:flex;flex-direction:column;gap:${size * 0.055}px}
.card b{align-self:flex-start;color:#fff;font-weight:700;font-size:${size * 0.075}px;line-height:1;padding:${size * 0.03}px ${size * 0.05}px;
  border-radius:99px;letter-spacing:.01em;margin-bottom:${size * 0.015}px}
.card i{display:block;height:${size * 0.045}px;border-radius:99px;background:${t.line}}
.pin{position:absolute;top:${-size * 0.05}px;width:${size * 0.1}px;height:${size * 0.1}px;border-radius:50%;
  background:radial-gradient(circle at 35% 30%, #ff8a80 0 12%, #ef3b2d 35%, #b5170e 100%);
  box-shadow:0 ${size * 0.02}px ${size * 0.03}px rgba(0,0,0,.35)}
.fade{position:absolute;inset:0;pointer-events:none}
.center{position:absolute;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
.logo{display:block;height:auto}
.bn{font-family:Bengali,sans-serif;font-weight:600;color:${t.ink};letter-spacing:0}
.meta{display:flex;align-items:center;gap:.7em;color:${t.muted};font-weight:600;letter-spacing:.02em;white-space:nowrap}
.meta .dot{width:.32em;height:.32em;border-radius:50%;background:#26be60;display:inline-block}
.url{background:${t.pill};color:${t.pillInk};font-weight:700;border-radius:99px;padding:.45em 1.1em;letter-spacing:.02em}
.strip{position:absolute;left:0;right:0;bottom:0;display:flex}
.strip span{display:block;height:100%}
`;

/** A cover: board of cards + centred logo block. `zone` = the centre rectangle that must stay readable. */
function cover({ W, H, theme, zone, logoW, bnSize, metaSize, cardSize, seed, extraKeep = [], density = 1, layout, strip = true, showBn = true, showMeta = true }) {
  const t = THEMES[theme];
  const keep = [zone, ...extraKeep];
  const fadeX = zone.x + zone.w / 2, fadeY = zone.y + zone.h / 2;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE(t, cardSize)}
  .fade{background:radial-gradient(ellipse ${zone.w * 0.62}px ${zone.h * 0.75}px at ${fadeX}px ${fadeY}px, ${t.bg} 55%, transparent 100%)}
  .strip{height:${Math.max(6, H * 0.014)}px}
  </style></head><body><div class="board"></div>
  ${cards({ W, H, size: cardSize, keep, seed, density, theme, layout })}
  <div class="fade"></div>
  <div class="center" style="left:${zone.x}px;top:${zone.y}px;width:${zone.w}px;height:${zone.h}px;gap:${bnSize * 0.55}px">
    <img class="logo" src="${f(t.logo)}" style="width:${logoW}px">
    ${showBn ? `<div class="bn" style="font-size:${bnSize}px;margin-top:${bnSize * 0.15}px">দেশের সব খবর, এক বোর্ডে</div>` : ""}
    ${showMeta ? `<div class="meta" style="font-size:${metaSize}px"><span>50+ newspapers</span><span class="dot"></span><span>30+ TV news channels</span><span class="dot"></span><span class="url">bartaboard.com</span></div>` : ""}
  </div>
  ${strip ? `<div class="strip"><span style="flex:1;background:#0c6b4f"></span><span style="width:12%;background:#e23a2e"></span><span style="flex:1;background:#0c6b4f"></span></div>` : ""}
  </body></html>`;
}

function profile({ variant }) {
  const S = 1080;
  const bg = {
    cream: `radial-gradient(circle at 50% 42%, #ffffff 0%, #f6f4ef 60%, #e9e3d6 100%)`,
    green: `radial-gradient(circle at 50% 38%, #12805f 0%, #0c6b4f 45%, #06402f 100%)`,
    dark: `radial-gradient(circle at 50% 40%, #23272c 0%, #14161a 55%, #08090a 100%)`,
  }[variant];
  const shadow = variant === "cream" ? "drop-shadow(0 18px 28px rgba(23,25,28,.18))" : "drop-shadow(0 22px 34px rgba(0,0,0,.45))";
  // The mark's visual centre sits a little left of and below its box centre (pin at top right).
  return `<!doctype html><html><head><meta charset="utf-8"><style>*{margin:0}body{width:${S}px;height:${S}px;background:${bg};overflow:hidden;position:relative}
  img{position:absolute;width:${S * 0.7}px;left:${S * 0.155}px;top:${S * 0.19}px;filter:${shadow}}</style></head>
  <body><img src="${f("bartaboard-icon-trim.png")}"></body></html>`;
}

const HL = [
  ["top-stories", "newspaper", "Top stories"], ["politics", "landmark", "Politics"], ["world", "globe", "World"],
  ["business", "trending-up", "Business"], ["sports", "trophy", "Sports"], ["entertainment", "clapperboard", "Entertainment"],
  ["tech", "cpu", "Tech"], ["videos", "tv", "Videos"], ["about", "info", "About"],
];
function highlight(icon) {
  let svg = fs.readFileSync(`node_modules/lucide-static/icons/${icon}.svg`, "utf8");
  svg = svg.replace(/<!--[\s\S]*?-->/g, "").replace(/width="24"/, 'width="460"').replace(/height="24"/, 'height="460"')
    .replace(/stroke="currentColor"/, 'stroke="#ffffff"').replace(/stroke-width="2"/, 'stroke-width="1.6"');
  return `<!doctype html><html><head><meta charset="utf-8"><style>*{margin:0}body{width:1080px;height:1920px;overflow:hidden;
  background:radial-gradient(circle at 50% 50%, #12805f 0%, #0c6b4f 30%, #06402f 80%);display:grid;place-items:center;position:relative}
  .ring{position:absolute;left:50%;top:50%;width:700px;height:700px;margin:-350px 0 0 -350px;border-radius:50%;
   box-shadow:inset 0 0 0 0 transparent}
  .pin{position:absolute;left:calc(50% + 150px);top:calc(50% - 255px);width:64px;height:64px;border-radius:50%;
   background:radial-gradient(circle at 35% 30%, #ff8a80 0 12%, #ef3b2d 35%, #b5170e 100%);box-shadow:0 8px 14px rgba(0,0,0,.35)}
  svg{filter:drop-shadow(0 10px 18px rgba(0,0,0,.25))}</style></head>
  <body>${svg}</body></html>`;
}

const jobs = [];
// Facebook cover: 1640x624 (2x of the 820x312 desktop display). Mobile shows roughly the centre two-thirds,
// so everything that must be read stays inside the centre ~1100px; the profile photo covers the bottom-left.
for (const theme of ["light", "dark"]) {
  jobs.push({
    name: `facebook-cover-${theme}.png`, W: 1640, H: 624,
    html: cover({ W: 1640, H: 624, theme, zone: { x: 300, y: 70, w: 1040, h: 470 }, logoW: 860, bnSize: 46, metaSize: 25, cardSize: 200, seed: 11,
      layout: [
        [62, 44, -6, "রাজনীতি", "g"], [-96, 226, 5, null, null], [104, 262, -3, "Sports", "r"], [34, 462, 4, "অর্থনীতি", null],
        [1378, 40, 5, "World", null], [1510, 214, -4, "Tech", "g"], [1350, 300, 3, "জাতীয়", "r"], [1444, 466, -5, "বিনোদন", null],
      ] }),
  });
}
// X header 1500x500: the profile photo overlaps the bottom-left; app crops top and bottom a little.
jobs.push({
  name: "x-header.png", W: 1500, H: 500,
  html: cover({ W: 1500, H: 500, theme: "light", zone: { x: 300, y: 60, w: 900, h: 360 }, logoW: 740, bnSize: 38, metaSize: 21, cardSize: 180, seed: 5,
    layout: [
      [40, 40, -6, "অর্থনীতি", "g"], [-90, 196, 5, null, null], [96, 226, -3, "Sports", "r"], [24, 362, 4, "রাজনীতি", null],
      [1290, 36, 5, "World", null], [1400, 186, -4, "Tech", "g"], [1262, 252, 3, "জাতীয়", "r"], [1330, 366, -5, "বিনোদন", null],
    ] }),
});
// LinkedIn page cover 1128x191 — very short; logo only plus the address.
jobs.push({
  name: "linkedin-cover.png", W: 1128, H: 191,
  html: cover({ W: 1128, H: 191, theme: "light", zone: { x: 300, y: 20, w: 528, h: 150 }, logoW: 470, bnSize: 0, metaSize: 0, cardSize: 92, seed: 3, showBn: false, showMeta: false }),
});
// YouTube banner 2560x1440; the area every device shows is the centre 1546x423.
jobs.push({
  name: "youtube-banner.png", W: 2560, H: 1440,
  html: cover({ W: 2560, H: 1440, theme: "light", zone: { x: 507, y: 509, w: 1546, h: 423 }, logoW: 940, bnSize: 48, metaSize: 27, cardSize: 300, seed: 21, extraKeep: [] }),
});
for (const v of ["green", "cream"]) jobs.push({ name: `profile-${v}.png`, W: 1080, H: 1080, html: profile({ variant: v }) });
HL.forEach(([slug, icon], i) => jobs.push({ name: `ig-highlight-${String(i + 1).padStart(2, "0")}-${slug}.png`, W: 1080, H: 1920, html: highlight(icon) }));

const only = process.argv[2];
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
for (const j of jobs) {
  if (only && !j.name.includes(only)) continue;
  const page = await browser.newPage({ viewport: { width: j.W, height: j.H }, deviceScaleFactor: 1 });
  const tmp = path.join(ROOT, "tmp-" + j.name + ".html");
  fs.writeFileSync(tmp, j.html);
  await page.goto("file://" + tmp);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(OUT, j.name), omitBackground: false });
  fs.unlinkSync(tmp);
  await page.close();
  console.log("ok", j.name);
}
await browser.close();
