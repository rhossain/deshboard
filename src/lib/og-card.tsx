import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { BARTA_GREEN } from "@/components/BartaboardLogo";

/** Every share image's size and type (the `size` and `contentType` exports of each opengraph-image file). */
export const OG_SIZE = { width: 1200, height: 630 };
export const OG_TYPE = "image/png";

/**
 * The fonts for the images as TTF (the renderer can't read WOFF2), from the repository (src/app/fonts/og,
 * see its README): nothing is fetched at build time, so a CDN outage can't fail a deploy.
 *
 * Latin text only. The renderer (Satori) lays glyphs out one by one without a shaping engine, and Bangla
 * needs one: with a Bangla font loaded, "খেলা" came out as "খলো" (the vowel signs in the wrong places). So
 * every image, the Bangla pages' included, says its line in English; the pages' own titles stay Bangla.
 */
const font = (file: string) => readFile(path.join(process.cwd(), "src/app/fonts/og", file));

let fonts: Promise<{ name: string; data: Buffer; weight: 500 | 700 }[]> | undefined;
function loadFonts() {
  return (fonts ??= Promise.all([
    font("sora-700-latin.ttf").then((data) => ({ name: "Sora", data, weight: 700 as const })),
    font("inter-700-latin.ttf").then((data) => ({ name: "Inter", data, weight: 700 as const })),
    font("inter-500-latin.ttf").then((data) => ({ name: "Inter", data, weight: 500 as const })),
  ]));
}

let icon: Promise<string> | undefined;
const loadIcon = () =>
  (icon ??= readFile(path.join(process.cwd(), "public/brand/bartaboard-icon-512.png")).then(
    (b) => `data:image/png;base64,${b.toString("base64")}`,
  ));

/**
 * An outlet's logo for its page's image, as a PNG data URL (the renderer can't read WebP), or null: for
 * a square icon too (as on the cards, only a wordmark-shaped logo is drawn; a small icon blown up looks worse than none).
 */
export async function logoDataUrl(id: string): Promise<{ src: string; width: number; height: number } | null> {
  try {
    const sharp = (await import("sharp")).default;
    const file = path.join(process.cwd(), "public/logos", `${id}.webp`);
    const { data, info } = await sharp(await readFile(file))
      .png()
      .toBuffer({ resolveWithObject: true });
    if (info.width / info.height < 1.8) return null;
    return { src: `data:image/png;base64,${data.toString("base64")}`, width: info.width, height: info.height };
  } catch {
    return null;
  }
}

/**
 * The preview shown when a Bartaboard link is shared (Facebook, WhatsApp, X, Slack…): the wordmark, then
 * the page's own line and a few chips (English, see above), so a shared section or outlet page looks like
 * itself. `logo` is an outlet's, drawn on a white plate beside the wordmark.
 */
export async function ogCard({
  headline,
  chips,
  logo,
}: {
  headline: string;
  chips: string[];
  logo?: { src: string; width: number; height: number } | null;
}): Promise<ImageResponse> {
  const [fonts, iconSrc] = await Promise.all([loadFonts(), loadIcon()]);
  // Long lines (an outlet's name and "latest news headlines") step down a size.
  const headlineSize = headline.length > 40 ? 44 : 52;
  // The logo is drawn no taller than 96 px, no wider than 420, keeping its shape.
  const logoScale = logo ? Math.min(96 / logo.height, 420 / logo.width, 1.5) : 0;

  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: "100%",
        height: "100%",
        padding: "72px 88px",
        background: "#f6f4ef",
        color: "#17191c",
        fontFamily: "Inter",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- drawn into a PNG, not a page */}
          <img src={iconSrc} width={logo ? 120 : 176} height={logo ? 120 : 176} alt="" />
          <div
            style={{
              display: "flex",
              fontFamily: "Sora",
              fontWeight: 700,
              fontSize: logo ? 92 : 132,
              letterSpacing: logo ? -4 : -6,
              lineHeight: 1,
            }}
          >
            <span style={{ color: BARTA_GREEN }}>barta</span>
            <span style={{ color: "#0f1720" }}>board</span>
          </div>
        </div>
        {logo && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 20,
              borderRadius: 24,
              background: "#ffffff",
              boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- drawn into a PNG, not a page */}
            <img src={logo.src} width={Math.round(logo.width * logoScale)} height={Math.round(logo.height * logoScale)} alt="" />
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <div style={{ fontSize: headlineSize, fontWeight: 700, letterSpacing: -1.5, lineHeight: 1.2 }}>{headline}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: 30, fontWeight: 500 }}>
          {chips.map((t) => (
            <span key={t} style={{ padding: "10px 22px", borderRadius: 999, background: "#e2f1ec", color: BARTA_GREEN }}>
              {t}
            </span>
          ))}
        </div>
      </div>
    </div>,
    { ...OG_SIZE, fonts },
  );
}
