import { readDay } from "@/lib/days";

/**
 * GET /data/days/<date>.json — every headline of one Dhaka day in the last 30 (see days.ts): what the
 * search reads once it runs past the board. The same address as the static site's files.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const body = readDay(file.replace(/\.json$/, ""));
  if (!body) return new Response("No such day", { status: 404, headers: { "Cache-Control": "public, max-age=300" } });
  return new Response(body, {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=300" },
  });
}
