// The same picture as the English page's: the renderer can't shape Bangla (see src/lib/og-card.tsx).
import { ogCard, OG_SIZE, OG_TYPE } from "@/lib/og-card";
import { ABOUT_TITLE } from "@/lib/site";

export const alt = ABOUT_TITLE;
export const size = OG_SIZE;
export const contentType = OG_TYPE;
// Rendered once at build time (static export).
export const dynamic = "force-static";

export default function Image() {
  return ogCard({ headline: ABOUT_TITLE, chips: ["Free", "No account needed", "Every 15 minutes"] });
}
