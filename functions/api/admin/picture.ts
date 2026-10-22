/**
 * GET /api/admin/picture?url=…: an outlet's picture, fetched as the deploy fetches it (as a browser, then as Facebook's
 * crawler if refused; no referrer), for the admin page to look at its pixels as a card is picked
 * (src/components/admin/pictures.ts checkCardPicture). The browser can't read another site's pixels itself, and some
 * outlets answer the deploy differently from a reader's browser.
 *
 * Only behind the admin's door (_middleware.ts). Answers the picture's bytes, or 502 with `{ problem }` in the deploy's
 * words ("answers 403", "is only 512 bytes") when it can't be had.
 */
import { BROWSER_UA, bytesProblem, CRAWLER_UA, MAX_BYTES } from "../../../src/lib/card-picture-rules";
import { type Handler, json } from "./_middleware";

const TIMEOUT_MS = 20_000;

async function fetchAs(url: string, agent: string): Promise<Response | { problem: string }> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": agent, accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.5" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      void res.body?.cancel();
      return { problem: `answers ${res.status}` };
    }
    return res;
  } catch (err) {
    return { problem: `didn't load (${(err as Error).name})` };
  }
}

export const onRequestGet: Handler = async ({ request }) => {
  const url = new URL(request.url).searchParams.get("url") ?? "";
  if (!/^https?:\/\//.test(url)) return json({ problem: "isn't a web address" }, 400);
  let got = await fetchAs(url, BROWSER_UA);
  if (!(got instanceof Response) && /^answers 4\d\d$/.test(got.problem) && got.problem !== "answers 404") {
    const second = await fetchAs(url, CRAWLER_UA);
    if (second instanceof Response) got = second;
  }
  if (!(got instanceof Response)) return json(got, 502);
  const length = Number(got.headers.get("content-length"));
  if (length > MAX_BYTES) {
    void got.body?.cancel();
    return json({ problem: `is ${Math.round(length / 1e6)} MB` }, 502);
  }
  const bytes = await got.arrayBuffer();
  const size = bytesProblem(bytes.byteLength);
  if (size) return json({ problem: size }, 502);
  const type = got.headers.get("content-type") ?? "";
  return new Response(bytes, {
    headers: {
      // Never served as anything but a picture, whatever the outlet says it is.
      "content-type": type.startsWith("image/") ? type : "application/octet-stream",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "cache-control": "private, max-age=600",
    },
  });
};
