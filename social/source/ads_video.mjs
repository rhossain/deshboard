// Renders Bartaboard's Bangla Reels ads (1080×1920, 30 fps, 15 s) to ./out-ads with Playwright and ffmpeg.
// Each video is one HTML page whose render(t) draws the frame at time t; the phone shows real frames of
// the live site (../ads/seq/<name>/NNNN.jpg, recorded by seq.mjs).
//   node ads_video.mjs [v1|v2|v3 ...] [--still]   (--still: a few PNG stills per video, no encode)
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(".");
const SEQ = "/home/claude/ads/seq";
const OUT = path.join(ROOT, "out-ads");
fs.mkdirSync(OUT, { recursive: true });
const f = (p) => "file://" + path.join(ROOT, p);
const font = (fam, w, file) =>
  `@font-face{font-family:'${fam}';font-weight:${w};src:url('${f("node_modules/@fontsource/" + file)}') format('woff2');}`;
const FONTS = [500, 600, 700, 800]
  .map((w) => font("Sora", w, `sora/files/sora-latin-${w === 800 ? 700 : w}-normal.woff2`))
  .concat([400, 500, 600, 700, 800].map((w) => font("Bengali", w, `noto-sans-bengali/files/noto-sans-bengali-bengali-${w}-normal.woff2`)))
  .join("\n");
const MAP = fs.readFileSync(path.join(ROOT, "map-full.txt"), "utf8").trim();
const G = "#006a4e", G2 = "#0b8460", R = "#f42a41", INK = "#0f1720", MUTED = "#5b6470", CREAM = "#f6f4ef";
const FPS = 30, DUR = 15;

const statusBar = (scale) => `<div style="height:${Math.round(44*scale)}px;display:flex;align-items:center;justify-content:space-between;padding:0 ${Math.round(34*scale)}px 0 ${Math.round(40*scale)}px;background:#f6f4ef;font-family:Sora;font-weight:600;font-size:${Math.round(19*scale)}px;color:#0f1720">
<span>9:41</span><span style="display:flex;gap:${Math.round(7*scale)}px;align-items:center">
<svg width="${Math.round(20*scale)}" height="${Math.round(13*scale)}" viewBox="0 0 20 13"><rect x="0" y="9" width="3.5" height="4" rx="1" fill="#0f1720"/><rect x="5.5" y="6" width="3.5" height="7" rx="1" fill="#0f1720"/><rect x="11" y="3" width="3.5" height="10" rx="1" fill="#0f1720"/><rect x="16.5" y="0" width="3.5" height="13" rx="1" fill="#0f1720"/></svg>
<svg width="${Math.round(18*scale)}" height="${Math.round(13*scale)}" viewBox="0 0 18 13" fill="none" stroke="#0f1720" stroke-width="2.2" stroke-linecap="round"><path d="M1.5 4.5a11 11 0 0 1 15 0M4.5 7.6a6.5 6.5 0 0 1 9 0"/><circle cx="9" cy="11" r="1.4" fill="#0f1720" stroke="none"/></svg>
<svg width="${Math.round(27*scale)}" height="${Math.round(13*scale)}" viewBox="0 0 27 13"><rect x=".8" y=".8" width="22" height="11.4" rx="3.2" fill="none" stroke="#0f1720" stroke-opacity=".45" stroke-width="1.4"/><rect x="2.6" y="2.6" width="16" height="7.8" rx="1.8" fill="#0f1720"/><rect x="24.2" y="4.3" width="2" height="4.4" rx="1" fill="#0f1720" fill-opacity=".45"/></svg></span></div>`;
// The phone: the recorded screens are 780×1688 (390×844 at 2×).
const SCREEN_W = 680, SCREEN_H = Math.round((680 * 1688) / 780), BEZEL = 18;

