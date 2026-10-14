// Renders six 1080×1350 Instagram feed posts for Bartaboard to ./out-ig with Playwright.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(".");
const OUT = path.join(ROOT, "out-ig");
fs.mkdirSync(OUT, { recursive: true });
const f = (p) => "file://" + path.join(ROOT, p);
const font = (fam, w, file) =>
  `@font-face{font-family:'${fam}';font-weight:${w};src:url('${f("node_modules/@fontsource/" + file)}') format('woff2');}`;
const FONTS = [500, 600, 700]
  .map((w) => font("Sora", w, `sora/files/sora-latin-${w}-normal.woff2`))
  .concat([400, 500, 600, 700, 800].map((w) => font("Bengali", w, `noto-sans-bengali/files/noto-sans-bengali-bengali-${w}-normal.woff2`)))
  .join("\n");
const MAP = fs.readFileSync(path.join(ROOT, "map-full.txt"), "utf8").trim();

const G = "#006a4e", R = "#f42a41", INK = "#0f1720", MUTED = "#5b6470", CREAM = "#f6f4ef";

const base = `
${FONTS}
*{box-sizing:border-box;margin:0;padding:0}
body{width:1080px;height:1350px;overflow:hidden}
.page{position:relative;width:1080px;height:1350px;overflow:hidden;font-family:Sora,Bengali,sans-serif;color:${INK}}
.cream{background-color:${CREAM};background-image:radial-gradient(ellipse 70% 45% at 50% 55%,rgba(0,106,78,.06),rgba(0,106,78,0) 70%),radial-gradient(rgba(15,23,32,.07) 1.6px,transparent 2px);background-size:100% 100%,30px 30px}
.bn{font-family:Bengali,sans-serif}
.stripe{position:absolute;left:0;right:0;bottom:0;height:14px;display:flex}
.stripe span{flex:1;background:${G}}.stripe span.r{flex:0 0 240px;background:${R}}
.foot{position:absolute;left:80px;right:80px;bottom:74px;display:flex;align-items:center;justify-content:space-between}
.pill{font-weight:700;font-size:34px;border-radius:99px;padding:16px 34px;background:${G};color:#fff}
.bio{font-weight:600;font-size:26px;color:${MUTED};display:flex;align-items:center;gap:12px}
.bio svg{width:30px;height:30px}
.logo{position:absolute;left:80px;top:78px;width:420px}
.h1{font-family:Bengali,sans-serif;font-weight:800;line-height:1.22;letter-spacing:-.005em}
.en{font-weight:600;color:${MUTED};line-height:1.4}
`;
const linkIcon = (c) => `<svg viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1 1"/><path d="M14 10a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1-1"/></svg>`;
const foot = ({ url = "bartaboard.com", pillBg = G, pillInk = "#fff", note = MUTED } = {}) => `
<div class="foot"><span class="pill" style="background:${pillBg};color:${pillInk}">${url}</span>
<span class="bio" style="color:${note}">${linkIcon(note)}Link in bio</span></div>
<div class="stripe"><span></span><span class="r"></span><span></span></div>`;

// 1 · How it works (masthead look, a real three-step sequence)
const steps = [
  ["১", "৫০+ পত্রিকা থেকে সর্বশেষ শিরোনাম সংগ্রহ", "We collect the latest headlines from 50+ papers"],
  ["২", "প্রতি ১৫ মিনিটে এক বোর্ডে সাজানো", "Laid out on one board, every 15 minutes"],
  ["৩", "শিরোনামে ক্লিক করে মূল পত্রিকায় পড়ুন", "Tap a headline, read it on the paper’s own site"],
];
const p1 = `<div class="page cream">
<div style="position:absolute;left:80px;right:80px;top:70px">
  <div style="border-top:3px solid ${INK};border-bottom:1px solid ${INK};height:9px"></div>
  <div style="display:flex;justify-content:space-between;font-size:19px;font-weight:700;letter-spacing:.14em;padding:16px 0">
    <span>BANGLA &amp; ENGLISH</span><span style="color:${G}">bartaboard.com</span><span>UPDATED EVERY 15 MIN</span></div>
  <img src="${f("kit/svg/bartaboard-logo-light.svg")}" style="display:block;width:640px;margin:22px auto 26px">
  <div style="border-top:1px solid ${INK};border-bottom:3px solid ${INK};height:9px"></div>
</div>
<div style="position:absolute;left:80px;right:80px;top:410px">
  <div class="h1" style="font-size:68px">বার্তাবোর্ড কীভাবে কাজ করে?</div>
  <div class="en" style="font-size:30px;margin-top:10px">How Bartaboard works</div>
  <div style="margin-top:46px;display:flex;flex-direction:column;gap:22px">
  ${steps.map(([n, bn, en]) => `<div style="display:flex;gap:30px;align-items:center;background:#fff;border:1px solid #dfe2e7;border-radius:22px;padding:26px 30px;box-shadow:0 12px 26px -16px rgba(15,23,32,.25)">
    <span class="bn" style="flex:0 0 84px;height:84px;border-radius:50%;background:${G};color:#fff;font-weight:800;font-size:46px;display:grid;place-items:center">${n}</span>
    <span><span class="bn" style="display:block;font-weight:700;font-size:37px;line-height:1.3">${bn}</span>
    <span class="en" style="display:block;font-size:24px;margin-top:4px">${en}</span></span></div>`).join("")}
  </div>
</div>
${foot()}
</div>`;

