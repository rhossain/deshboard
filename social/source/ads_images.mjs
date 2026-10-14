// Renders Bartaboard's four Bangla feed ads (1080×1350) to ./out-ads with Playwright. The phones show real
// screens of the live site (../ads/cap/*.png, recorded at 3×).
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(".");
const CAP = "/home/claude/ads/cap";
const OUT = path.join(ROOT, "out-ads");
fs.mkdirSync(OUT, { recursive: true });
const f = (p) => "file://" + path.join(ROOT, p);
const font = (fam, w, file) =>
  `@font-face{font-family:'${fam}';font-weight:${w};src:url('${f("node_modules/@fontsource/" + file)}') format('woff2');}`;
const FONTS = [600, 700]
  .map((w) => font("Sora", w, `sora/files/sora-latin-${w}-normal.woff2`))
  .concat([500, 600, 700, 800].map((w) => font("Bengali", w, `noto-sans-bengali/files/noto-sans-bengali-bengali-${w}-normal.woff2`)))
  .join("\n");
const MAP = fs.readFileSync(path.join(ROOT, "map-full.txt"), "utf8").trim();
const G = "#006a4e", R = "#f42a41", INK = "#0f1720", MUTED = "#5b6470", CREAM = "#f6f4ef";

const css = `
${FONTS}
*{box-sizing:border-box;margin:0;padding:0}
body{width:1080px;height:1350px;overflow:hidden}
.page{position:relative;width:1080px;height:1350px;overflow:hidden;font-family:Bengali,Sora,sans-serif;color:${INK}}
.cream{background-color:${CREAM};background-image:radial-gradient(ellipse 70% 45% at 50% 62%,rgba(0,106,78,.10),rgba(0,106,78,0) 70%),radial-gradient(rgba(15,23,32,.075) 1.6px,transparent 2px);background-size:100% 100%,30px 30px}
.green{background-color:${G};background-image:radial-gradient(ellipse 80% 55% at 50% 40%,rgba(255,255,255,.10),rgba(255,255,255,0) 70%),radial-gradient(rgba(255,255,255,.08) 1.6px,transparent 2px);background-size:100% 100%,30px 30px;color:#fff}
.abs{position:absolute}
.logo{position:absolute;left:70px;top:64px;width:300px}
.t1{font-weight:700;font-size:50px;line-height:1.25}
.t2{font-weight:800;font-size:92px;line-height:1.15;color:${G};letter-spacing:-.01em}
.t2 em{font-style:normal;color:${R}}
.phone{position:absolute;border-radius:64px;background:#10151c;padding:14px;box-shadow:0 50px 80px -36px rgba(15,23,32,.6),0 0 0 3px #2a3039 inset}
.phone .scr{position:relative;border-radius:52px;overflow:hidden;background:${CREAM}}
.phone .scr img{display:block;width:100%}
.phone .isl{position:absolute;left:50%;top:12px;width:120px;height:34px;border-radius:20px;background:#05080c;transform:translateX(-50%)}
.chip{position:absolute;padding:14px 26px;border-radius:999px;background:#fff;border:1px solid #e3e6ea;box-shadow:0 16px 28px -16px rgba(15,23,32,.35);
  font-weight:700;font-size:32px;white-space:nowrap;display:flex;align-items:center;gap:12px}
.chip i{width:13px;height:13px;border-radius:50%;display:block}
.badge{position:absolute;display:flex;align-items:center;gap:16px;padding:18px 28px 18px 18px;border-radius:26px;background:#fff;
  box-shadow:0 26px 44px -22px rgba(15,23,32,.45);border:1px solid #e6e8ec;font-weight:700;font-size:32px;line-height:1.25;white-space:nowrap;z-index:5}
.badge b{flex:0 0 60px;height:60px;border-radius:18px;display:grid;place-items:center}
.badge svg{width:34px;height:34px}
.foot{position:absolute;left:70px;right:70px;bottom:62px;display:flex;align-items:center;justify-content:space-between;z-index:6}
.band{position:absolute;left:0;right:0;bottom:0;height:230px;z-index:4;background:linear-gradient(rgba(246,244,239,0),${CREAM} 70px)}
.url{font-family:Sora;font-weight:700;font-size:40px;border-radius:999px;padding:18px 40px;background:${G};color:#fff;box-shadow:0 20px 40px -18px rgba(0,106,78,.6)}
.note{font-weight:600;font-size:30px;color:${MUTED}}
.stripe{position:absolute;left:0;right:0;bottom:0;height:14px;display:flex;z-index:7}
.stripe span{flex:1;background:${G}}.stripe span.r{flex:0 0 240px;background:${R}}
`;
const statusBar = (scale) => `<div style="height:${Math.round(44*scale)}px;display:flex;align-items:center;justify-content:space-between;padding:0 ${Math.round(34*scale)}px 0 ${Math.round(40*scale)}px;background:#f6f4ef;font-family:Sora;font-weight:600;font-size:${Math.round(19*scale)}px;color:#0f1720">
<span>9:41</span><span style="display:flex;gap:${Math.round(7*scale)}px;align-items:center">
<svg width="${Math.round(20*scale)}" height="${Math.round(13*scale)}" viewBox="0 0 20 13"><rect x="0" y="9" width="3.5" height="4" rx="1" fill="#0f1720"/><rect x="5.5" y="6" width="3.5" height="7" rx="1" fill="#0f1720"/><rect x="11" y="3" width="3.5" height="10" rx="1" fill="#0f1720"/><rect x="16.5" y="0" width="3.5" height="13" rx="1" fill="#0f1720"/></svg>
<svg width="${Math.round(18*scale)}" height="${Math.round(13*scale)}" viewBox="0 0 18 13" fill="none" stroke="#0f1720" stroke-width="2.2" stroke-linecap="round"><path d="M1.5 4.5a11 11 0 0 1 15 0M4.5 7.6a6.5 6.5 0 0 1 9 0"/><circle cx="9" cy="11" r="1.4" fill="#0f1720" stroke="none"/></svg>
<svg width="${Math.round(27*scale)}" height="${Math.round(13*scale)}" viewBox="0 0 27 13"><rect x=".8" y=".8" width="22" height="11.4" rx="3.2" fill="none" stroke="#0f1720" stroke-opacity=".45" stroke-width="1.4"/><rect x="2.6" y="2.6" width="16" height="7.8" rx="1.8" fill="#0f1720"/><rect x="24.2" y="4.3" width="2" height="4.4" rx="1" fill="#0f1720" fill-opacity=".45"/></svg></span></div>`;
const stripe = `<div class="stripe"><span></span><span class="r"></span><span></span></div>`;
const foot = (note = "ফ্রি · অ্যাপ নামাতে হবে না") => `<div class="band"></div><div class="foot"><span class="url">bartaboard.com</span><span class="note">${note}</span></div>`;
// A phone showing `shot` (1170 px wide), `w` wide, cut to `h` tall from the top.
const phone = (shot, { x, y, w, h, rot = 0 }) => `<div class="phone" style="left:${x}px;top:${y}px;width:${w + 28}px;transform:rotate(${rot}deg)">
  <div class="scr" style="height:${h}px">${statusBar(w / 400)}<img src="file://${CAP}/${shot}"><div class="isl"></div></div></div>`;