const css = `
${FONTS}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1080px;height:1920px;overflow:hidden;background:${CREAM}}
#stage{position:relative;width:1080px;height:1920px;overflow:hidden;font-family:Bengali,Sora,sans-serif;color:${INK};
  background-color:${CREAM};background-image:radial-gradient(ellipse 75% 40% at 50% 62%,rgba(0,106,78,.10),rgba(0,106,78,0) 70%),radial-gradient(rgba(15,23,32,.075) 1.7px,transparent 2.1px);background-size:100% 100%,32px 32px}
.abs{position:absolute}
.title{position:absolute;left:60px;right:60px;top:250px;text-align:center}
.t1{font-weight:700;font-size:62px;line-height:1.25;color:${INK}}
.t2{font-weight:800;font-size:104px;line-height:1.18;color:${G};letter-spacing:-.01em}
.t2 em{font-style:normal;color:${R}}
.logo{position:absolute;left:50%;top:120px;width:300px;transform:translateX(-50%)}
.chip{position:absolute;left:0;top:0;padding:18px 30px;border-radius:999px;background:#fff;border:1px solid #e3e6ea;
  box-shadow:0 18px 30px -18px rgba(15,23,32,.35);font-weight:700;font-size:40px;white-space:nowrap;display:flex;align-items:center;gap:14px}
.chip i{width:16px;height:16px;border-radius:50%;display:block}
#phone{position:absolute;left:${(1080 - SCREEN_W - 2 * BEZEL) / 2}px;top:0;width:${SCREEN_W + 2 * BEZEL}px;height:${SCREEN_H + 2 * BEZEL}px;
  border-radius:86px;background:#10151c;padding:${BEZEL}px;box-shadow:0 60px 90px -40px rgba(15,23,32,.55),0 0 0 3px #2a3039 inset}
#screen{position:relative;width:${SCREEN_W}px;height:${SCREEN_H}px;border-radius:70px;overflow:hidden;background:#f6f4ef}
#screen img{width:100%;display:block}
#island{position:absolute;left:50%;top:14px;width:150px;height:42px;border-radius:30px;background:#05080c;transform:translateX(-50%)}
#finger{position:absolute;width:96px;height:96px;border-radius:50%;background:rgba(255,255,255,.55);border:4px solid rgba(0,106,78,.75);
  box-shadow:0 8px 24px rgba(15,23,32,.25);margin:-48px 0 0 -48px;opacity:0}
#ripple{position:absolute;width:150px;height:150px;border-radius:50%;border:6px solid ${G};margin:-75px 0 0 -75px;opacity:0}
.badge{position:absolute;z-index:10;display:flex;align-items:center;gap:18px;padding:22px 32px 22px 22px;border-radius:30px;background:#fff;
  box-shadow:0 30px 50px -24px rgba(15,23,32,.45);border:1px solid #e6e8ec;font-weight:700;font-size:38px;line-height:1.25;white-space:nowrap}
.badge b{flex:0 0 72px;height:72px;border-radius:22px;display:grid;place-items:center;color:#fff;font-size:40px;font-family:Bengali,Sora}
.badge svg{width:40px;height:40px}
#end{position:absolute;inset:0;background:${G};background-image:radial-gradient(ellipse 80% 50% at 50% 40%,rgba(255,255,255,.10),rgba(255,255,255,0) 70%),radial-gradient(rgba(255,255,255,.08) 1.7px,transparent 2.1px);background-size:100% 100%,32px 32px;
  clip-path:inset(100% 0 0 0)}
#end .e{position:absolute;left:70px;right:70px;text-align:center;color:#fff}
.rib{display:flex;gap:22px;white-space:nowrap;font-weight:600;font-size:36px;color:rgba(255,255,255,.55)}
.rib span{padding:10px 26px;border:2px solid rgba(255,255,255,.22);border-radius:999px}
.stripe{position:absolute;left:0;right:0;bottom:0;height:18px;display:flex;z-index:20}
.stripe span{flex:1;background:${G}}.stripe span.r{flex:0 0 300px;background:${R}}
.card{position:absolute;left:0;top:0;width:820px;padding:30px 36px;border-radius:30px;background:#fff;border:1px solid #e3e6ea;box-shadow:0 26px 40px -24px rgba(15,23,32,.4)}
.card .s{font-weight:700;font-size:30px;color:${G}}
.card .h{font-weight:700;font-size:42px;line-height:1.35;margin-top:8px}
.city{position:absolute;left:0;top:0;padding:14px 26px;border-radius:999px;background:#fff;border:1px solid #e3e6ea;box-shadow:0 16px 28px -16px rgba(15,23,32,.4);
  font-weight:700;font-size:38px;white-space:nowrap;display:flex;gap:12px;align-items:center}
.city i{width:14px;height:14px;border-radius:50%;background:${R}}
`;