// 2 · Every corner (map with division pins)
const pins = [
  [31.8, 42.8, "ঢাকা", true], [50.5, 65, "চট্টগ্রাম"], [20.6, 58, "খুলনা"], [7.9, 34.2, "রাজশাহী"],
  [51, 26, "সিলেট"], [16.5, 13, "রংপুর"], [31, 59.8, "বরিশাল"], [31.7, 28.4, "ময়মনসিংহ"],
];
const MX = 330, MY = 505, MS = 6.9; // map origin and scale (62×92 viewBox → 521×773)
const p2 = `<div class="page cream">
<img class="logo" src="${f("kit/svg/bartaboard-logo-light.svg")}">
<div style="position:absolute;left:80px;right:80px;top:240px">
  <div class="h1" style="font-size:64px">দেশের প্রতিটি প্রান্তের খবর,<br><span style="color:${G}">এক বোর্ডে</span></div>
  <div class="en" style="font-size:27px;margin-top:16px">From Dhaka to Chattogram, Rajshahi to Sylhet: news from every corner of Bangladesh.</div>
</div>
<svg style="position:absolute;left:${MX}px;top:${MY}px" width="${62 * MS}" height="${92 * MS}" viewBox="0 0 62 92">
  <path fill="#d5e7de" stroke="#b9d6c8" stroke-width=".3" d="${MAP}"/>
  ${pins.map(([x, y, , big]) => big
    ? `<circle cx="${x}" cy="${y}" r="3.4" fill="${R}" fill-opacity=".18"/><circle cx="${x}" cy="${y}" r="1.7" fill="${R}" stroke="#fff" stroke-width=".5"/>`
    : `<circle cx="${x}" cy="${y}" r="1.2" fill="${R}" stroke="#fff" stroke-width=".4"/>`).join("")}
</svg>
${pins.map(([x, y, name, big]) => {
  const px = MX + x * MS, py = MY + y * MS;
  return big
    ? `<span class="bn" style="position:absolute;left:${px + 22}px;top:${py - 22}px;font-weight:700;font-size:26px;color:#fff;background:${INK};border-radius:99px;padding:2px 16px">${name}</span>`
    : `<span class="bn" style="position:absolute;left:${px + 14}px;top:${py - 18}px;font-weight:700;font-size:22px;color:${INK}">${name}</span>`;
}).join("")}
${foot()}
</div>`;