const icon = {
  papers: `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h12v14H6a2 2 0 0 1-2-2z"/><path d="M16 9h4v8a2 2 0 0 1-2 2"/><path d="M7 9h6M7 12.5h6M7 16h4"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>`,
  stack: `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 3 8l9 5 9-5z"/><path d="m3 13 9 5 9-5"/></svg>`,
  lang: `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 2.5 14.4 0 17M12 3.5c-2.5 2.6-2.5 14.4 0 17"/></svg>`,
};
const badge = (style, ic, color, html) => `<div class="badge" style="${style}"><b style="background:${color}">${ic}</b><span>${html}</span></div>`;
const DOTS = [G, R, "#e8a317", "#2f6fd6", "#0b8460", "#7a4fd0"];
const chip = (name, x, y, r, i) => `<div class="chip" style="left:${x}px;top:${y}px;transform:rotate(${r}deg)"><i style="background:${DOTS[i % DOTS.length]}"></i>${name}</div>`;

// 1 · Every paper, one page
const LEFT = [["প্রথম আলো", 40, 520, -5], ["যুগান্তর", 70, 640, 4], ["কালের কণ্ঠ", 30, 760, -3], ["ইত্তেফাক", 80, 880, 5], ["সমকাল", 40, 1000, -4]];
const RIGHT = [["ডেইলি স্টার", 770, 540, 5], ["বিডিনিউজ২৪", 760, 660, -4], ["ঢাকা পোস্ট", 790, 780, 3], ["চ্যানেল ২৪", 770, 900, -5], ["জাগো নিউজ", 760, 1020, 4]];
const img1 = `<div class="page cream">
<img class="logo" src="${f("kit/svg/bartaboard-logo-light.svg")}">
<div class="abs" style="left:70px;right:70px;top:170px"><div class="t1">সকালে খবর পড়তে আর দশটা অ্যাপ নয়।</div>
<div class="t2" style="margin-top:8px">সব পত্রিকা,<br>এক পেজে<em>।</em></div></div>
${phone("sports-stand-first.png", { x: 310, y: 520, w: 432, h: 720 })}
${[...LEFT, ...RIGHT].map(([n, x, y, r], i) => chip(n, x, y, r, i)).join("")}
${foot()}${stripe}</div>`;