const icon = {
  papers: `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h12v14H6a2 2 0 0 1-2-2z"/><path d="M16 9h4v8a2 2 0 0 1-2 2"/><path d="M7 9h6M7 12.5h6M7 16h4"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>`,
  stack: `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 3 8l9 5 9-5z"/><path d="m3 13 9 5 9-5"/></svg>`,
  lang: `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 2.5 14.4 0 17M12 3.5c-2.5 2.6-2.5 14.4 0 17"/></svg>`,
};
const badge = (id, ic, color, html) => `<div class="badge" id="${id}" style="opacity:0"><b style="background:${color}">${ic}</b><span>${html}</span></div>`;

// The end card, shared by every video: two slow rows of outlet names under the address.
const NAMES = ["প্রথম আলো","যুগান্তর","কালের কণ্ঠ","ইত্তেফাক","সমকাল","ডেইলি স্টার","বিডিনিউজ২৪","ঢাকা পোস্ট","জাগো নিউজ","চ্যানেল ২৪","এনটিভি","বণিক বার্তা","আজকের পত্রিকা","দেশ রূপান্তর","যমুনা টিভি","ঢাকা ট্রিবিউন","মানবজমিন","কালবেলা","বাংলা ট্রিবিউন","সময় টিভি","আরটিভি","বার্তা২৪"];
const RIBBON = [...NAMES, ...NAMES].map((n) => `<span>${n}</span>`).join("");
const RIBBON2 = [...NAMES.slice(11), ...NAMES, ...NAMES.slice(0, 11)].map((n) => `<span>${n}</span>`).join("");
const endCard = (line) => `<div id="end">
  <img class="e" id="e-logo" src="${f("kit/svg/bartaboard-logo-dark.svg")}" style="left:50%;right:auto;top:470px;width:640px;transform:translateX(-50%)">
  <div class="e" id="e-line" style="top:700px;font-weight:800;font-size:84px;line-height:1.25">${line}</div>
  <div class="e" id="e-sub" style="top:950px;font-weight:600;font-size:42px;color:#d9efe6;line-height:1.5">ফ্রি&nbsp;&nbsp;·&nbsp;&nbsp;অ্যাপ নামাতে হবে না&nbsp;&nbsp;·&nbsp;&nbsp;বাংলা ও English</div>
  <div id="e-rib" style="position:absolute;left:0;right:0;top:1420px;opacity:0">
    <div class="rib" id="rib1">${RIBBON}</div><div class="rib" id="rib2" style="margin-top:22px">${RIBBON2}</div></div>
  <div class="e" id="e-url" style="top:1110px;left:50%;right:auto;transform:translateX(-50%);background:#fff;color:${G};font-family:Sora;font-weight:700;font-size:62px;padding:26px 60px;border-radius:999px;box-shadow:0 30px 60px -20px rgba(0,0,0,.45)">bartaboard.com</div>
</div>`;

