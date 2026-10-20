/**
 * The pictures of a Facebook carousel's cards (scripts/post-facebook.ts). Facebook shows each card's picture as a
 * square, about 600 pixels across on a phone's screen, and fetches it itself from wherever the card says. Outlets'
 * pictures went wrong there in several ways:
 *
 *   - thumbnails: a feed's or a share tag's picture is often a small copy (Daily Bangladesh's are 300×169, Prothom
 *     Alo's feed asks for 280 across, TBS's and RTV's are 600×315), blown up to the square and blurred;
 *   - a ".jpg" that is a WebP or AVIF (Channel i's CDN answers WebP whatever is asked), which Facebook may show as a
 *     smeared preview;
 *   - share "plates": the photo framed with the outlet's own banner (Channel 24's, Dhaka Post's, NTV's, Jugantor's,
 *     The Daily Star's, bdnews24's strip), whose words the square cuts in half;
 *   - the outlet's logo standing in for a photo, and pictures some outlets won't give Facebook's servers at all.
 *
 * So each card's picture is the outlet's own, made once by the deploy: the largest, plainest copy of it the outlet
 * has (pictureCandidates: the same file without the share plate or the thumbnail size, where the outlet's addresses
 * say so; each is tried and the first good one taken), checked (it loads, is a photo, and is big enough for the
 * square), cropped to the square around what matters in it (sharp's attention strategy: faces, colour, detail), and
 * encoded as a plain 1080×1080 JPEG, which the posting script serves from bartaboard.com (functions/fb). A picture
 * that isn't good enough leaves its headline out of the carousel, and the pick is made again.
 *
 * Node only (the deploy's posting step).
 */
import { createHash } from "node:crypto";
import sharp, { type Sharp } from "sharp";
import { BROWSER_UA, CRAWLER_UA } from "./post-checks";

/** A card's picture, across and down: what Facebook asks for a carousel's square. */
export const CARD_SIZE = 1080;
/** Changing how card pictures are made changes this, so ones made before aren't reused (see cardKey). */
export const CARD_DESIGN = 1;
/**
 * The square's side in the outlet's own pixels, at least (after any bars are trimmed): about two thirds of what a
 * phone shows, so the picture is never blown up more than a little. A 1200×630 share picture has 630; a 600×315
 * thumbnail, 315, which is why it is looked past for the outlet's larger copy first.
 */
export const MIN_SIDE = 400;
const MAX_BYTES = 20 * 1024 * 1024;
const TIMEOUT_MS = 20_000;
const FORMATS = new Set(["jpeg", "png", "webp", "avif", "heif", "gif", "tiff"]);
/** Pictures that name themselves for what they are not: an outlet's logo, a placeholder. */
const NOT_A_PHOTO = /(?:^|[/_.-])(?:logo|placeholder|default[-_]?(?:image|img|thumb|photo)|no[-_]?(?:image|img|photo)|blank)(?:[/_.-]|\d|$)/i;

/**
 * Where else the same picture may be, larger or without the outlet's share plate, best first, the address given
 * last. Only rewrites seen to work on the outlets' own addresses (October 2026); one that doesn't answer with a good
 * picture is passed over, so a site that changes its addresses only loses the better copy.
 */
