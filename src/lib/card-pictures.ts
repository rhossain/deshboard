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
import {
  addressProblem,
  BROWSER_UA,
  bytesProblem,
  CRAWLER_UA,
  FLAT_PROBLEM,
  FLAT_SIDE,
  looksFlat as flatPixels,
  MAX_BYTES,
  pictureCandidates,
  pictureProblemText,
  shapeProblem,
  trimBars,
} from "./card-picture-rules";

// The rules are card-picture-rules.ts's, shared with the admin's check as a card is picked.
export { MIN_SIDE, pictureCandidates } from "./card-picture-rules";

/** A card's picture, across and down: what Facebook asks for a carousel's square. */
export const CARD_SIZE = 1080;
/** Changing how card pictures are made changes this, so ones made before aren't reused (see cardKey). */
export const CARD_DESIGN = 1;
const TIMEOUT_MS = 20_000;
const FORMATS = new Set(["jpeg", "png", "webp", "avif", "heif", "gif", "tiff"]);

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

/** Whether a picture looks like a logo or a placeholder rather than a photo (card-picture-rules.ts looksFlat). */
export async function looksFlat(image: Sharp): Promise<boolean> {
  const { data, info } = await image.clone().resize(FLAT_SIDE, FLAT_SIDE, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return flatPixels(data, info.width, info.height, info.channels);
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
    const size = bytesProblem(bytes.length);
    return size ? { problem: size } : { bytes };
  } catch (err) {
    return { problem: `didn't load (${(err as Error).name})` };
  }
}

/** Makes the card's picture from one address, or says what is wrong with it. */
export async function cardPictureFrom(url: string, bytes: Buffer): Promise<PreparedPicture> {
  const named = addressProblem(url);
  if (named) return { problem: named };
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
    // Bars of one colour around the picture are trimmed away (card-picture-rules.ts trimBars, as the admin does).
    const bars = trimBars(upright.data, width, height, upright.info.channels);
    if (bars) {
      ({ width, height } = bars);
      // Extracted pixels for the checks and the crop that follow.
      const inner = await image.extract(bars).raw().toBuffer({ resolveWithObject: true });
      image = sharp(inner.data, { raw: inner.info });
    }
    const side = Math.min(width, height);
    const shape = shapeProblem(width, height);
    if (shape) return { problem: shape };
    if (await looksFlat(image)) return { problem: FLAT_PROBLEM };
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
        return { problem: pictureProblemText(url, first) };
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