// Shared page script: easing, the phone, the finger, badges and the end card. VIDEO holds the per-video parts.
const runtime = `
const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
const p=(t,a,b)=>clamp((t-a)/(b-a));
const eo=(x)=>1-Math.pow(1-x,3), ei=(x)=>x*x*x, eio=(x)=>x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2;
const back=(x)=>{const c=1.70158,c3=c+1;return 1+c3*Math.pow(x-1,3)+c*Math.pow(x-1,2)};
const $=(id)=>document.getElementById(id);
const st=(el,o)=>{if(typeof el==="string")el=$(el);if(!el)return;for(const k in o)el.style[k]=o[k]};
let lastSrc="";
async function phone(t,{rise,seq,start,frames,top=520}){
  const r=eo(p(t,rise,rise+.8));
  const y=top+(1-r)*1400;
  st("phone",{top:y+"px",opacity:r>0?1:0});
  const i=Math.round(clamp((t-start)*30,0,frames-1));
  const src=SEQ_URL+"/"+seq+"/"+String(i).padStart(4,"0")+".jpg";
  const img=$("shot");
  if(src!==lastSrc){img.src=src;lastSrc=src;await img.decode().catch(()=>{});}
  return y;
}
// A swipe on the screen: the finger slides from y0 to y1 (fractions of the screen) over [a,b].
function finger(t,swipes,taps=[]){
  let o=0,x=.62,y=.7;
  for(const [a,b] of swipes){
    if(t>=a-.25&&t<=b+.2){const q=eio(p(t,a,b));y=.74-q*.46;x=.64-q*.04;o=Math.min(p(t,a-.25,a),1-p(t,b,b+.2));}
  }
  let ro=0,rs=.4,rx=0,ry=0;
  for(const [a,tx,ty] of taps){
    if(t>=a-.45&&t<=a+.5){x=tx;y=ty;o=Math.max(o,Math.min(p(t,a-.45,a-.25),1-p(t,a+.15,a+.4)));
      const q=p(t,a,a+.5);ro=q>0?1-q:0;rs=.4+q*1.2;rx=tx;ry=ty;}
  }
  st("finger",{left:(x*${SCREEN_W})+"px",top:(y*${SCREEN_H})+"px",opacity:o,transform:"scale("+(o>0?1:.8)+")"});
  st("ripple",{left:(rx*${SCREEN_W})+"px",top:(ry*${SCREEN_H})+"px",opacity:ro,transform:"scale("+rs+")"});
}
function pop(id,t,a,b,{x,y,from="left"}){
  const i=back(p(t,a,a+.45)), o=Math.min(p(t,a,a+.2),1-p(t,b,b+.3));
  const dx=(from==="left"?-1:1)*(1-i)*120;
  if(from==="right") x=1080-x-$(id).offsetWidth;
  st(id,{left:x+"px",top:y+"px",opacity:o,transform:"translateX("+dx+"px) scale("+(.85+.15*clamp(i,0,1.2))+")"});
}
function title(t,{a=-1,b,id}){ // id fades in at a, out at b (b<0: stays)
  const i=a<0?1:eo(p(t,a,a+.5)), o=b<0?1:1-p(t,b,b+.35);
  st(id,{opacity:Math.min(i,o),transform:"translateY("+((1-i)*40-(1-o)*40)+"px)"});
}
function end(t,a){
  const w=eio(p(t,a,a+.6));
  st("end",{clipPath:"inset("+((1-w)*100)+"% 0 0 0)"});
  const ri=p(t,a+1.2,a+1.8);
  st("e-rib",{opacity:ri});
  st("rib1",{transform:"translateX("+(-200-(t-a)*70)+"px)"});
  st("rib2",{transform:"translateX("+(-1400+(t-a)*70)+"px)"});
  [["e-logo",.45],["e-line",.65],["e-sub",.85],["e-url",1.05]].forEach(([id,d])=>{
    const i=eo(p(t,a+d,a+d+.5));
    const base=id==="e-logo"||id==="e-url"?"translateX(-50%) ":"";
    const pulse=id==="e-url"?1+Math.sin(Math.max(0,t-(a+1.8))*4.2)*.035*p(t,a+1.8,a+2.2):1;
    st(id,{opacity:i,transform:base+"translateY("+((1-i)*50)+"px) scale("+pulse+")"});
  });
}
`;

const page = (body, script) => `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>
<div id="stage">${body}
<div id="phone" style="opacity:0"><div id="screen">${statusBar(SCREEN_W / 390)}<img id="shot" alt=""><div id="island"></div><div id="finger"></div><div id="ripple"></div></div></div>
</div>
<script>const SEQ_URL=${JSON.stringify("file://" + SEQ)};${runtime}${script}</script></body></html>`;

