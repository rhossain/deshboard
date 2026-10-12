import type { Category } from "@/lib/categories";
import { cachedSeed } from "@/lib/feed";
import { CATEGORY_PAGES } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * GET /api/news/head — every source's newest cached headlines (a full card each) with the whole
 * cache's counts and headline ages, which the board reads in place of the stream until it needs more.
 *   ?category=id         only this section's headlines, for its page
 * Never fetches: 503 while nothing is cached yet.
 */
export async function GET(request: Request) {
  const param = new URL(request.url).searchParams.get("category");
  const category = CATEGORY_PAGES.find((c) => c.id === param)?.id as Category | undefined;
  if (param && !category) return Response.json({ error: "unknown category" }, { status: 400 });
  const head = cachedSeed(category, Infinity);
  if (!head) return Response.json({ error: "nothing cached yet" }, { status: 503 });
  return Response.json(head, { headers: { "Cache-Control": "no-store" } });
}
