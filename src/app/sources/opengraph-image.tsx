import { ogCard, OG_SIZE, OG_TYPE } from "@/lib/og-card";
import { CHANNELS } from "@/lib/channels";
import { ACTIVE_SOURCES } from "@/lib/sources";

export const alt = "All Bangladesh newspapers and news sites, on Bartaboard";
export const size = OG_SIZE;
export const contentType = OG_TYPE;
// Rendered once at build time (static export).
export const dynamic = "force-static";

export default function Image() {
  return ogCard({
    headline: "All Bangladesh newspapers and news sites",
    chips: [`${ACTIVE_SOURCES.length} news sites`, `${CHANNELS.length} TV channels`, "Bangla & English"],
  });
}