// 2 · Probashi
const MS = 5.2, MX = 70, MY = 520;
const D = [MX + 31.8 * MS, MY + 42.8 * MS];
const CITIES = [["দুবাই", 40, 470], ["রিয়াদ", 300, 430], ["কুয়ালালামপুর", 40, 1040], ["লন্ডন", 380, 560], ["নিউ ইয়র্ক", 330, 1000]];
const img2 = `<div class="page cream">
<img class="logo" src="${f("kit/svg/bartaboard-logo-light.svg")}">
<div class="abs" style="left:70px;right:70px;top:170px"><div class="t1">প্রবাসে থাকেন?</div>
<div class="t2" style="margin-top:6px;font-size:86px">দেশের সব খবর,<br>এক জায়গায়<em>।</em></div></div>
<svg class="abs" style="left:0;top:0" width="1080" height="1350" viewBox="0 0 1080 1350">
  <g fill="none" stroke="${G}" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="2 12">
  ${CITIES.map(([, x, y]) => { const cx = x + 70, cy = y + 30; return `<path d="M${cx} ${cy} Q${(cx + D[0]) / 2 - 30} ${Math.min(cy, D[1]) - 90} ${D[0]} ${D[1]}"/>`; }).join("")}
  </g>
  <g transform="translate(${MX},${MY}) scale(${MS})"><path d="${MAP}" fill="${G}" fill-opacity=".16" stroke="${G}" stroke-width=".6" stroke-linejoin="round"/></g>
  <circle cx="${D[0]}" cy="${D[1]}" r="34" fill="none" stroke="${R}" stroke-width="4" opacity=".45"/>
  <circle cx="${D[0]}" cy="${D[1]}" r="13" fill="${R}" stroke="#fff" stroke-width="5"/>
</svg>
${CITIES.map(([n, x, y]) => `<div class="chip" style="left:${x}px;top:${y}px;font-size:28px;padding:10px 20px"><i style="background:${R}"></i>${n}</div>`).join("")}
${phone("sports-latest-first.png", { x: 590, y: 470, w: 420, h: 770, rot: 3 })}
${badge("left:520px;top:1080px", icon.clock, R, "প্রতি ১৫ মিনিটে<br>নতুন খবর")}
${foot("ফ্রি · বাংলা ও English")}${stripe}</div>`;

