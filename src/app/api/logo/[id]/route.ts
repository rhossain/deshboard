import { getServedLogo } from "@/lib/logos";
import { getSource } from "@/lib/sources";

const CONTENT_TYPES: Record<string, string> = { webp: "image/webp", ico: "image/x-icon" };

/**
 * GET /api/logo/:sourceId — the source's logo (or icon) image, resized for the cards and cached
 * (see prepareLogo). 404 when none could be found; the UI then shows the name as text.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const source = getSource(id);
  const logo = source ? await getServedLogo(source) : null;
  if (!logo) {
    return new Response("No logo", { status: 404, headers: { "Cache-Control": "public, max-age=3600" } });
  }
  return new Response(new Uint8Array(logo.bytes), {
    headers: {
      "Content-Type": CONTENT_TYPES[logo.ext],
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
