import { getVideos } from "@/lib/videos";

export const dynamic = "force-dynamic";

/**
 * GET /api/videos — the Videos view: TV news channels' YouTube videos from the last day (VideoFeed).
 *   ?refresh=1           fetch the channels now instead of serving the cached videos
 */
export async function GET(request: Request) {
  const force = new URL(request.url).searchParams.get("refresh") === "1";
  try {
    return Response.json(await getVideos({ force }), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