// 3 · One story, twelve papers
const img3 = `<div class="page cream">
<img class="logo" src="${f("kit/svg/bartaboard-logo-light.svg")}">
<div class="abs" style="left:70px;right:70px;top:170px"><div class="t1">একটা খবর, ১২টা পত্রিকা।</div>
<div class="t2" style="margin-top:6px">কে কী লিখল,<br>এক নজরে<em>।</em></div></div>
${phone("sports-top-first.png", { x: 300, y: 520, w: 452, h: 740 })}
${badge("left:40px;top:690px", icon.stack, G, "একই খবর,<br>সব পত্রিকা<br>একসাথে")}
${badge("right:40px;top:1000px", icon.papers, R, "যত বেশি মাধ্যম,<br>তত ওপরে")}
${foot()}${stripe}</div>`;

// 4 · Typographic: 50+ outlets. One page. Free.
const WALL = ["প্রথম আলো", "যুগান্তর", "কালের কণ্ঠ", "ইত্তেফাক", "সমকাল", "ডেইলি স্টার", "বিডিনিউজ২৪", "ঢাকা পোস্ট", "জাগো নিউজ", "চ্যানেল ২৪",
  "এনটিভি", "বণিক বার্তা", "আজকের পত্রিকা", "দেশ রূপান্তর", "যমুনা টিভি", "ঢাকা ট্রিবিউন", "মানবজমিন", "কালবেলা", "বাংলা ট্রিবিউন", "সময় টিভি",
  "আরটিভি", "বার্তা২৪", "নয়া দিগন্ত", "ইনকিলাব", "ভোরের কাগজ", "সংবাদ", "আমার দেশ", "সারাবাংলা", "রাইজিংবিডি", "একুশে টিভি"];
const img4 = `<div class="page green">
<div class="abs" style="left:-40px;right:-40px;top:40px;display:flex;flex-wrap:wrap;gap:18px;justify-content:center;transform:rotate(-6deg);opacity:.16">
${[...WALL, ...WALL, ...WALL].map((n) => `<span style="font-weight:700;font-size:40px;padding:10px 26px;border:2px solid #fff;border-radius:999px;white-space:nowrap">${n}</span>`).join("")}
</div>
<div class="abs" style="inset:0;background:radial-gradient(ellipse 62% 48% at 50% 46%,rgba(0,106,78,.96),rgba(0,106,78,.55) 70%,rgba(0,106,78,.2))"></div>
<img class="abs" src="${f("kit/svg/bartaboard-logo-dark.svg")}" style="left:50%;top:150px;width:520px;transform:translateX(-50%)">
<div class="abs" style="left:70px;right:70px;top:360px;text-align:center">
  <div style="font-weight:800;font-size:120px;line-height:1.12">৫০টির বেশি<br>সংবাদমাধ্যম।</div>
  <div style="font-weight:800;font-size:120px;line-height:1.12;color:#ffd7dc;margin-top:10px">একটি পেজ।</div>
  <div style="font-weight:600;font-size:44px;line-height:1.5;color:#d9efe6;margin-top:34px">ফ্রি · প্রতি ১৫ মিনিটে হালনাগাদ · বাংলা ও English</div>
</div>
<div class="abs" style="left:50%;bottom:110px;transform:translateX(-50%);background:#fff;color:${G};font-family:Sora;font-weight:700;font-size:56px;padding:24px 58px;border-radius:999px;box-shadow:0 30px 60px -20px rgba(0,0,0,.45)">bartaboard.com</div>
${stripe}</div>`;

const IMAGES = [
  ["bartaboard-feed-1-all-papers", img1],
  ["bartaboard-feed-2-probashi", img2],
  ["bartaboard-feed-3-top-stories", img3],
  ["bartaboard-feed-4-fifty-outlets", img4],
];
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--allow-file-access-from-files"] });
const pg = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
for (const [name, body] of IMAGES) {
  const file = path.join(OUT, `${name}.html`);
  fs.writeFileSync(file, `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${body}</body></html>`);
  await pg.goto("file://" + file);
  await pg.evaluate(() => document.fonts.ready);
  await pg.waitForTimeout(300);
  await pg.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log(name);
}
await browser.close();
