import { readDay } from "@/lib/days";

/**
 * GET /data/days/<date>.json — every headline of one Dhaka day in the last 30 (see days.ts): what the
 * search reads once it runs past the board. The same address as the static site's files.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const body = readDay(file.replace(/\.json$/, ""));
  // Other sites' titles, for the search to read, not a page for search engines.
  const headers = { "Cache-Control": "public, max-age=300", "X-Robots-Tag": "noindex" };
  if (!body) return new Response("No such day", { status: 404, headers });
  return new Response(body, { headers: { ...headers, "Content-Type": "application/json; charset=utf-8" } });
}