// 3 · TV news videos (dark)
const tiles = [["খেলা", "#e0303f", "2:41"], ["রাজনীতি", "#34d08a", "4:05"], ["আন্তর্জাতিক", "#4f7df0", "3:18"], ["অর্থনীতি", "#d9a441", "1:56"]];
const p3 = `<div class="page" style="background:radial-gradient(ellipse 80% 50% at 50% 62%,rgba(52,208,138,.13),rgba(52,208,138,0) 70%),radial-gradient(rgba(235,232,226,.06) 1.6px,transparent 2px) 0 0/30px 30px,#0f1113;color:#f4f5f7">
<img class="logo" src="${f("kit/svg/bartaboard-logo-dark.svg")}">
<div style="position:absolute;left:80px;right:80px;top:250px">
  <div class="h1" style="font-size:64px">শুধু শিরোনাম নয়,<br><span style="color:#34d08a">সংবাদ ভিডিওও</span></div>
  <div class="en" style="font-size:29px;margin-top:18px;color:#9aa3ae">The latest news videos from 30+ TV channels, all in one place.</div>
</div>
<div style="position:absolute;left:80px;right:80px;top:505px;display:grid;grid-template-columns:1fr 1fr;gap:24px">
${tiles.map(([cat, c, d], i) => `<div style="background:#1c1f23;border:1px solid #2c3036;border-radius:22px;overflow:hidden;box-shadow:0 22px 40px -22px rgba(0,0,0,.8)">
  <div style="position:relative;aspect-ratio:16/8.4;background:linear-gradient(135deg,${i % 2 ? "#123a2e" : "#1d2a3a"},#0b0d0f)">
    <span style="position:absolute;inset:0;display:grid;place-items:center"><span style="width:86px;height:86px;border-radius:50%;background:${i === 0 ? R : "rgba(255,255,255,.92)"};display:grid;place-items:center">
      <svg width="34" height="34" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="${i === 0 ? "#fff" : INK}"/></svg></span></span>
    <span style="position:absolute;right:14px;bottom:12px;font-size:19px;font-weight:700;background:rgba(0,0,0,.72);border-radius:8px;padding:3px 10px">${d}</span>
  </div>
  <div style="padding:16px 20px 20px"><b class="bn" style="font-size:20px;font-weight:700;color:#06140e;background:${c};border-radius:99px;padding:2px 14px">${cat}</b>
  <i style="display:block;height:12px;border-radius:6px;background:#3a3e45;margin-top:14px;width:88%"></i></div></div>`).join("")}
</div>
${foot({ url: "bartaboard.com/videos", pillBg: "#34d08a", pillInk: "#06140e", note: "#9aa3ae" })}
</div>`;

// 4 · In Bangla
const p4 = `<div class="page cream">
<img class="logo" src="${f("kit/svg/bartaboard-logo-light.svg")}">
<div style="position:absolute;right:80px;top:96px;display:flex;background:#fff;border:1px solid #dfe2e7;border-radius:99px;padding:6px;font-size:24px;font-weight:700;box-shadow:0 10px 22px -14px rgba(15,23,32,.3)">
  <span style="padding:10px 24px;color:${MUTED}">English</span><span class="bn" style="padding:10px 24px;border-radius:99px;background:${G};color:#fff">বাংলা</span></div>
<div style="position:absolute;left:80px;right:80px;top:330px">
  <div class="en" style="font-size:30px">Prefer Bangla?</div>
  <div class="h1" style="font-size:150px;line-height:1.12;margin-top:16px">বাংলায়<br><span style="color:${G}">পড়ুন</span><span style="display:inline-block;width:40px;height:40px;border-radius:50%;background:${R};margin-left:22px;vertical-align:.25em"></span></div>
  <div class="h1" style="font-size:52px;margin-top:40px;font-weight:700">পুরো বার্তাবোর্ড, এখন বাংলাতেও</div>
  <div class="en" style="font-size:29px;margin-top:20px">All of Bartaboard is available in Bangla too: every section, every source.</div>
</div>
${foot({ url: "bartaboard.com/bn" })}
</div>`;

// 5 · Our sources (green, names as plain text only)
const SRC = ["প্রথম আলো", "The Daily Star", "bdnews24", "যুগান্তর", "Dhaka Tribune", "কালের কণ্ঠ", "সমকাল", "The Business Standard",
  "ইত্তেফাক", "বাংলাদেশ প্রতিদিন", "New Age", "মানবজমিন", "নয়া দিগন্ত", "The Financial Express", "দেশ রূপান্তর", "কালবেলা",
  "বণিক বার্তা", "আজকের পত্রিকা", "Daily Sun", "জনকণ্ঠ", "ঢাকা পোস্ট", "বাংলা ট্রিবিউন", "UNB", "ভোরের কাগজ", "জাগো নিউজ ২৪", "সংবাদ"];
