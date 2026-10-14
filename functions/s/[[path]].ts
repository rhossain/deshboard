/**
 * Shared links on bartaboard.com (`/s/…`), answered at Cloudflare's edge before the page is sent. The
 * rest of the site is static files; only this runs code (Cloudflare Pages Functions, uploaded with
 * the site by `wrangler pages deploy`, see .github/workflows/deploy.yml).
 *
 * Link previews (Facebook, WhatsApp, X, Telegram…) are built from the page's HTML without running its
 * scripts, so the shared headline's title, outlet and picture have to be in that HTML. This finds the
 * headline or video, writes them into the share page's <head> (title, description, Open Graph and X
 * tags) and into the page itself (`#share-data`, which SharedHeadline reads instead of looking it up).
 *
 * A link is resolved, in order, from:
 *   1. memory: every link resolved before (the SHARES KV namespace when bound, else the edge cache for a day)
 *   2. the share index (share-lookup.ts): the last 30 days' headlines and the last day's videos
 *   3. the outlet: the article's own title, picture and date, read from its page (old long links only)
 *   4. the address: a title made from the link's slug, when the outlet won't answer
 * and its picture from the article's og:image (YouTube's thumbnail for a video). Crawlers wait a few
 * seconds for the picture; a reader's page is sent at once and asks for it (`?image`, answered as JSON).
 * Each response says how the picture went in `x-share-image` (found, pending, timeout, http-403…).
 */
import { CATEGORIES } from "../../src/lib/categories";
import { channelName as bnChannelName, sourceName as bnSourceName } from "../../src/lib/bn-names";
import { articleUrl, sharedId, sharedVideoId, shareKey } from "../../src/lib/share";
import {
  BOARD_SHARD_DIR,
  datesToSearch,
  findShared,
  findSharedVideo,
  logosFor,
  SHARE_DIR,
  type ShareData,
  type ShareLoader,
  type ShareMeta,
} from "../../src/lib/share-lookup";
import { outletHead, slugTitle } from "../../src/lib/outlet-head";
import type { NewsItem, NewsSource } from "../../src/lib/types";

interface Env {
  /** The static site. */
  ASSETS: Fetcher;
  /** Optional KV namespace: links resolved before, kept for good (see docs/services.md). */
  SHARES?: KVNamespace;
}

/** A resolved link, as remembered. `image` is undefined until looked for, null when there is none. */
interface Resolved {
  data: ShareData;
  image?: string | null;
  /** When `image` was last looked for and not found (ms): it is looked for again an hour later. */
  imageMissedAt?: number;
  /** Made from the address alone (layer 4): kept for a day only, so a later look can do better. */
  partial?: boolean;
}

const DAY_MS = 86_400_000;
const DHAKA_OFFSET_MS = 6 * 3600_000;
/** Days a long link (with no day in it) is looked for in, besides the board's: the cache's 72 hours. */
const RECENT_DAYS = 4;
/** How long an old long link waits for the outlet's page (its title) before falling back to the address. */
const OUTLET_TIMEOUT_MS = 4000;
/**
 * How long the outlet's page is waited for when looking for the picture. Some outlets take several
 * seconds (Banglanews24 about 8); the reader's page is already showing by then.
 */
const IMAGE_TIMEOUT_MS = 10_000;
/** How long a crawler waits for the picture before the preview goes out with the site's own. */
const CRAWLER_WAIT_MS = 4000;
/** A picture not found (the outlet was slow, or refused) is looked for again after this long. */
const IMAGE_RETRY_MS = 3600_000;

/** Link-preview and search crawlers: they read the tags only, so they get the picture before the page is sent. */
const CRAWLER =
  /facebookexternalhit|facebookcatalog|facebot|meta-externalagent|whatsapp|twitterbot|telegrambot|slackbot|linkedinbot|discordbot|pinterest|redditbot|applebot|googlebot|bingbot|yandex|embedly|skypeuripreview|vkshare|viber|line\/|iframely|snapchat|mastodon|bluesky|zalo|kakaotalk|google-inspectiontool|duckduckbot/i;

const dhakaDay = (t: number) => new Date(t + DHAKA_OFFSET_MS).toISOString().slice(0, 10);
const hasBangla = (text: string) => /[ঀ-৿]/.test(text);

