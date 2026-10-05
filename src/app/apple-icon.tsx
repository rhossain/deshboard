import { ImageResponse } from "next/og";
import { BRAND_GREEN, LogoMark } from "@/components/Logo";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";
// Rendered once at build time (static export).
export const dynamic = "force-static";

// Home-screen icon: the mark on a full-bleed green square (iOS rounds the corners itself).
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: BRAND_GREEN }}>
        <LogoMark size={180} />
      </div>
    ),
    size,
  );
}
