import { chromium } from "playwright";
import fs from "node:fs";
const OUT = "/home/claude/ads/seq";
const FPS = 30;
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
/** keyframes: [time, scrollY]; between consecutive keys ease; equal values = hold */
const at = (keys, t) => {
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, y0] = keys[i], [t1, y1] = keys[i + 1];
    if (t <= t1) return y0 + (y1 - y0) * ease(Math.min(1, Math.max(0, (t - t0) / (t1 - t0))));
  }
  return keys[keys.length - 1][1];
};
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, timezoneId: "Asia/Dhaka", colorScheme: "light", isMobile: true, hasTouch: true,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" });
await ctx.route(/googletagmanager|google-analytics|facebook\.(net|com)|cloudflareinsights/, (r) => r.abort());
await ctx.addInitScript(() => { try { localStorage.setItem("bartaboard:tour", "seen"); localStorage.setItem("bartaboard:return-prompt", JSON.stringify({ closedAt: new Date().toISOString() })); } catch {} });

async function sequence(name, path, segments) {
  const dir = `${OUT}/${name}`; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const page = await ctx.newPage();
  await page.goto("https://bartaboard.com" + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  for (let y = 0; y < 4000; y += 600) { await page.evaluate((y) => window.scrollTo(0, y), y); await page.waitForTimeout(250); }
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(1200);
  let n = 0;
  for (const seg of segments) {
    if (seg.action) { await seg.action(page); continue; }
    const frames = Math.round(seg.dur * FPS);
    for (let i = 0; i < frames; i++) {
      const y = Math.round(at(seg.keys, i / FPS));
      await page.evaluate((y) => window.scrollTo(0, y), y);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      if (seg.wait) await page.waitForTimeout(seg.wait);
      await page.screenshot({ path: `${dir}/${String(n++).padStart(4, "0")}.jpg`, type: "jpeg", quality: 92 });
    }
  }
  console.log(name, n, "frames");
  await page.close();
}

await sequence("stand", "/bn/news/sports/", [{ dur: 7, keys: [[0, 0], [0.8, 0], [2.6, 900], [3.4, 900], [5.2, 2100], [5.8, 2100], [7, 3000]] }]);
await sequence("latest", "/bn/news/sports/?view=latest", [{ dur: 7, keys: [[0, 0], [0.7, 0], [2.4, 700], [3.0, 700], [4.6, 1500], [5.2, 1500], [7, 2300]] }]);
await sequence("top", "/bn/news/sports/?view=top", [
  { dur: 1.8, keys: [[0, 0], [0.8, 0], [1.6, 150], [1.8, 150]] },
  { action: async (page) => { await page.getByText(/সব ১২টি মাধ্যম|সব \S+টি মাধ্যম/).first().click(); } },
  { dur: 0.6, keys: [[0, 150], [0.6, 150]], wait: 20 },
  { dur: 5.1, keys: [[0, 150], [0.4, 150], [2.4, 1150], [3.0, 1150], [5.1, 1900]] },
]);
await browser.close();