export function pictureCandidates(url: string): string[] {
  const out: string[] = [];
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return [url];
  }
  const add = (next: string | URL) => {
    const s = String(next);
    if (s !== url && !out.includes(s)) out.push(s);
  };
  const withPath = (path: string, search = u.search) => {
    const v = new URL(u.href);
    v.pathname = path;
    v.search = search;
    return v;
  };
  const host = u.hostname;
  const path = u.pathname;

  // YouTube: the full-size thumbnail (1280×720) when the video has one; the standard ones are letterboxed 4:3.
  const yt = /^\/vi(?:_webp)?\/([\w-]{6,})\/(?:maxres|sd|hq|mq)?default\.(?:jpg|webp)$/.exec(path);
  if (/(^|\.)ytimg\.com$/.test(host) && yt) {
    for (const size of ["maxresdefault", "sddefault", "hqdefault"]) add(`https://i.ytimg.com/vi/${yt[1]}/${size}.jpg`);
  }
  // Channel 24: /PLATE/ is the photo on the channel's banner; the same name beside it is the photo.
  if (path.includes("/PLATE/")) add(withPath(path.replace("/PLATE/", "/")));
  // Daily Bangladesh: /SM/ is a 300×169 thumbnail of the photo beside it (800×480).
  if (host.endsWith("digitaloceanspaces.com") && path.includes("/SM/")) add(withPath(path.replace("/SM/", "/")));
  // Dhaka Post: /og-image/ is the photo with the paper's strip, the rest of the path the photo (1280×720).
  if (host === "assets.dhakapost.com" && path.startsWith("/og-image/")) add(withPath(path.replace("/og-image/", "/")));
  // Jugantor: /social-thumbnail/ is the photo with the paper's band.
  if (path.includes("/social-thumbnail/")) add(withPath(path.replace("/social-thumbnail/", "/")));
  // Naya Diganta: og_… is the share copy of the picture without it.
  if (host === "file.dailynayadiganta.com" && /\/og_[^/]+$/.test(path)) add(withPath(path.replace(/\/og_([^/]+)$/, "/$1")));
  // Drupal sites (NTV, TBS, The Daily Star): /styles/<style>/public/ is a resized, often branded, copy of the file.
  if (/\/sites\/default\/files\/styles\/[^/]+\/public\//.test(path)) add(withPath(path.replace(/\/styles\/[^/]+\/public\//, "/"), ""));
  // Quintype's CDN (bdnews24, Prothom Alo): the share copy carries an overlay or a small width; ask for the photo.
  if (host === "media.assettype.com" || host === "media.prothomalo.com") add(withPath(path, "?w=1600&auto=format%2Ccompress"));
  // RTV's resizer: twice the size it was asked for.
  if (host === "img.rtvonline.com" && path === "/resize") {
    const v = new URL(u.href);
    const w = Number(v.searchParams.get("w"));
    const h = Number(v.searchParams.get("h"));
    if (w && h && w < 1200) {
      v.searchParams.set("w", "1200");
      v.searchParams.set("h", String(Math.round((h * 1200) / w)));
      add(v);
    }
  }
  // Alokito Bangladesh: /image-contents/<w>x<h>x1x1/ makes the copy; 1200×630 is its share size.
  const ab = /^\/image-contents\/(\d+)x(\d+)x1x1\//.exec(path);
  if (ab && Number(ab[1]) < 1200) add(withPath(path.replace(ab[0], "/image-contents/1200x630x1x1/")));
  // WordPress: name-300x200.jpg is a size of name.jpg.
  if (/-\d{2,4}x\d{2,4}\.(?:jpe?g|png|webp)$/i.test(path)) add(withPath(path.replace(/-\d{2,4}x\d{2,4}(\.\w+)$/i, "$1")));

  out.push(url);
  return out;
}

/** The stored name of a card picture made from `source` (also its address: /fb/<key>.jpg). */
export function cardKey(source: string): string {
  return `${createHash("sha256").update(JSON.stringify(["fb-card", CARD_DESIGN, source])).digest("hex").slice(0, 32)}-0`;
}

export interface CardPicture {
  /** The address the picture was made from (one of the candidates). */
  source: string;
  /** Its size as the outlet has it, and after any bars were trimmed. */
  width: number;
  height: number;
  /** The card's picture: a 1080×1080 JPEG. */
  jpeg: Buffer;
  key: string;
}

export type PreparedPicture = { picture: CardPicture; problem?: undefined } | { picture?: undefined; problem: string };

/**
 * Whether a picture looks like a logo, a placeholder or a blank rather than a photo: most of it one flat colour, with
 * no texture in it. Seen small (64×64), where a photo's grain still shows and a graphic's background is one colour.
 * (A photo with a plain sky passes: its sky isn't most of it. Small logos are caught by the size already.)
 */
export async function looksFlat(image: Sharp): Promise<boolean> {
  const { data, info } = await image.clone().resize(64, 64, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: c } = info;
  const colours = new Map<number, number>();
  let still = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const at = (y * w + x) * c;
      const colour = ((data[at] >> 5) << 6) | ((data[at + 1] >> 5) << 3) | (data[at + 2] >> 5);
      colours.set(colour, (colours.get(colour) ?? 0) + 1);
      // How much the pixel differs from its neighbours to the right and below, in its most changing channel.
      let change = 0;
      for (let k = 0; k < 3; k++) {
        if (x + 1 < w) change = Math.max(change, Math.abs(data[at + c + k] - data[at + k]));
        if (y + 1 < h) change = Math.max(change, Math.abs(data[at + w * c + k] - data[at + k]));
      }
      if (change <= 2) still++;
    }
  }
  const pixels = w * h;
  return Math.max(...colours.values()) / pixels > 0.7 && still / pixels > 0.5;
}

/**
 * Fetches a picture's bytes as a browser would ask for it (no referrer: some outlets refuse other sites' pages), and
 * as Facebook's crawler if the outlet refuses that.
 */
async function download(url: string): Promise<{ bytes: Buffer } | { problem: string }> {
  const first = await downloadAs(url, BROWSER_UA);
  if ("bytes" in first || !/^answers 4\d\d$/.test(first.problem) || first.problem === "answers 404") return first;
  const second = await downloadAs(url, CRAWLER_UA);
  return "bytes" in second ? second : first;
}

async function downloadAs(url: string, agent: string): Promise<{ bytes: Buffer } | { problem: string }> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": agent, accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.5" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      void res.body?.cancel();
      return { problem: `answers ${res.status}` };
    }
    const length = Number(res.headers.get("content-length"));
    if (length > MAX_BYTES) {
      void res.body?.cancel();
      return { problem: `is ${Math.round(length / 1e6)} MB` };
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length < 2000) return { problem: `is only ${bytes.length} bytes` };
    if (bytes.length > MAX_BYTES) return { problem: `is ${Math.round(bytes.length / 1e6)} MB` };
    return { bytes };
  } catch (err) {
    return { problem: `didn't load (${(err as Error).name})` };
  }
}

