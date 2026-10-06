import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import sharp from "sharp";
import { fetchBytes, fetchText } from "./fetchers/http";
import { resolveUrl } from "./fetchers/utils";
import type { LogoShape, NewsSource } from "./types";

export interface Logo {
  bytes: ArrayBuffer;
  contentType: string;
  url: string;
}

/** Logos rarely change: keep them for a day. Misses are retried after an hour. */
const TTL_MS = 24 * 3600_000;
const MISS_TTL_MS = 3600_000;
const MAX_BYTES = 512 * 1024;
/** Images from domain-parking pages, i.e. the site is gone. */
const PARKED = /sedoparking|parkingcrew|bodis\.com|dan\.com|afternic/i;

const g = globalThis as unknown as {
  __logoCache?: Map<string, { at: number; logo: Logo | null }>;
  __logoInflight?: Map<string, Promise<Logo | null>>;
};
const cache = (g.__logoCache ??= new Map());
const inflight = (g.__logoInflight ??= new Map());

/** `logo` values found anywhere in the page's JSON-LD (Organization, publisher, …). */
function jsonLdLogos($: cheerio.CheerioAPI): string[] {
  const out: string[] = [];
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== "object") return;
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (k === "logo") {
        if (typeof val === "string") out.push(val);
        else if (val && typeof val === "object" && typeof (val as { url?: unknown }).url === "string") {
          out.push((val as { url: string }).url);
        }
      } else walk(val);
    }
  };
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      walk(JSON.parse($(el).text()));
    } catch {
      // ignore broken JSON-LD
    }
  });
  return out;
}

function imgSrc($img: cheerio.Cheerio<AnyNode>): string | undefined {
  const src =
    $img.attr("data-src") ??
    $img.attr("data-lazy-src") ??
    $img.attr("data-original") ??
    $img.attr("src") ??
    $img.attr("srcset")?.split(",")[0]?.trim().split(/\s+/)[0];
  return src && !src.startsWith("data:") ? src : undefined;
}

/**
 * Candidate logo URLs from a homepage, best first:
 * a header `<img>` marked as the logo, JSON-LD `logo`, any other logo-ish
 * `<img>`, then touch icons / favicons.
 */
export function findLogoCandidates(html: string, pageUrl: string): string[] {
  const $ = cheerio.load(html);
  const scored: { url: string; score: number }[] = [];
  const add = (href: string | undefined, score: number) => {
    const url = href && resolveUrl(href, pageUrl);
    if (url) scored.push({ url, score });
  };

  $("img").each((i, el) => {
    const $img = $(el);
    const src = imgSrc($img);
    if (!src) return;
    const $link = $img.closest("a");
    const own = [$img.attr("class"), $img.attr("id"), $img.attr("alt"), src].join(" ");
    const around = [$link.attr("class"), $link.attr("id"), $img.parent().attr("class"), $img.parent().attr("id")].join(
      " ",
    );
    const isLogo = /logo|brand|masthead/i.test(own) || /logo|brand|masthead/i.test(around);
    if (!isLogo) return;
    // Social-media icons are often named "facebook-logo" etc.; never the site's own logo.
    if (/facebook|twitter|youtube|instagram|linkedin|whatsapp|tiktok|telegram|social/i.test(own)) return;

    let score = 50;
    if ($img.closest("header, nav, .header, #header, [class*='header' i]").length) score += 20;
    if ($img.closest("footer, .footer, #footer, [class*='footer' i]").length) score -= 30;
    const href = $link.attr("href");
    if (href && (href === "/" || resolveUrl(href, pageUrl)?.replace(/\/$/, "") === new URL(pageUrl).origin)) score += 15;
    if (/sponsor|partner|ads?[-_/]|banner|app-?store|google-?play/i.test(own + " " + around)) score -= 60;
    if (/\.svg(\?|$)/i.test(src)) score += 5;
    score -= Math.min(i, 20) / 2; // earlier in the page is more likely the masthead
    add(src, score);
  });

  for (const url of jsonLdLogos($)) add(url, 55);

  $('link[rel~="apple-touch-icon" i], link[rel~="icon" i]').each((_, el) => {
    const size = Number(/(\d+)x\d+/.exec($(el).attr("sizes") ?? "")?.[1] ?? 0);
    add($(el).attr("href"), 5 + Math.min(size, 512) / 100);
  });
  add("/apple-touch-icon.png", 1);

  const seen = new Set<string>();
  return scored
    .filter((c) => !PARKED.test(c.url))
    .sort((a, b) => b.score - a.score)
    .map((c) => c.url)
    .filter((u) => !seen.has(u) && seen.add(u));
}