// ── v1 · "কয়টা অ্যাপ খোলেন?" → every paper, one page ─────────────────────────────────────────────────────
const OUTLETS = ["প্রথম আলো", "যুগান্তর", "কালের কণ্ঠ", "ইত্তেফাক", "সমকাল", "ডেইলি স্টার", "বিডিনিউজ২৪", "ঢাকা পোস্ট",
  "জাগো নিউজ", "চ্যানেল ২৪", "এনটিভি", "বণিক বার্তা", "আজকের পত্রিকা", "দেশ রূপান্তর", "যমুনা টিভি", "ঢাকা ট্রিবিউন",
  "নয়া দিগন্ত", "ইনকিলাব", "মানবজমিন", "কালবেলা"];
const DOTS = [G, R, "#e8a317", "#2f6fd6", G2, "#7a4fd0"];
// Chip positions: a loose pile below the question (x centre, y, rotation).
const SPOTS = [[300,700,-6],[760,690,5],[520,800,2],[250,900,4],[800,880,-4],[540,990,-3],[300,1090,6],[780,1080,-7],[520,1190,4],
  [260,1290,-3],[790,1280,3],[540,1390,-5],[320,1490,5],[770,1480,-2],[540,1590,3],[280,1680,-6],[800,1670,6],[530,760,-8],[540,1100,7],[540,1290,-4]];
const v1 = page(`
<img class="logo" src="${f("kit/svg/bartaboard-logo-light.svg")}" id="logo">
<div class="title" id="q"><div class="t1">সকালে খবর পড়তে</div><div class="t2">কয়টা অ্যাপ খোলেন<em>?</em></div></div>
<div class="title" id="a" style="opacity:0"><div class="t1">এখন সব পত্রিকা,</div><div class="t2">এক পেজে।</div></div>
${OUTLETS.map((o, i) => `<div class="chip" id="c${i}" style="opacity:0"><i style="background:${DOTS[i % DOTS.length]}"></i>${o}</div>`).join("")}
${badge("b1", icon.papers, G, "৫০টির বেশি<br>সংবাদমাধ্যম")}
${badge("b2", icon.clock, R, "প্রতি ১৫ মিনিটে<br>হালনাগাদ")}
${endCard("দেশের সব খবর,<br>এক জায়গায়")}
<div class="stripe"><span></span><span class="r"></span><span></span></div>`, `
const SPOTS=${JSON.stringify(SPOTS)};
window.render=async(t)=>{
  title(t,{id:"q",b:2.55});
  title(t,{id:"a",a:2.75,b:10.9});
  st("logo",{opacity:1-p(t,10.9,11.2)});
  SPOTS.forEach(([x,y,r],i)=>{
    const a=-.3+i*.1, s=back(p(t,a,a+.35)), m=ei(p(t,2.1+i*.012,2.75+i*.012));
    const el=$("c"+i); const w=el.offsetWidth,h=el.offsetHeight;
    const cx=x+(540-x)*m, cy=y+(1200-y)*m;
    const jig=Math.sin(t*9+i)*1.6*(1-m);
    st(el,{opacity:p(t,a,a+.12)*(1-p(t,2.55,2.8)),transform:"translate("+(cx-w/2)+"px,"+(cy-h/2+jig)+"px) rotate("+(r*(1-m))+"deg) scale("+(clamp(s,0,1.3)*(1-.7*m))+")"});
  });
  await phone(t,{rise:2.8,seq:"stand",start:3.7,frames:210});
  st("phone",{transform:"scale("+(1-.08*eio(p(t,10.8,11.4)))+")",opacity:1-p(t,11.0,11.4)});
  finger(t,[[4.5,6.3],[7.1,8.9],[9.5,10.7]]);
  pop("b1",t,4.9,10.7,{x:28,y:820,from:"left"});
  pop("b2",t,7.3,10.7,{x:28,y:1220,from:"right"});
  end(t,11.0);
};`);

