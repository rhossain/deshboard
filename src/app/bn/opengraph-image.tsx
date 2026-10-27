// The same picture as the English page's: the renderer can't shape Bangla (see src/lib/og-card.tsx).
import { ogCard, OG_SIZE, OG_TYPE } from "@/lib/og-card";
import { ACTIVE_SOURCES } from "@/lib/sources";

export const alt = "Bartaboard: every Bangladeshi headline on one board";
export const size = OG_SIZE;
export const contentType = OG_TYPE;
// Rendered once at build time (static export).
export const dynamic = "force-static";

/** The board's share picture (src/lib/og-card.tsx draws every page's). */
export default function Image() {
  return ogCard({
    headline: "Every Bangladeshi headline, on one board.",
    chips: [`${ACTIVE_SOURCES.length} news portals`, "Bangla & English", "Top stories across outlets"],
  });
}
