/**
 * The pictures of an Instagram post (scripts/post-instagram.ts): Instagram shows no link previews, so each headline
 * is drawn on a Bartaboard card of its own, 1080×1350 (4:5, the tallest Instagram keeps uncropped), as a JPEG (the
 * only picture format its API takes). A carousel starts with a cover (the heading and the day), then one card a
 * headline; a single post is the headline's card alone.
 *
 * Drawn with sharp: its text is set by Pango with HarfBuzz, which joins Bangla's conjuncts and vowel signs properly
 * (the image renderer Next uses for the site's preview doesn't), and wraps the lines. The font is the site's own,
 * Noto Sans Bengali (its Latin letters too, so the cards look the same wherever they are drawn), from assets/fonts
 * (SIL Open Font License, assets/fonts/OFL.txt).
 *
 * Node only (the deploy's posting step); nothing here runs at the edge.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import sharp, { type OverlayOptions } from "sharp";
import type { SlideCard, SlideSet } from "./instagram-post";

export type { SlideCard, SlideSet };

export const WIDTH = 1080;
export const HEIGHT = 1350;
/** Changing how the cards look changes this, so cards drawn before aren't reused (see slidesKey). */
export const DESIGN = 2;
const MAX_HEADLINES = 9;

const COLORS = {
  paper: "#f6f4ef",
  ink: "#17191c",
  muted: "#63666c",
  green: "#006a4e",
  greenSoft: "#e5f1eb",
  line: "#e3dfd5",
  white: "#ffffff",
  gold: "#c99a3d",
};

const MARGIN = 84;
const INNER = WIDTH - 2 * MARGIN;

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
const bn = (n: number | string) => String(n).replace(/\d/g, (d) => BN_DIGITS[+d]);
const BN_MONTHS = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"];
const BN_DAYS = ["রবিবার", "সোমবার", "মঙ্গলবার", "বুধবার", "বৃহস্পতিবার", "শুক্রবার", "শনিবার"];
const DHAKA_OFFSET_MS = 6 * 3600_000;

/** "মঙ্গলবার, ২০ অক্টোবর ২০২৬", Dhaka's day. */
export function bnDate(at: number): string {
  const d = new Date(at + DHAKA_OFFSET_MS);
  return `${BN_DAYS[d.getUTCDay()]}, ${bn(d.getUTCDate())} ${BN_MONTHS[d.getUTCMonth()]} ${bn(d.getUTCFullYear())}`;
}

/** The fonts and logos, from the repository. */
export interface CardAssets {
  bold: string;
  medium: string;
  /** The wordmark for light and dark backgrounds (PNG). */
  logoLight: Buffer;
  logoDark: Buffer;
}

export function cardAssets(root = process.cwd()): CardAssets {
  const font = (f: string) => path.join(root, "assets", "fonts", f);
  return {
    bold: font("NotoSansBengali-Bold.ttf"),
    medium: font("NotoSansBengali-Medium.ttf"),
    logoLight: readFileSync(path.join(root, "public", "brand", "bartaboard-logo-light.png")),
    logoDark: readFileSync(path.join(root, "public", "brand", "bartaboard-logo-dark.png")),
  };
}

/** The same cards drawn the same way have the same key: what their pictures are stored and found under. */
export function slidesKey(set: SlideSet): string {
  const day = bnDate(set.at);
  return createHash("sha256")
    .update(JSON.stringify([DESIGN, set.cards.length > 1 ? set.heading : "", day, set.cards]))
    .digest("hex")
    .slice(0, 24);
}

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

interface TextOpts {
  size: number;
  color: string;
  weight: "bold" | "medium";
  width?: number;
  /** Line height as a multiple of the size. */
  leading?: number;
  align?: "left" | "centre" | "right";
}

interface Drawn {
  input: Buffer;
  width: number;
  height: number;
}

/** A block of text, wrapped to `width`, as a transparent PNG. */
async function text(a: CardAssets, content: string, o: TextOpts): Promise<Drawn> {
  const family = o.weight === "bold" ? "Noto Sans Bengali Bold" : "Noto Sans Bengali Medium";
  const file = o.weight === "bold" ? a.bold : a.medium;
  const markup = `<span foreground="${o.color}">${escape(content)}</span>`;
  const { data, info } = await sharp({
    text: {
      text: markup,
      font: `${family} ${o.size}`,
      fontfile: file,
      width: o.width ?? INNER,
      dpi: 72,
      rgba: true,
      align: o.align ?? "left",
      wrap: "word",
      spacing: Math.round(o.size * ((o.leading ?? 1.3) - 1)),
    },
  })
    .png()
    .toBuffer({ resolveWithObject: true });
  return { input: data, width: info.width, height: info.height };
}

