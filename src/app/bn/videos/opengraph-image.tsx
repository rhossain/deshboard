// The same picture as the English page's: the renderer can't shape Bangla (see src/lib/og-card.tsx).
import { ogCard, OG_SIZE, OG_TYPE } from "@/lib/og-card";
import { CHANNELS } from "@/lib/channels";
import { boardHeading } from "@/lib/site";

export const alt = "Bangladesh TV news videos today, on Bartaboard";
export const size = OG_SIZE;
export const contentType = OG_TYPE;
// Rendered once at build time (static export).
export const dynamic = "force-static";

export default function Image() {
  return ogCard({ headline: boardHeading("", true), chips: [`${CHANNELS.length} TV channels`, "On YouTube", "Newest first"] });
}
