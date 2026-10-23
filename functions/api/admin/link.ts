/**
 * GET /api/admin/link?url=…: whether a card's link still leads somewhere, for the admin page to flag a post whose
 * headline or video is gone (src/components/admin/links.ts). A Bartaboard share link is followed to what it shares,
 * as the deploy checks it before posting (src/lib/post-checks.ts articleProblem, videoProblem):
 *
 *   a headline (/s/<day>-<key>)  found in the share index, then its article at the outlet: 404 or 410 is gone
 *                                (past the index: its Bartaboard page, showing the headline or the "has left" card)
 *   a video (/s/youtu.be/<id>)   YouTube's oEmbed: private, deleted, or not playable on other sites
 *   any other link               fetched itself: 404 or 410 is gone
 *
 * Answers `{ dead: false }`, `{ dead: true, problem }` in the deploy's words, or `{ dead: false, problem }` when it
 * couldn't tell (the outlet didn't answer, or refused): only a clear "gone" counts. Only behind the admin's door.
 */
import { BROWSER_UA } from "../../../src/lib/card-picture-rules";
import { sharedId, sharedVideoId } from "../../../src/lib/share";
import { datesToSearch, findShared, type ShareLoader } from "../../../src/lib/share-lookup";
import { type AdminData, type Env, json } from "./_middleware";

const TIMEOUT_MS = 15_000;
const SITE = /^(www\.)?bartaboard\.com$/;
/**
 * The title of the site's own card, which a share link shows when it can't find its headline: post-checks.ts's, which
 * reads process.env and so can't be loaded here.
 */
const FALLBACK_TITLE = /every Bangladeshi headline, on one board|has left Bartaboard/i;

interface Verdict {
  dead: boolean;
  problem?: string;
  /** Where the link leads: the outlet's article or the video. */
  target?: string;
}

/** An article's or a page's answer: gone on 404 or 410; anything else passes (some outlets refuse Cloudflare). */
async function page(url: string, what: string): Promise<Verdict> {
  try {
    const res = await fetch(url, { headers: { "user-agent": BROWSER_UA }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    void res.body?.cancel();
    if (res.status === 404 || res.status === 410) return { dead: true, problem: `${what} is gone (${res.status})`, target: url };
    return res.ok ? { dead: false, target: url } : { dead: false, problem: `${what} answers ${res.status}: couldn't tell`, target: url };
  } catch (err) {
    return { dead: false, problem: `${what} didn't answer (${(err as Error).name}): couldn't tell`, target: url };
  }
}

/**
 * A headline the share index no longer has (past its 30 days) may still be in the share function's memory: its page
 * says whether the link still shows the headline, or the site's "has left Bartaboard" card.
 */
async function sharePage(link: string): Promise<Verdict> {
  try {
    const res = await fetch(link, { headers: { "user-agent": BROWSER_UA }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const title = /<title[^>]*>([^<]*)<\/title>/i.exec(await res.text())?.[1] ?? "";
    if (res.ok && !FALLBACK_TITLE.test(title)) return { dead: false, target: link };
    return { dead: true, problem: "Bartaboard no longer has this headline: its link shows “This headline has left Bartaboard”", target: link };
  } catch (err) {
    return { dead: false, problem: `its Bartaboard page didn't answer (${(err as Error).name}): couldn't tell`, target: link };
  }
}

async function video(id: string): Promise<Verdict> {
  const watch = `https://www.youtube.com/watch?v=${id}`;
  try {
    const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watch)}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    void res.body?.cancel();
    if (res.status === 401 || res.status === 403) return { dead: true, problem: "the video can't be played on other sites any more", target: watch };
    if (res.status === 400 || res.status === 404) return { dead: true, problem: "the video is private or deleted", target: watch };
    return { dead: false, target: watch };
  } catch {
    return { dead: false, problem: "YouTube didn't answer: couldn't tell", target: watch };
  }
}

// The static site (every Pages Function has it), for the share index.
export const onRequestGet: PagesFunction<Env & { ASSETS: Fetcher }, string, AdminData> = async ({ request, env }) => {
  let url: URL;
  try {
    url = new URL(new URL(request.url).searchParams.get("url") ?? "");
  } catch {
    return json({ dead: false, problem: "isn't a web address" }, 400);
  }
  if (!/^https?:$/.test(url.protocol)) return json({ dead: false, problem: "isn't a web address" }, 400);

  let verdict: Verdict;
  if (SITE.test(url.hostname) && url.pathname.startsWith("/s/")) {
    const segments = url.pathname.slice(3).replace(/\/$/, "").split("/");
    const videoId = sharedVideoId(segments);
    const shared = sharedId(segments);
    if (videoId) verdict = await video(videoId);
    else if (shared) {
      const load: ShareLoader = async (path) => {
        try {
          const res = await env.ASSETS.fetch(new URL(path, request.url));
          return res.ok ? await res.json() : null;
        } catch {
          return null;
        }
      };
      const found = await findShared(shared.key, datesToSearch(shared.date), load);
      verdict = found ? await page(found.item.link, `the article at ${found.item.sourceName}`) : await sharePage(url.href);
    } else verdict = await page(url.href, "the page");
  } else verdict = await page(url.href, "the page");

  return json(verdict, 200, { "cache-control": "private, max-age=600" });
};
