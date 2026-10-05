import { eachSourceNews, newsQueryFrom } from "@/lib/news";
import type { NewsStreamMessage } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/news/stream — same query params as /api/news, but responds with
 * NDJSON: one `{ type: "source", result }` line per source as soon as it is
 * fetched, then `{ type: "done", generatedAt }`.
 */
export async function GET(request: Request) {
  const query = newsQueryFrom(request.url);
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (msg: NewsStreamMessage) => {
        if (!closed) controller.enqueue(encoder.encode(JSON.stringify(msg) + "\n"));
      };
      try {
        await eachSourceNews(query, (result) => send({ type: "source", result }));
        send({ type: "done", generatedAt: new Date().toISOString() });
      } finally {
        if (!closed) controller.close();
        closed = true;
      }
    },
    // Client went away: stop writing. Fetches already running still finish and fill the cache.
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Accel-Buffering": "no",
    },
  });
}