/** The largest size from `sizes` at which the text fits in `maxHeight`; the smallest otherwise. */
async function fitted(a: CardAssets, content: string, sizes: number[], maxHeight: number, o: Omit<TextOpts, "size">): Promise<Drawn> {
  let last: Drawn | null = null;
  for (const size of sizes) {
    last = await text(a, content, { ...o, size });
    if (last.height <= maxHeight) return last;
  }
  return last!;
}

async function logo(png: Buffer, width: number): Promise<Drawn> {
  const input = await sharp(png).resize({ width }).png().toBuffer();
  const { height = 0 } = await sharp(input).metadata();
  return { input, width, height };
}

const rect = (w: number, h: number, fill: string, radius = 0) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${radius}" fill="${fill}"/></svg>`);

type Layer = OverlayOptions;

async function jpeg(background: string, layers: Layer[]): Promise<Buffer> {
  return sharp({ create: { width: WIDTH, height: HEIGHT, channels: 3, background } })
    .composite(layers)
    .jpeg({ quality: 88, mozjpeg: true, chromaSubsampling: "4:4:4" })
    .toBuffer();
}

/** The cover: green, the logo, the heading, the day, and the headlines to come in a numbered list. */
async function cover(a: CardAssets, set: SlideSet): Promise<Buffer> {
  const layers: Layer[] = [];
  // The wordmark's green doesn't show on green: it sits on a white tab.
  const mark = await logo(a.logoLight, 340);
  layers.push({ input: rect(mark.width + 64, mark.height + 44, COLORS.white, 22), left: MARGIN - 32, top: 96 - 22 });
  layers.push({ input: mark.input, left: MARGIN, top: 96 });
  let y = 96 + mark.height + 130;
  const heading = await fitted(a, set.heading, [104, 96, 88, 80], 300, { weight: "bold", color: COLORS.white, leading: 1.2 });
  layers.push({ input: heading.input, left: MARGIN, top: y });
  y += heading.height + 28;
  const date = await text(a, bnDate(set.at), { size: 40, weight: "medium", color: "#cfe6dc" });
  layers.push({ input: date.input, left: MARGIN, top: y });
  y += date.height + 72;
  layers.push({ input: rect(INNER, 3, "#2f8a6e"), left: MARGIN, top: y });
  y += 56;
  // The headlines, one line each where they fit, numbered as the carousel has them.
  const room = HEIGHT - 190 - y;
  const each = Math.floor(room / set.cards.length);
  const size = each >= 96 ? 38 : each >= 80 ? 34 : 30;
  for (const [i, c] of set.cards.entries()) {
    const num = await text(a, `${bn(i + 1)}`, { size, weight: "bold", color: COLORS.gold, width: 60 });
    layers.push({ input: num.input, left: MARGIN, top: y });
    const line = await text(a, short(c.title, 70), { size, weight: "medium", color: COLORS.white, width: INNER - 64, leading: 1.25 });
    // At most two lines for each.
    const h = Math.min(line.height, Math.round(size * 1.25 * 2) + 4);
    layers.push({ input: await sharp(line.input).extract({ left: 0, top: 0, width: line.width, height: h }).toBuffer(), left: MARGIN + 64, top: y });
    y += Math.max(h, num.height) + 26;
    if (y > HEIGHT - 200) break;
  }
  const swipe = await text(a, "সোয়াইপ করে পড়ুন  →", { size: 36, weight: "bold", color: COLORS.white });
  layers.push({ input: swipe.input, left: WIDTH - MARGIN - swipe.width, top: HEIGHT - 84 - swipe.height });
  const site = await text(a, "bartaboard.com", { size: 34, weight: "medium", color: "#cfe6dc" });
  layers.push({ input: site.input, left: MARGIN, top: HEIGHT - 84 - site.height });
  return jpeg(COLORS.green, layers);
}

