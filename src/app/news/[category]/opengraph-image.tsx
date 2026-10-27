import { ogCard, OG_SIZE, OG_TYPE } from "@/lib/og-card";
import type { Category } from "@/lib/categories";
import { boardHeading, CATEGORY_PAGES } from "@/lib/site";
import { ACTIVE_SOURCES } from "@/lib/sources";

export const alt = "A Bartaboard section: Bangladesh news by topic";
export const size = OG_SIZE;
export const contentType = OG_TYPE;
// Rendered once at build time (static export).
export const dynamic = "force-static";

export function generateStaticParams() {
  return CATEGORY_PAGES.map((c) => ({ category: c.id }));
}

/** A section page's share picture: its heading, so a shared section looks like itself. */
export default async function Image({ params }: { params: Promise<{ category: Category }> }) {
  const { category } = await params;
  // Without the section's Bangla name in brackets: the renderer can't shape Bangla (src/lib/og-card.tsx).
  const headline = boardHeading(category).replace(/\s*\([^)]*\)$/, "");
  return ogCard({ headline, chips: [`${ACTIVE_SOURCES.length} news portals`, "Bangla & English", "Every 15 minutes"] });
}