export const onRequestGet: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  const url = new URL(request.url);
  const segments = url.pathname.slice(3).replace(/\/$/, "").split("/");
  const crawler = CRAWLER.test(request.headers.get("user-agent") ?? "");

  const load: ShareLoader = async (path) => {
    try {
      const res = await env.ASSETS.fetch(new URL(path, url));
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    }
  };

  const videoId = sharedVideoId(segments);
  if (videoId) {
    const memo = `v:${videoId}`;
    let resolved = await recall(env, url, memo);
    const remembered = !!resolved;
    if (!resolved) {
      const data = (await findSharedVideo(videoId, load)) ?? (await fromOEmbed(videoId));
      // Private or deleted: YouTube says so better than we can.
      if (!data) return Response.redirect(`https://www.youtube.com/watch?v=${videoId}`, 302);
      resolved = { data, image: await videoThumbnail(videoId) };
    }
    if (!remembered) waitUntil(remember(env, url, memo, resolved));
    return render(env, url, resolved, `/s/youtu.be/${videoId}`);
  }

  const id = sharedId(segments);
  let key: string;
  let dirs: string[];
  let article: { url: URL; source: NewsSource } | null = null;
  if (id) {
    key = id.key;
    dirs = datesToSearch(id.date);
  } else {
    article = articleUrl(segments);
    // Not an outlet on the board: a share link never sends readers to other sites.
    if (!article) return Response.redirect(new URL("/", url).href, 302);
    key = shareKey(article.url.href);
    dirs = [BOARD_SHARD_DIR, ...Array.from({ length: RECENT_DAYS }, (_, i) => dhakaDay(Date.now() - i * DAY_MS))];
  }

  const memo = `h:${key}`;
  let resolved = await recall(env, url, memo);
  let changed = !resolved;
  // A short link is offered only for what the index or KV keeps; else the link stays as it was asked for.
  let lasting = !!resolved && !!env.SHARES;
  if (!resolved) {
    const found = await findShared(key, dirs, load);
    if (found) resolved = { data: found };
    else if (article) resolved = await fromOutlet(article, load);
    lasting = !!found || (!!env.SHARES && !resolved?.partial);
  }
  if (!resolved) return render(env, url, { data: { kind: "gone" } }, url.pathname);

  // The article's picture, from the outlet's page. A reader's page is sent at once, without it, and
  // asks (`?image`), which waits for the outlet; a crawler waits a few seconds. Either way the lookup
  // runs to the end and is remembered.
  const data = resolved.data;
  const askedForImage = url.searchParams.has("image");
  let imageNote = resolved.image ? "known" : resolved.image === null ? "none-remembered" : "";
  if (data.kind === "headline" && needsImage(resolved)) {
    imageNote = "pending";
    if (askedForImage || crawler) {
      let why = "none";
      const base: Resolved = resolved;
      const lookup = outletHead(data.item.link, IMAGE_TIMEOUT_MS, (reason) => (why = reason)).then((head): Resolved => {
        const image = head?.image ?? null;
        return image ? { ...base, image, imageMissedAt: undefined } : { ...base, image: null, imageMissedAt: Date.now() };
      });
      waitUntil(lookup.then((r) => remember(env, url, memo, r)));
      changed = false;
      const found = askedForImage ? await lookup : await Promise.race([lookup, sleep(CRAWLER_WAIT_MS)]);
      if (found) {
        resolved = found;
        imageNote = found.image ? "found" : why;
      }
    }
  }
  if (changed) waitUntil(remember(env, url, memo, resolved));

  if (askedForImage) {
    const image = resolved.data.kind === "headline" ? (resolved.image ?? null) : null;
    return Response.json(
      { image },
      {
        headers: {
          "cache-control": image ? "public, max-age=86400" : "no-store",
          "x-robots-tag": "noindex",
          "x-share-image": imageNote,
        },
      },
    );
  }
  const canonical = data.kind === "headline" && lasting ? shortPath(data.item) : url.pathname;
  const res = await render(env, url, resolved, canonical, imageNote === "pending");
  if (imageNote) res.headers.set("x-share-image", imageNote);
  return res;
};

const sleep = (ms: number) => new Promise<null>((resolve) => setTimeout(() => resolve(null), ms));

/** Whether the outlet's page should be read for the picture: never yet, or not found over an hour ago. */
function needsImage(resolved: Resolved): boolean {
  if (resolved.image === undefined) return true;
  return resolved.image === null && Date.now() - (resolved.imageMissedAt ?? 0) > IMAGE_RETRY_MS;
}

/** The short share path of a headline, as the share sheet makes it (see shortSharePath). */
function shortPath(item: NewsItem): string {
  const time = item.publishedAt ?? item.seenAt;
  const date = dhakaDay(time ? Date.parse(time) : Date.now());
  return `/s/${date.slice(2).replaceAll("-", "")}-${shareKey(item.link)}`;
}

