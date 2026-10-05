import { ImageResponse } from "next/og";
import { BRAND_GREEN, LogoMark } from "@/components/Logo";
import { ACTIVE_SOURCES } from "@/lib/sources";

export const alt = "Deshboard: every Bangladeshi headline on one board";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
// Rendered once at build time (static export).
export const dynamic = "force-static";

const FONT_CDN = "https://cdn.jsdelivr.net/fontsource/fonts";

/** One of the site's fonts as TTF (the image renderer can't read WOFF2); null if unreachable. */
async function loadFont(file: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(`${FONT_CDN}/${file}`);
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

// The preview shown when a Deshboard link is shared (Facebook, WhatsApp, X, Slack…), rendered at
// build time. Without the fonts it falls back to the renderer's built-in one. Latin text only:
// these fonts have no Bangla glyphs.
export default async function OpengraphImage() {
  const [fraunces, inter, interMedium] = await Promise.all([
    loadFont("fraunces@latest/latin-600-normal.ttf"),
    loadFont("inter@latest/latin-700-normal.ttf"),
    loadFont("inter@latest/latin-500-normal.ttf"),
  ]);
  const fonts = [
    fraunces && { name: "Fraunces", data: fraunces, weight: 600 as const },
    inter && { name: "Inter", data: inter, weight: 700 as const },
    interMedium && { name: "Inter", data: interMedium, weight: 500 as const },
  ].filter((f) => !!f);

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
      <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
        <LogoMark size={128} />
        <div style={{ display: "flex", alignItems: "baseline", fontSize: 128, lineHeight: 1 }}>
          <span style={{ fontFamily: "Fraunces", fontWeight: 600, letterSpacing: -3, color: BRAND_GREEN }}>Desh</span>
          <span style={{ fontWeight: 700, letterSpacing: -6 }}>board</span>
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
              style={{ padding: "10px 22px", borderRadius: 999, background: "#e5f1eb", color: BRAND_GREEN }}
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