/** Makes the card's picture from one address, or says what is wrong with it. */
export async function cardPictureFrom(url: string, bytes: Buffer): Promise<PreparedPicture> {
  if (NOT_A_PHOTO.test(new URL(url).pathname)) return { problem: "is the outlet's logo or a placeholder, not a photo" };
  try {
    // Whatever it is (WebP or AVIF named .jpg, a PNG with transparency, a phone photo turned by its EXIF), it becomes
    // an upright sRGB picture on white. A broken or cut-off file stops here rather than showing grey on Facebook.
    const meta = await sharp(bytes, { failOn: "error" }).metadata();
    if (!meta.format || !FORMATS.has(meta.format)) return { problem: `isn't a picture Facebook can show (${meta.format ?? "unknown"})` };
    const upright = await sharp(bytes, { failOn: "error", animated: false, limitInputPixels: 80_000_000 })
      .rotate()
      .flatten({ background: "#ffffff" })
      .toColourspace("srgb")
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let image = sharp(upright.data, { raw: upright.info });
    let { width, height } = upright.info;
    // Bars of one colour around the picture (a 4:3 thumbnail of a 16:9 video, a photo on a white page) are trimmed
    // away, unless that would leave little: a flat graphic is a flat graphic.
    const trimmed = await image
      .clone()
      .trim({ threshold: 18 })
      .raw()
      .toBuffer({ resolveWithObject: true })
      .catch(() => null);
    if (
      trimmed &&
      (trimmed.info.width < width || trimmed.info.height < height) &&
      trimmed.info.width >= width * 0.6 &&
      trimmed.info.height >= height * 0.5
    ) {
      // A few pixels more off each trimmed side: a JPEG's edge between bar and picture rings, leaving a dark line.
      const cutX = trimmed.info.width < width ? Math.max(2, Math.round(trimmed.info.width * 0.008)) : 0;
      const cutY = trimmed.info.height < height ? Math.max(2, Math.round(trimmed.info.height * 0.008)) : 0;
      width = trimmed.info.width - 2 * cutX;
      height = trimmed.info.height - 2 * cutY;
      image = sharp(trimmed.data, { raw: trimmed.info }).extract({ left: cutX, top: cutY, width, height });
      // Extracted pixels for the checks and the crop that follow.
      const inner = await image.raw().toBuffer({ resolveWithObject: true });
      image = sharp(inner.data, { raw: inner.info });
    }
    const side = Math.min(width, height);
    if (side < MIN_SIDE) return { problem: `is only ${width}×${height} (a card needs ${MIN_SIDE} pixels each way)` };
    if (width / height > 3.2 || height / width > 3.2) return { problem: `is ${width}×${height}: too narrow a strip for a square card` };
    if (await looksFlat(image)) return { problem: "looks like a logo or a placeholder, not a photo" };
    let card = image.resize(CARD_SIZE, CARD_SIZE, { fit: "cover", position: sharp.strategy.attention, kernel: "lanczos3" });
    // A little crispness back after shrinking; a picture enlarged gets none (it would only sharpen the softness).
    if (side > CARD_SIZE * 1.15) card = card.sharpen({ sigma: 0.6 });
    const jpeg = await card
      .jpeg({ quality: 86, chromaSubsampling: "4:2:0", progressive: false })
      .toBuffer();
    return { picture: { source: url, width, height, jpeg, key: cardKey(url) } };
  } catch (err) {
    return { problem: `can't be read (${(err as Error).message.split("\n")[0].slice(0, 80)})` };
  }
}

/** Each address's card picture is made once a run: the checks and the post share it. */
const made = new Map<string, Promise<PreparedPicture>>();

/**
 * The card's picture for an outlet's (or YouTube's) picture: from the first of its candidates that makes a good one.
 * The problem, when none does, is the given address's own.
 */
export function prepareCardPicture(url: string | undefined): Promise<PreparedPicture> {
  if (!url || !/^https?:\/\//.test(url)) return Promise.resolve({ problem: `no picture (${url || "none"})` });
  if (!made.has(url)) {
    made.set(
      url,
      (async (): Promise<PreparedPicture> => {
        let first: string | null = null;
        for (const candidate of pictureCandidates(url)) {
          const got = await download(candidate);
          const result = "bytes" in got ? await cardPictureFrom(candidate, got.bytes) : { problem: got.problem };
          if (result.picture) return result;
          if (candidate === url) first = result.problem;
        }
        return { problem: `picture ${url} ${first ?? "isn't usable"}` };
      })(),
    );
  }
  return made.get(url)!;
}

/** What is wrong with a picture as a card's; null when it makes a good one. */
export async function cardPictureProblem(url: string | undefined): Promise<string | null> {
  return (await prepareCardPicture(url)).problem ?? null;
}

/** Whether a card's picture is already one of Bartaboard's own (made by an earlier run). */
export const isCardPicture = (url: string | undefined, site: string) => !!url && url.startsWith(`${site}/fb/`);
