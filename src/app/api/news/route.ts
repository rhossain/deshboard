import { getNews, newsQueryFrom } from "@/lib/news";

export const dynamic = "force-dynamic";

/**
 * GET /api/news
 *   ?lang=bn|en          only Bangla or English sources
 *   ?source=id1,id2      only these sources
 *   ?refresh=1           bypass the in-memory cache
 */
export async function GET(request: Request) {
  const data = await getNews(newsQueryFrom(request.url));
  return Response.json(data, { headers: { "Cache-Control": "no-store" } });
}