const p5 = `<div class="page" style="background:radial-gradient(circle at 70% 30%,#0a7d5c 0%,#006a4e 45%,#004a37 100%);color:#fff">
<div style="position:absolute;inset:0;background:radial-gradient(rgba(255,255,255,.07) 1.6px,transparent 2px) 0 0/30px 30px"></div>
<img class="logo" src="${f("kit/svg/bartaboard-logo-dark.svg")}">
<div style="position:absolute;left:80px;right:80px;top:250px">
  <div class="h1" style="font-size:60px">কোন কোন পত্রিকা থেকে খবর আসে?</div>
  <div style="display:flex;align-items:baseline;gap:22px;margin-top:22px">
    <span class="bn" style="font-weight:800;font-size:170px;line-height:1">৫০+</span>
    <span class="en" style="color:#d2eadf;font-size:32px;line-height:1.35">Bangla and English<br>news outlets</span></div>
</div>
<div style="position:absolute;left:80px;right:80px;top:640px;display:flex;flex-wrap:wrap;gap:14px">
${SRC.map((s, i) => `<span class="${/[a-z]/i.test(s) ? "" : "bn"}" style="font-size:25px;font-weight:600;padding:10px 20px;border-radius:12px;background:${i === 0 ? R : "rgba(255,255,255,.12)"};border:1px solid rgba(255,255,255,${i === 0 ? 0 : .22})">${s}</span>`).join("")}
<span style="font-size:25px;font-weight:700;padding:10px 20px;border-radius:12px;background:#fff;color:${G}">+ আরও</span>
</div>
${foot({ url: "bartaboard.com/sources", pillBg: "#fff", pillInk: G, note: "#d2eadf" })}
</div>`;

// 6 · Search and save
const bm = (on) => `<svg width="34" height="34" viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4.5L6 21z" fill="${on ? G : "none"}" stroke="${on ? G : "#9aa3ae"}" stroke-width="2" stroke-linejoin="round"/></svg>`;
const res = [["অর্থনীতি", "#7d5c1e", true], ["Business", "#7d5c1e", false], ["জাতীয়", G, false]];
const p6 = `<div class="page cream">
<img class="logo" src="${f("kit/svg/bartaboard-logo-light.svg")}">
<div style="position:absolute;left:80px;right:80px;top:250px">
  <div class="h1" style="font-size:66px">খুঁজুন, সেভ করুন,<br><span style="color:${G}">পরে পড়ুন</span></div>
  <div class="en" style="font-size:29px;margin-top:18px">Search in Bangla or English, and save stories to read later.</div>
</div>
<div style="position:absolute;left:80px;right:80px;top:640px">
  <div style="display:flex;align-items:center;gap:20px;background:#fff;border:2px solid ${G};border-radius:22px;padding:24px 28px;box-shadow:0 18px 34px -20px rgba(0,106,78,.5)">
    <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="${G}" stroke-width="2.6" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
    <span class="bn" style="font-size:36px;font-weight:600">বাজেট</span><span style="width:3px;height:40px;background:${G}"></span>
    <span style="margin-left:auto;font-size:21px;font-weight:700;color:${MUTED};border:1px solid #dfe2e7;border-radius:10px;padding:4px 12px">বাংলা / EN</span></div>
  <div style="display:flex;flex-direction:column;gap:16px;margin-top:22px">
  ${res.map(([cat, c, on]) => `<div style="display:flex;gap:22px;align-items:center;background:#fff;border:1px solid #dfe2e7;border-radius:20px;padding:22px 26px">
    <div style="flex:1"><b class="${/[a-z]/i.test(cat) ? "" : "bn"}" style="font-size:19px;color:#fff;background:${c};border-radius:99px;padding:2px 14px">${cat}</b>
    <i style="display:block;height:14px;border-radius:7px;background:#c9ccd2;margin-top:16px;width:90%"></i>
    <i style="display:block;height:14px;border-radius:7px;background:#dfe2e7;margin-top:10px;width:58%"></i></div>${bm(on)}</div>`).join("")}
  </div>
</div>
${foot()}
</div>`;

const posts = [
  ["ig-post-1-how-it-works", p1], ["ig-post-2-every-corner", p2], ["ig-post-3-tv-videos", p3],
  ["ig-post-4-in-bangla", p4], ["ig-post-5-sources", p5], ["ig-post-6-search-save", p6],
];
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
for (const [name, body] of posts) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${base}</style></head><body>${body}</body></html>`;
  fs.writeFileSync(path.join(OUT, name + ".html"), html);
  await page.goto(f("out-ig/" + name + ".html"));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, name + ".png") });
  console.log("wrote", name);
}
await browser.close();
