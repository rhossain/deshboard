import { chromium } from "playwright";
const OUT = "/home/claude/ads/cap";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, timezoneId: "Asia/Dhaka", colorScheme: "light", isMobile: true, hasTouch: true,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" });
await ctx.route(/googletagmanager|google-analytics|facebook\.(net|com)|cloudflareinsights/, (r) => r.abort());
await ctx.addInitScript(() => { try { localStorage.setItem("bartaboard:tour", "seen"); localStorage.setItem("bartaboard:return-prompt", JSON.stringify({ closedAt: new Date().toISOString() })); } catch {} });
for (const [name, path] of [["sports-stand", "/bn/news/sports/"], ["sports-top", "/bn/news/sports/?view=top"], ["sports-latest", "/bn/news/sports/?view=latest"], ["home-stand", "/bn/"]]) {
  const page = await ctx.newPage();
  await page.goto("https://bartaboard.com" + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/${name}-first.png` });
  await page.screenshot({ path: `${OUT}/${name}-full.png`, fullPage: true });
  console.log(name, await page.evaluate(() => document.documentElement.scrollHeight));
  await page.close();
}
await browser.close();