// ---------------------------------------------------------------------------------------------------
// Memory: KV when bound (for good), else the edge cache (a day, in this data centre).

const cacheUrl = (site: URL, memo: string) => new URL(`/__share/${memo}`, site).href;

async function recall(env: Env, site: URL, memo: string): Promise<Resolved | null> {
  try {
    if (env.SHARES) return await env.SHARES.get<Resolved>(memo, "json");
    const hit = await caches.default.match(cacheUrl(site, memo));
    return hit ? await hit.json<Resolved>() : null;
  } catch {
    return null;
  }
}

async function remember(env: Env, site: URL, memo: string, resolved: Resolved): Promise<void> {
  try {
    if (env.SHARES && !resolved.partial) {
      await env.SHARES.put(memo, JSON.stringify(resolved));
      return;
    }
    await caches.default.put(
      cacheUrl(site, memo),
      new Response(JSON.stringify(resolved), {
        headers: { "content-type": "application/json", "cache-control": "public, max-age=86400" },
      }),
    );
  } catch {
    // Over the free plan's daily KV writes, or the cache said no: looked up again next time.
  }
}

// ---------------------------------------------------------------------------------------------------
// Outlets: the article page's own tags (outlet-head.ts).

/** A headline the index doesn't have (an old long link): from the outlet's page, else from its address. */
async function fromOutlet(article: { url: URL; source: NewsSource }, load: ShareLoader): Promise<Resolved> {
  const head = await outletHead(article.url.href, OUTLET_TIMEOUT_MS);
  const meta = await load<ShareMeta>(`${SHARE_DIR}/meta.json`);
  const title = head?.title ?? slugTitle(article.url) ?? `${article.source.name} article`;
  const item: NewsItem = {
    title,
    link: article.url.href,
    sourceId: article.source.id,
    sourceName: article.source.name,
    lang: article.source.lang,
    category: "other",
  };
  if (head?.published) item.publishedAt = head.published;
  return {
    data: { kind: "headline", item, related: [], logos: logosFor(article.source.id, meta) },
    // The page was read: its picture, or none. Not read in time: looked for again, for longer.
    image: head ? (head.image ?? null) : undefined,
    imageMissedAt: head && !head.image ? Date.now() : undefined,
    partial: !head?.title,
  };
}

// ---------------------------------------------------------------------------------------------------
// Videos.

/** A video that has left the Videos view, from YouTube's oEmbed (title and channel); null if gone. */
async function fromOEmbed(id: string): Promise<ShareData | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`,
      { signal: AbortSignal.timeout(OUTLET_TIMEOUT_MS), cf: { cacheTtl: 86400, cacheEverything: true } },
    );
    if (!res.ok) return null;
    const { title, author_name } = await res.json<{ title?: string; author_name?: string }>();
    if (!title) return null;
    return { kind: "video", video: { id, channel: "", title, publishedAt: "" }, channelName: author_name ?? "YouTube" };
  } catch {
    return null;
  }
}

/** YouTube's largest thumbnail (1280×720) when the video has one, else the 480×360 every video has. */
async function videoThumbnail(id: string): Promise<string> {
  const max = `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;
  try {
    const res = await fetch(max, { method: "HEAD", signal: AbortSignal.timeout(1500), cf: { cacheTtl: 86400 } });
    if (res.ok) return max;
  } catch {
    // Fall through to the one that always exists.
  }
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

// ---------------------------------------------------------------------------------------------------
// The page.

const escapeHtml = (text: string) =>
  text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** JSON that can sit inside a <script> element. */
const scriptJson = (value: unknown) =>
  JSON.stringify(value).replace(/[<\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);

const CATEGORY = new Map(CATEGORIES.map((c) => [c.id, c]));

function formatDay(iso: string, bn: boolean): string {
  return new Intl.DateTimeFormat(bn ? "bn-BD" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Dhaka",
  }).format(new Date(iso));
}

interface Description {
  title: string;
  ogTitle: string;
  description: string;
  lang: "bn" | "en";
  type: string;
  image?: string;
  imageAlt?: string;
  published?: string;
}

