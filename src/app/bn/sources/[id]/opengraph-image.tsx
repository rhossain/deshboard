// The same picture as the English page's: the renderer can't shape Bangla (see src/lib/og-card.tsx).
import { ogCard, OG_SIZE, OG_TYPE } from "@/lib/og-card";
import { outletParams } from "@/components/pages/OutletPage";
import { OUTLETS } from "@/lib/directory";
import { logoDataUrl } from "@/lib/og-card";
import { outletHeading } from "@/lib/site";

export const alt = "A newspaper or channel on Bartaboard: its latest headlines";
export const size = OG_SIZE;
export const contentType = OG_TYPE;
// Rendered once at build time (static export).
export const dynamic = "force-static";

export function generateStaticParams() {
  return outletParams();
}

/** An outlet page's share picture: its logo beside the wordmark, and what the page is. */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const o = OUTLETS.find((x) => x.id === id)!;
  // In English words (the site's own "বাংলা" label can't be drawn, see og-card.tsx).
  const what = o.source ? `${o.source.kind} · ${o.source.lang === "bn" ? "Bangla" : "English"}` : "TV channel on YouTube";
  return ogCard({ headline: outletHeading(o), chips: [what, "Updated every 15 minutes"], logo: await logoDataUrl(id) });
}