// ── v2 · probashi: wherever you are, every paper ─────────────────────────────────────────────────────────
// Map: viewBox 62×92, drawn at scale MS with its top-left at (MX,MY); Dhaka is at (31.8,42.8).
const MS = 6.2, MX = 540 - 31 * MS, MY = 640;
const DHAKA = [MX + 31.8 * MS, MY + 42.8 * MS];
const CITIES = [["দুবাই", 70, 760], ["রিয়াদ", 90, 1010], ["দোহা", 110, 1260], ["কুয়ালালামপুর", 700, 1010], ["সিঙ্গাপুর", 760, 1260],
  ["লন্ডন", 100, 560], ["রোম", 140, 1500], ["নিউ ইয়র্ক", 740, 560], ["টরন্টো", 790, 1500]];
const v2 = page(`
<img class="logo" src="${f("kit/svg/bartaboard-logo-light.svg")}" id="logo">
<div class="title" id="q"><div class="t1">প্রবাসে থাকেন?</div><div class="t2" style="font-size:96px">দেশের খবর<br>খুঁজতে দশ সাইট?</div></div>
<div class="title" id="a" style="opacity:0"><div class="t1">যেখানেই থাকুন,</div><div class="t2">দেশের সব খবর।</div></div>
<svg id="map" class="abs" style="left:0;top:0" width="1080" height="1920" viewBox="0 0 1080 1920">
  <g id="lines" fill="none" stroke="${G}" stroke-width="4" stroke-linecap="round" stroke-dasharray="2 14"></g>
  <g transform="translate(${MX},${MY}) scale(${MS})">
    <path id="mapPath" d="${MAP}" fill="${G}" fill-opacity="0" stroke="${G}" stroke-width=".55" stroke-linejoin="round"/>
  </g>
  <circle id="pulse" cx="${DHAKA[0]}" cy="${DHAKA[1]}" r="18" fill="none" stroke="${R}" stroke-width="5" opacity="0"/>
  <circle id="pin" cx="${DHAKA[0]}" cy="${DHAKA[1]}" r="14" fill="${R}" stroke="#fff" stroke-width="5" opacity="0"/>
</svg>
<div class="city" id="dhaka" style="opacity:0;background:${G};color:#fff;border-color:${G}">ঢাকা</div>
${CITIES.map(([n], i) => `<div class="city" id="k${i}" style="opacity:0"><i></i>${n}</div>`).join("")}
${badge("b1", icon.clock, R, "প্রতি ১৫ মিনিটে<br>নতুন খবর")}
${badge("b2", icon.lang, G, "বাংলা ও ইংরেজি,<br>দুটোই")}
${endCard("প্রবাসে বসেও<br>দেশের সব খবর")}
<div class="stripe"><span></span><span class="r"></span><span></span></div>`, `
const CITIES=${JSON.stringify(CITIES)}, D=${JSON.stringify(DHAKA)};
const NS="http://www.w3.org/2000/svg"; const lines=[];
const defs=document.createElementNS(NS,"defs"); $("map").prepend(defs);
CITIES.forEach(([n,x,y],i)=>{
  const el=$("k"+i); const cx=x+el.offsetWidth/2, cy=y+el.offsetHeight/2;
  const mx=(cx+D[0])/2+(cx<D[0]?-1:1)*40, my=Math.min(cy,D[1])-110;
  const d="M"+cx+" "+cy+" Q"+mx+" "+my+" "+D[0]+" "+D[1];
  const mask=document.createElementNS(NS,"mask"); mask.setAttribute("id","m"+i); mask.setAttribute("maskUnits","userSpaceOnUse");
  mask.setAttribute("x",0);mask.setAttribute("y",0);mask.setAttribute("width",1080);mask.setAttribute("height",1920);
  const mpth=document.createElementNS(NS,"path"); mpth.setAttribute("d",d); mpth.setAttribute("fill","none"); mpth.setAttribute("stroke","#fff"); mpth.setAttribute("stroke-width",14);
  mask.appendChild(mpth); defs.appendChild(mask);
  const path=document.createElementNS(NS,"path"); path.setAttribute("d",d); path.setAttribute("mask","url(#m"+i+")");
  $("lines").appendChild(path);
  const L=mpth.getTotalLength(); mpth.setAttribute("stroke-dasharray",L+" "+L);
  lines.push([mpth,L]);
});
const mp=$("mapPath"), ml=mp.getTotalLength(); mp.style.strokeDasharray=ml; 
window.render=async(t)=>{
  title(t,{id:"q",b:2.75});
  title(t,{id:"a",a:3.0,b:10.9});
  st("logo",{opacity:1-p(t,10.9,11.2)});
  const fade=1-p(t,2.9,3.4), shrink=1-.25*eio(p(t,2.9,3.4));
  st("map",{opacity:fade,transform:"scale("+shrink+")",transformOrigin:D[0]+"px "+D[1]+"px"});
  mp.style.strokeDashoffset=ml*(1-eio(p(t,-1.2,.25)));
  mp.setAttribute("fill-opacity",.06+.12*p(t,0,.6));
  st("pin",{opacity:p(t,.6,.8)}); 
  const pq=((Math.max(0,t-.7))%1.1)/1.1; $("pulse").setAttribute("r",14+pq*46); st("pulse",{opacity:t>.7?(1-pq)*.8:0});
  const dk=$("dhaka"); st(dk,{left:(D[0]+26)+"px",top:(D[1]-dk.offsetHeight/2)+"px",opacity:p(t,.7,1.0)*fade});
  CITIES.forEach(([n,x,y],i)=>{
    const a=.75+i*.15, s=back(p(t,a,a+.4));
    st("k"+i,{left:x+"px",top:y+"px",opacity:p(t,a,a+.15)*fade,transform:"scale("+clamp(s,0,1.2)+")"});
    const [mpth,L]=lines[i]; mpth.setAttribute("stroke-dashoffset",L*(1-eio(p(t,a+.1,a+.8))));
  });
  await phone(t,{rise:3.1,seq:"latest",start:4.1,frames:210});
  st("phone",{transform:"scale("+(1-.08*eio(p(t,10.8,11.4)))+")",opacity:1-p(t,11.0,11.4)});
  finger(t,[[4.8,6.5],[7.1,8.7],[9.3,11.0]]);
  pop("b1",t,5.2,10.7,{x:28,y:820,from:"left"});
  pop("b2",t,7.5,10.7,{x:28,y:1220,from:"right"});
  end(t,11.0);
};`);