/** A headline on its own card: its section, the headline large, its outlet, and where to read on. */
async function headlineCard(a: CardAssets, c: SlideCard, at: number, place: { n: number; of: number } | null): Promise<Buffer> {
  const layers: Layer[] = [];
  // A green band down the left edge, and the logo.
  layers.push({ input: rect(18, HEIGHT, COLORS.green), left: 0, top: 0 });
  const mark = await logo(a.logoLight, 300);
  layers.push({ input: mark.input, left: MARGIN, top: 92 });
  if (place) {
    const count = await text(a, `${bn(place.n)}/${bn(place.of)}`, { size: 36, weight: "bold", color: COLORS.muted });
    layers.push({ input: count.input, left: WIDTH - MARGIN - count.width, top: 92 + Math.round((mark.height - count.height) / 2) });
  }
  // The story: its section, the headline as large as fits, its outlet; centred between the logo and the footer.
  const footerTop = HEIGHT - 280;
  const top = 92 + mark.height + 90;
  const bottom = footerTop - 60;
  const label = c.section ? await text(a, c.section, { size: 32, weight: "bold", color: COLORS.green, width: INNER }) : null;
  const pill = label ? { w: label.width + 56, h: label.height + 22 } : null;
  const source = await text(a, c.source, { size: 42, weight: "bold", color: COLORS.green });
  const more = c.outlets && c.outlets > 1 ? await text(a, `আরও ${bn(c.outlets - 1)}টি সংবাদমাধ্যমেও এই খবর`, { size: 32, weight: "medium", color: COLORS.muted }) : null;
  const below = 48 + 6 + 34 + source.height + (more ? 10 + more.height : 0);
  const above = pill ? pill.h + 48 : 0;
  const headline = await fitted(a, c.title, [100, 92, 84, 78, 72, 66, 60, 54, 48], bottom - top - above - below, { weight: "bold", color: COLORS.ink, leading: 1.2 });
  let y = top + Math.max(0, Math.round((bottom - top - (above + headline.height + below)) / 2.4));
  if (label && pill) {
    layers.push({ input: rect(pill.w, pill.h, COLORS.greenSoft, pill.h / 2), left: MARGIN, top: y });
    layers.push({ input: label.input, left: MARGIN + 28, top: y + 11 });
    y += pill.h + 48;
  }
  layers.push({ input: headline.input, left: MARGIN, top: y });
  y += headline.height + 48;
  layers.push({ input: rect(72, 6, COLORS.green, 3), left: MARGIN, top: y });
  y += 6 + 34;
  layers.push({ input: source.input, left: MARGIN, top: y });
  y += source.height + 10;
  if (more) layers.push({ input: more.input, left: MARGIN, top: y });
  // The footer: the day and time, and where the story is in full.
  layers.push({ input: rect(INNER, 2, COLORS.line), left: MARGIN, top: footerTop });
  const when = await text(a, bnDate(at), { size: 30, weight: "medium", color: COLORS.muted });
  layers.push({ input: when.input, left: MARGIN, top: footerTop + 40 });
  const read = await text(a, "সব সংবাদমাধ্যমের খবর এক জায়গায়", { size: 32, weight: "bold", color: COLORS.ink });
  layers.push({ input: read.input, left: MARGIN, top: footerTop + 40 + when.height + 16 });
  const site = await text(a, "bartaboard.com  ·  লিংক বায়োতে", { size: 32, weight: "bold", color: COLORS.green });
  layers.push({ input: site.input, left: MARGIN, top: footerTop + 40 + when.height + 16 + read.height + 6 });
  return jpeg(COLORS.paper, layers);
}

/** A title cut to about `max` characters at a space, with an ellipsis. */
function short(title: string, max: number): string {
  if (title.length <= max) return title;
  const cut = title.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trim()}…`;
}

/** The post's pictures, in order: a carousel's cover and cards, or a single headline's card. */
export async function renderSlides(set: SlideSet, a: CardAssets = cardAssets()): Promise<Buffer[]> {
  const cards = set.cards.slice(0, MAX_HEADLINES);
  if (cards.length === 1) return [await headlineCard(a, cards[0], set.at, null)];
  return [await cover(a, { ...set, cards }), ...(await Promise.all(cards.map((c, i) => headlineCard(a, c, set.at, { n: i + 1, of: cards.length }))))];
}
