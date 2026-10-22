/**
 * What makes a good carousel card picture, as pure rules on an address and on decoded pixels: shared by the deploy
 * (src/lib/card-pictures.ts, which decodes with sharp and makes the card) and the admin (src/components/admin/
 * pictures.ts, which decodes in the browser, through /api/admin/picture), so a picture the admin passes when it is
 * picked is one the deploy takes when it goes out, and one it stops is stopped for the same reason, in the same words.
 *
 * No Node or browser APIs here: it runs in both.
 */

/** How the deploy asks for pictures: as a browser, then as Facebook's crawler if the outlet refuses that. */
export const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
export const CRAWLER_UA = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";

/**
 * The square's side in the outlet's own pixels, at least (after any bars are trimmed): about two thirds of what a
 * phone shows, so the picture is never blown up more than a little. A 1200×630 share picture has 630; a 600×315
 * thumbnail, 315, which is why it is looked past for the outlet's larger copy first.
 */
export const MIN_SIDE = 400;
/** A picture file larger than this isn't taken; smaller than MIN_BYTES is an icon or an error page. */
export const MAX_BYTES = 20 * 1024 * 1024;
export const MIN_BYTES = 2000;
/** Pictures that name themselves for what they are not: an outlet's logo, a placeholder. */
export const NOT_A_PHOTO = /(?:^|[/_.-])(?:logo|placeholder|default[-_]?(?:image|img|thumb|photo)|no[-_]?(?:image|img|photo)|blank)(?:[/_.-]|\d|$)/i;
/** How far a pixel may be from the corner's colour and still be part of a bar around the picture. */
const TRIM_THRESHOLD = 18;

/** What is wrong with the address itself, before it is fetched; null when nothing. */
export function addressProblem(url: string): string | null {
  try {
    return NOT_A_PHOTO.test(new URL(url).pathname) ? "is the outlet's logo or a placeholder, not a photo" : null;
  } catch {
    return "isn't a web address";
  }
}

/** What is wrong with a fetched file's size; null when nothing. */
export function bytesProblem(bytes: number): string | null {
  if (bytes < MIN_BYTES) return `is only ${bytes} bytes`;
  if (bytes > MAX_BYTES) return `is ${Math.round(bytes / 1e6)} MB`;
  return null;
}

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The part of the picture inside any bars of one colour around it (a 4:3 thumbnail of a 16:9 video, a photo on a
 * white page), in decoded pixels (`channels` per pixel, the first three red, green, blue, on white where it was
 * transparent). The bars' colour is the top-left pixel's; a pixel is the picture's when it differs from that by more
 * than TRIM_THRESHOLD in any channel and most of its 3×3 neighbourhood does too, so a JPEG's noise in a bar doesn't
 * stop the trim. Null when there are no bars to take away, or when taking them would leave little (a flat graphic is
 * a flat graphic): what remains must keep 60% of the width and half the height. A few pixels more come off each
 * trimmed side, where a JPEG's edge between bar and picture rings and would leave a dark line.
 */
export function trimBars(data: ArrayLike<number>, width: number, height: number, channels: number): Box | null {
  const bg = [data[0], data[1], data[2]];
  const off = new Uint8Array(width * height);
  for (let i = 0, at = 0; i < off.length; i++, at += channels) {
    if (
      Math.abs(data[at] - bg[0]) > TRIM_THRESHOLD ||
      Math.abs(data[at + 1] - bg[1]) > TRIM_THRESHOLD ||
      Math.abs(data[at + 2] - bg[2]) > TRIM_THRESHOLD
    ) {
      off[i] = 1;
    }
  }
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!off[y * width + x]) continue;
      // Already inside the box found so far: nothing to learn from this pixel.
      if (x >= left && x <= right && y >= top && y <= bottom) continue;
      let near = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx >= 0 && xx < width && off[yy * width + xx]) near++;
        }
      }
      if (near < 5) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (right < 0) return null;
  const box = { left, top, width: right - left + 1, height: bottom - top + 1 };
  if ((box.width === width && box.height === height) || box.width < width * 0.6 || box.height < height * 0.5) return null;
  const cutX = box.width < width ? Math.max(2, Math.round(box.width * 0.008)) : 0;
  const cutY = box.height < height ? Math.max(2, Math.round(box.height * 0.008)) : 0;
  return { left: box.left + cutX, top: box.top + cutY, width: box.width - 2 * cutX, height: box.height - 2 * cutY };
}

/** What is wrong with a picture's size and shape (after any bars are trimmed) for a square card; null when nothing. */
export function shapeProblem(width: number, height: number): string | null {
  if (Math.min(width, height) < MIN_SIDE) return `is only ${width}×${height} (a card needs ${MIN_SIDE} pixels each way)`;
  if (width / height > 3.2 || height / width > 3.2) return `is ${width}×${height}: too narrow a strip for a square card`;
  return null;
}

/** The side of the small copy a picture is judged flat on (looksFlat). */
export const FLAT_SIDE = 64;

/**
 * Whether a picture looks like a logo, a placeholder or a blank rather than a photo: most of it one flat colour, with
 * no texture in it. Judged on a FLAT_SIDE×FLAT_SIDE copy (`channels` per pixel), where a photo's grain still shows
 * and a graphic's background is one colour. (A photo with a plain sky passes: its sky isn't most of it. Small logos
 * are caught by the size already.)
 */
export function looksFlat(data: ArrayLike<number>, w: number, h: number, c: number): boolean {
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

export const FLAT_PROBLEM = "looks like a logo or a placeholder, not a photo";

/** The problem reported for a picture none of whose candidates makes a card: the given address's own. */
export const pictureProblemText = (url: string, problem: string | null) => `picture ${url} ${problem ?? "isn't usable"}`;

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