// ── v3 · one story, twelve papers: Top stories ────────────────────────────────────────────────────────────
const VERSIONS = [
  ["চ্যানেল ২৪", "বাংলাদেশ সফরের জন্য ওয়েস্ট ইন্ডিজের দল ঘোষণা"],
  ["খোলা কাগজ", "বাংলাদেশ সফরের জন্য ওয়েস্ট ইন্ডিজের টেস্ট দল ঘোষণা"],
  ["বাংলা ট্রিবিউন", "বাংলাদেশ সফরে ওয়েস্ট ইন্ডিজের অন্য লক্ষ্য"],
  ["আলোকিত বাংলাদেশ", "বাংলাদেশ সফরের জন্য ওয়েস্ট ইন্ডিজের দল ঘোষণা"],
];
const CARD_SPOTS = [[130, 700, -4], [150, 930, 3], [110, 1160, -2], [140, 1390, 4]];
const v3 = page(`
<img class="logo" src="${f("kit/svg/bartaboard-logo-light.svg")}" id="logo">
<div class="title" id="q"><div class="t1">একটা খবর,</div><div class="t2">১২টা পত্রিকা।</div></div>
<div class="title" id="a" style="opacity:0"><div class="t1">কে কী লিখল,</div><div class="t2">এক নজরে।</div></div>
${VERSIONS.map(([s, h], i) => `<div class="card" id="v${i}" style="opacity:0"><div class="s">${s}</div><div class="h">${h}</div></div>`).join("")}
${badge("b1", icon.stack, G, "একই খবর,<br>সব পত্রিকা একসাথে")}
${badge("b2", icon.papers, R, "যত বেশি মাধ্যম,<br>তত ওপরে")}
${endCard("দেশের সব খবর,<br>এক জায়গায়")}
<div class="stripe"><span></span><span class="r"></span><span></span></div>`, `
const SP=${JSON.stringify(CARD_SPOTS)};
window.render=async(t)=>{
  title(t,{id:"q",b:2.75});
  title(t,{id:"a",a:3.0,b:10.9});
  st("logo",{opacity:1-p(t,10.9,11.2)});
  SP.forEach(([x,y,r],i)=>{
    const a=-.3+i*.42, s=eo(p(t,a,a+.45)), m=ei(p(t,2.35+i*.05,2.95+i*.05));
    const tx=x+(1-s)*(i%2?260:-260), ty=y+(1200-y)*m*0+(-(1-s)*60);
    st("v"+i,{opacity:p(t,a,a+.2)*(1-p(t,2.7+i*.05,3.0+i*.05)),transform:"translate("+tx+"px,"+(ty+m*(1100-y)*.6)+"px) rotate("+(r*(1-m))+"deg) scale("+(1-.35*m)+")"});
  });
  await phone(t,{rise:2.9,seq:"top",start:3.6,frames:225});
  st("phone",{transform:"scale("+(1-.08*eio(p(t,10.8,11.4)))+")",opacity:1-p(t,11.0,11.4)});
  // Sequence: swipe 0.8–1.6, tap "সব ১২টি মাধ্যম" at 1.8, swipes 2.8–4.8 and 5.4–7.5 (seq time).
  finger(t,[[4.4,5.2],[6.4,8.4],[9.0,10.9]],[[5.42,.48,.71]]);
  pop("b1",t,4.2,10.7,{x:28,y:860,from:"left"});
  pop("b2",t,7.6,10.7,{x:28,y:1280,from:"right"});
  end(t,11.0);
};`);

