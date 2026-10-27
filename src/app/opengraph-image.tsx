import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { BARTA_GREEN } from "@/components/BartaboardLogo";
import { ACTIVE_SOURCES } from "@/lib/sources";

export const alt = "Bartaboard: every Bangladeshi headline on one board";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
// Rendered once at build time (static export).
export const dynamic = "force-static";

/**
 * The fonts for the image as TTF (the renderer can't read WOFF2), from the repository (src/app/fonts/og,
 * Fontsource's latin files): nothing is fetched at build time, so a CDN outage can't fail a deploy.
 * Latin text only: these have no Bangla glyphs.
 */
const font = (file: string) => readFile(path.join(process.cwd(), "src/app/fonts/og", file));

// The preview shown when a Bartaboard link is shared (Facebook, WhatsApp, X, Slack…), rendered at build time.
export default async function OpengraphImage() {
  const [icon, sora, inter, interMedium] = await Promise.all([
    readFile(path.join(process.cwd(), "public/brand/bartaboard-icon-512.png")),
    font("sora-700-latin.ttf"),
    font("inter-700-latin.ttf"),
    font("inter-500-latin.ttf"),
  ]);
  const fonts = [
    { name: "Sora", data: sora, weight: 700 as const },
    { name: "Inter", data: inter, weight: 700 as const },
    { name: "Inter", data: interMedium, weight: 500 as const },
  ];

  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: "100%",
        height: "100%",
        padding: "80px 88px",
        background: "#f6f4ef",
        color: "#17191c",
        fontFamily: "Inter",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <img src={`data:image/png;base64,${icon.toString("base64")}`} width={176} height={176} alt="" />
        <div
          style={{ display: "flex", fontFamily: "Sora", fontWeight: 700, fontSize: 132, letterSpacing: -6, lineHeight: 1 }}
        >
          <span style={{ color: BARTA_GREEN }}>barta</span>
          <span style={{ color: "#0f1720" }}>board</span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <div style={{ fontSize: 52, fontWeight: 700, letterSpacing: -1.5, lineHeight: 1.2 }}>
          Every Bangladeshi headline, on one board.
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: 30, fontWeight: 500 }}>
          {[`${ACTIVE_SOURCES.length} news portals`, "Bangla & English", "Top stories across outlets"].map((t) => (
            <span
              key={t}
              style={{ padding: "10px 22px", borderRadius: 999, background: "#e2f1ec", color: BARTA_GREEN }}
            >
              {t}
            </span>
          ))}
        </div>
      </div>
    </div>,
    { ...size, fonts },
  );
}