function describe({ data, image }: Resolved): Description {
  if (data.kind === "headline") {
    const { item, related } = data;
    const bn = item.lang === "bn";
    const outlet = bn ? bnSourceName(item.sourceId, item.sourceName, "bn") : item.sourceName;
    const category = item.category === "other" ? undefined : CATEGORY.get(item.category);
    const time = item.publishedAt ?? item.seenAt;
    const facts = [outlet, category && (bn ? category.bn : category.label), time && formatDay(time, bn)].filter(Boolean);
    const others = new Set(related.map((r) => r.sourceId)).size;
    const description = bn
      ? `${facts.join(" · ")}।${others ? ` আরও ${others.toLocaleString("bn-BD")}টি সংবাদমাধ্যমে এই খবর।` : ""} বার্তাবোর্ডে দেশের সব খবর, এক জায়গায়।`
      : `${facts.join(" · ")}.${others ? ` Also reported by ${others} other outlet${others === 1 ? "" : "s"}.` : ""} Every Bangladeshi headline, on one board: Bartaboard.`;
    return {
      title: `${item.title} · ${outlet} | Bartaboard`,
      ogTitle: item.title,
      description,
      lang: item.lang,
      type: "article",
      image: image ?? undefined,
      imageAlt: item.title,
      published: item.publishedAt,
    };
  }
  if (data.kind === "video") {
    const { video, channelName } = data;
    const bn = hasBangla(video.title);
    const channel = bn ? bnChannelName(video.channel, channelName, "bn") : channelName;
    const when = video.publishedAt ? formatDay(video.publishedAt, bn) : "";
    const description = bn
      ? `${channel}${when ? ` · ${when}` : ""}। বার্তাবোর্ডে দেশের ৩০টির বেশি টিভি চ্যানেলের সংবাদ ভিডিও।`
      : `${channel}${when ? ` · ${when}` : ""}. News videos from 30+ Bangladeshi TV channels, on Bartaboard.`;
    return {
      title: `${video.title} · ${channel} | Bartaboard`,
      ogTitle: video.title,
      description,
      lang: bn ? "bn" : "en",
      type: "video.other",
      image: image ?? undefined,
      imageAlt: video.title,
    };
  }
  return {
    title: "This headline has left Bartaboard | Bartaboard",
    ogTitle: "Bartaboard: every Bangladeshi headline, on one board",
    description: "Shared headlines stay on Bartaboard for 30 days. Today's news from every Bangladeshi outlet is on the board.",
    lang: "en",
    type: "website",
  };
}

/** The share page (the static 404 page, see src/app/not-found.tsx) with this link's tags and data. */
async function render(env: Env, site: URL, resolved: Resolved, canonicalPath: string, imagePending = false): Promise<Response> {
  const template = await env.ASSETS.fetch(new URL("/404", site));
  const d = describe(resolved);
  const canonical = new URL(canonicalPath, site).href;
  // The site's own picture when the outlet has none.
  const image = d.image ?? new URL("/opengraph-image", site).href;
  // The page shows the picture, or asks for it (`?image`) when it is still being looked for.
  const pageData: ShareData =
    resolved.data.kind === "headline" && !imagePending ? { ...resolved.data, image: resolved.image ?? null } : resolved.data;

  const meta = (attr: "property" | "name", key: string, value?: string) =>
    value ? `<meta ${attr}="${key}" content="${escapeHtml(value)}"/>` : "";
  const tags = [
    `<link rel="canonical" href="${escapeHtml(canonical)}"/>`,
    meta("property", "og:type", d.type),
    meta("property", "og:site_name", "Bartaboard"),
    meta("property", "og:title", d.ogTitle),
    meta("property", "og:description", d.description),
    meta("property", "og:url", canonical),
    meta("property", "og:locale", d.lang === "bn" ? "bn_BD" : "en_US"),
    meta("property", "og:image", image),
    meta("property", "og:image:alt", d.imageAlt ?? d.ogTitle),
    meta("property", "article:published_time", d.published),
    meta("name", "twitter:card", "summary_large_image"),
    meta("name", "twitter:title", d.ogTitle),
    meta("name", "twitter:description", d.description),
    meta("name", "twitter:image", image),
    `<script id="share-data" type="application/json">${scriptJson(pageData)}</script>`,
  ].join("");

  const page = new HTMLRewriter()
    .on("html", { element: (el) => void el.setAttribute("lang", d.lang) })
    .on("title", { element: (el) => void el.setInnerContent(d.title) })
    .on('meta[name="description"]', { element: (el) => void el.setAttribute("content", d.description) })
    .on('meta[property^="og:"]', { element: (el) => void el.remove() })
    .on('meta[name^="twitter:"]', { element: (el) => void el.remove() })
    .on('link[rel="canonical"]', { element: (el) => void el.remove() })
    .on("head", { element: (el) => void el.append(tags, { html: true }) })
    .transform(template);

  const headers = new Headers(page.headers);
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("cache-control", "public, max-age=0, must-revalidate");
  // Shared pages repeat outlets' headlines: for people, not for search results.
  headers.set("x-robots-tag", "noindex");
  return new Response(page.body, { status: 200, headers });
}