async function fetchImage(url: string): Promise<Logo | null> {
  try {
    const res = await fetchBytes(url, { accept: "image/*", timeoutMs: 8000 });
    const type = res.contentType.split(";")[0].trim().toLowerCase();
    if (!type.startsWith("image/") || res.bytes.byteLength < 100 || res.bytes.byteLength > MAX_BYTES) return null;
    return { bytes: res.bytes, contentType: type, url: res.url };
  } catch {
    return null;
  }
}

async function loadLogo(source: NewsSource): Promise<Logo | null> {
  try {
    const page = await fetchText(source.homepage, { accept: "text/html,application/xhtml+xml" });
    for (const url of findLogoCandidates(page.text, page.url).slice(0, 5)) {
      const logo = await fetchImage(url);
      if (logo) return logo;
    }
  } catch {
    // homepage blocked or unreachable
  }
  // Last resort: the site's icon via Google's favicon service (many BD sites block our requests).
  const host = new URL(source.homepage).host.replace(/^www\./, "");
  return fetchImage(`https://www.google.com/s2/favicons?domain=${host}&sz=128`);
}

/** A source's logo image, discovered from its homepage and cached in memory. */
export async function getLogo(source: NewsSource): Promise<Logo | null> {
  const hit = cache.get(source.id);
  if (hit && Date.now() - hit.at < (hit.logo ? TTL_MS : MISS_TTL_MS)) return hit.logo;

  const running = inflight.get(source.id);
  if (running) return running;

  const p = loadLogo(source)
    .then((logo) => {
      cache.set(source.id, { at: Date.now(), logo });
      return logo;
    })
    .finally(() => inflight.delete(source.id));
  inflight.set(source.id, p);
  return p;
}

/** The largest image's size in an .ico file, which sharp can't read. Null if it isn't one. */
function icoSize(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length < 22 || bytes.readUInt32LE(0) !== 0x00010000) return null;
  let width = 0;
  let height = 0;
  for (let i = 0; i < bytes.readUInt16LE(4) && 6 + 16 * i + 16 <= bytes.length; i++) {
    // A size byte of 0 means 256.
    const w = bytes[6 + 16 * i] || 256;
    if (w > width) [width, height] = [w, bytes[7 + 16 * i] || 256];
  }
  return width ? { width, height } : null;
}

/**
 * The most a logo needs: three times the box it's drawn in on a card (24 px tall, 164 px wide), so
 * it stays sharp on high-density screens. Outlets' originals run to thousands of pixels.
 */
const SERVED_SIZE = { width: 492, height: 72 };

/** A logo ready to serve: resized, re-encoded, and measured. */
export interface PreparedLogo {
  bytes: Buffer;
  ext: string;
  shape: LogoShape;
}

/** True for a light logo on a transparent background (made for a dark header). */
async function isLightOnTransparent(image: Buffer): Promise<boolean> {
  const data = await sharp(image).resize({ width: 64 }).ensureAlpha().raw().toBuffer();
  let opaque = 0;
  let luminance = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    opaque++;
    luminance += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  }
  const transparentShare = 1 - opaque / (data.length / 4);
  return opaque > 0 && transparentShare > 0.1 && luminance / opaque > 200;
}

/**
 * An outlet's logo as the site serves it: no larger than SERVED_SIZE, as WebP (whichever of lossless
 * and lossy is smaller; vector logos are drawn at that size too), with its measurements. Icons in
 * .ico files, which sharp can't read, are served as they are. Null when the image can't be read.
 */
export async function prepareLogo(original: Buffer): Promise<PreparedLogo | null> {
  const ico = icoSize(original);
  if (ico) return { bytes: original, ext: "ico", shape: { ...ico, light: false } };
  try {
    const { format } = await sharp(original).metadata();
    // SVGs are drawn at 72 dpi by default; four times that leaves room to scale down to SERVED_SIZE.
    const resized = sharp(original, { animated: false, density: format === "svg" ? 288 : undefined }).resize({
      ...SERVED_SIZE,
      fit: "inside",
      withoutEnlargement: true,
    });
    const [lossless, lossy] = await Promise.all([
      resized.clone().webp({ lossless: true, effort: 6 }).toBuffer({ resolveWithObject: true }),
      resized.clone().webp({ quality: 90, effort: 6 }).toBuffer({ resolveWithObject: true }),
    ]);
    const { data, info } = lossless.data.length <= lossy.data.length ? lossless : lossy;
    const light = await isLightOnTransparent(data);
    return { bytes: data, ext: "webp", shape: { width: info.width, height: info.height, light } };
  } catch {
    return null;
  }
}
