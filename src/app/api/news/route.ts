import { getNews } from "@/lib/news";

export const dynamic = "force-dynamic";

/**
 * GET /api/news
 *   ?lang=bn|en          only Bangla or English sources
 *   ?source=id1,id2      only these sources
 *   ?refresh=1           bypass the in-memory cache
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lang = searchParams.get("lang");
  const source = searchParams.get("source");

  const data = await getNews({
    lang: lang === "bn" || lang === "en" ? lang : undefined,
    sourceIds: source ? source.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
    force: searchParams.get("refresh") === "1",
  });

  return Response.json(data, { headers: { "Cache-Control": "no-store" } });
}
