import { getLogo } from "@/lib/logos";
import { getSource } from "@/lib/sources";

/**
 * GET /api/logo/:sourceId — the source's logo (or icon) image, proxied and
 * cached. 404 when none could be found; the UI then shows the name as text.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const source = getSource(id);
  const logo = source ? await getLogo(source) : null;
  if (!logo) {
    return new Response("No logo", { status: 404, headers: { "Cache-Control": "public, max-age=3600" } });
  }
  return new Response(logo.bytes, {
    headers: {
      "Content-Type": logo.contentType,
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
      // Third-party SVGs are served from our origin: never let them run scripts if opened directly.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