const VIDEOS = {
  v1: { html: v1, name: "bartaboard-reel-1-all-papers" },
  v2: { html: v2, name: "bartaboard-reel-2-probashi" },
  v3: { html: v3, name: "bartaboard-reel-3-top-stories" },
};
const args = process.argv.slice(2);
const still = args.includes("--still");
const which = args.filter((a) => !a.startsWith("--"));
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--allow-file-access-from-files"] });
for (const id of which.length ? which : Object.keys(VIDEOS)) {
  const { html, name } = VIDEOS[id];
  const file = path.join(OUT, `${id}.html`);
  fs.writeFileSync(file, html);
  const pg = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  await pg.goto("file://" + file);
  await pg.evaluate(() => document.fonts.ready);
  if (still) {
    for (const t of [0, 1.2, 2.5, 3.3, 5.5, 8, 10.2, 11.6, 14]) {
      await pg.evaluate((t) => window.render(t), t);
      await pg.screenshot({ path: path.join(OUT, `${id}-t${String(t).replace(".", "_")}.png`) });
    }
    console.log(id, "stills");
  } else {
    const dir = path.join(OUT, `${id}-frames`);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir);
    for (let i = 0; i < FPS * DUR; i++) {
      await pg.evaluate((t) => window.render(t), i / FPS);
      await pg.screenshot({ path: path.join(dir, `${String(i).padStart(4, "0")}.png`) });
    }
    const mp4 = path.join(OUT, `${name}.mp4`);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", path.join(dir, "%04d.png"),
      "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000", "-shortest",
      "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", "-profile:v", "high", "-movflags", "+faststart",
      "-c:a", "aac", "-b:a", "128k", mp4]);
    fs.copyFileSync(path.join(dir, "0000.png"), path.join(OUT, `${name}-cover.png`));
    console.log(id, "→", mp4);
  }
  await pg.close();
}
await browser.close();
