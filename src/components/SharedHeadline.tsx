"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { CATEGORIES } from "@/lib/categories";
import { articleUrl, sharedId, sharedVideoId, shareKey } from "@/lib/share";
import {
  BOARD_SHARD_DIR,
  datesToSearch,
  findShared,
  findSharedVideo,
  type ShareData,
  type ShareLoader,
  sourceById,
} from "@/lib/share-lookup";
import { ItemTime } from "./ItemTime";
import { BartaboardLogo } from "./BartaboardLogo";
import { SocialLinks } from "./InfoPage";
import { SharedVideo } from "./SharedVideo";
import { dhakaDay } from "./time";
import { Logos, SourceLogo } from "./SourceCard";
import { ArrowUpRightIcon } from "./ui";
import { watchUrl } from "./youtube";

const CATEGORY_LABEL = new Map(CATEGORIES.map((c) => [c.id, c.label]));
const RELATED_MAX = 6;
/** Days a link without a day in it (the long form) is looked for in, besides the board's: the cache's 72 hours. */
const RECENT_DAYS = 4;

const noSubscribe = () => () => {};

/** What the Cloudflare function wrote into the page for this link (see functions/s/[[path]].ts), if anything. */
function inlineShare(): ShareData | null {
  const el = document.getElementById("share-data");
  if (!el?.textContent) return null;
  try {
    return JSON.parse(el.textContent) as ShareData;
  } catch {
    return null;
  }
}

/** The shared headline's picture, from the share function (it reads the outlet's page); null if none. */
async function askForImage(pathname: string): Promise<string | null> {
  try {
    const res = await fetch(`${pathname}?image`, { headers: { accept: "application/json" } });
    if (!res.ok) return null;
    const { image } = (await res.json()) as { image?: unknown };
    return typeof image === "string" && /^https?:\/\//.test(image) ? image : null;
  } catch {
    return null;
  }
}

const loadJson: ShareLoader = async (path) => {
  try {
    const res = await fetch(path, { cache: "no-cache" });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
};

/**
 * What a share path shows, read from the share index in the browser: on hosts without the Cloudflare
 * function (Apache, `next dev`), or if its data is missing. A long link it can't find goes to the
 * article; a video to YouTube; a short one that has left the index says so.
 */
async function lookUp(segments: string[]): Promise<ShareData | null> {
  const videoId = sharedVideoId(segments);
  if (videoId) {
    const video = await findSharedVideo(videoId, loadJson);
    if (!video) window.location.replace(watchUrl(videoId));
    return video;
  }
  const id = sharedId(segments);
  if (id) return (await findShared(id.key, datesToSearch(id.date), loadJson)) ?? { kind: "gone" };
  const found = articleUrl(segments);
  if (!found) {
    window.location.replace("/");
    return null;
  }
  const recent = Array.from({ length: RECENT_DAYS }, (_, i) => dhakaDay(Date.now() - i * 86_400_000));
  const shared = await findShared(shareKey(found.url.href), [BOARD_SHARD_DIR, ...recent], loadJson);
  if (!shared) window.location.replace(found.url.href);
  return shared;
}

/**
 * The page for a shared headline (`/s/<yymmdd>-<key>`, see shortSharePath, or the older
 * `/s/<host>/<path>`) or video (`/s/youtu.be/<id>`), and for any other unknown address. On
 * bartaboard.com a Cloudflare function answers shared links (functions/s/[[path]].ts): it writes the
 * headline into the page, for link previews and so it shows at once. Elsewhere the page is the static
 * 404 for every address, and looks the headline up itself in the share index.
 */
export function SharedHeadline() {
  // null while prerendering: the page is the same file for every address.
  const pathname = useSyncExternalStore(noSubscribe, () => window.location.pathname, () => null);
  const [data, setData] = useState<ShareData | null>(null);
  const [now, setNow] = useState(0);
  const isShare = pathname?.startsWith("/s/");

  useEffect(() => {
    if (!pathname?.startsWith("/s/")) return;
    let cancelled = false;
    const show = (d: ShareData | null) => {
      if (cancelled || !d) return;
      setNow(Date.now());
      setData(d);
    };
    const inline = inlineShare();
    if (inline) {
      show(inline);
      // The function sent the page before the outlet answered: it says when the picture is in.
      if (inline.kind === "headline" && inline.image === undefined) {
        askForImage(pathname).then((image) => show({ ...inline, image }));
      }
    } else {
      // No share function on this host: nothing reads the outlet's picture.
      lookUp(pathname.slice(3).replace(/\/$/, "").split("/")).then((d) =>
        show(d?.kind === "headline" ? { ...d, image: d.image ?? null } : d),
      );
    }
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  // The tab's title. Set after hydration: the page's own <title> (the site's, or the headline's when the
  // Cloudflare function wrote it) is put back by the framework as the page hydrates.
  const title =
    data?.kind === "headline"
      ? `${data.item.title} · ${data.item.sourceName}`
      : data?.kind === "video"
        ? `${data.video.title} · ${data.channelName}`
        : null;
  useEffect(() => {
    if (!title) return;
    document.title = title;
    const again = setTimeout(() => (document.title = title), 500);
    return () => clearTimeout(again);
  }, [title]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-4 pb-12 pt-[max(env(safe-area-inset-top),1.25rem)] sm:px-6 sm:pt-8">
      <header>
        <Link href="/" className="inline-block text-[24px]" aria-label="Bartaboard home">
          <BartaboardLogo />
        </Link>
      </header>

      <main className="mt-8 flex-1">
        {data?.kind === "video" ? (
          <SharedVideo video={data.video} channelName={data.channelName} now={now} />
        ) : data?.kind === "headline" ? (
          <Logos value={data.logos}>
            <Headline shared={data} now={now} />
          </Logos>
        ) : data?.kind === "gone" ? (
          <div className="rounded-3xl border border-line bg-surface p-7 shadow-card">
            <h1 className="text-2xl font-semibold tracking-tight">This headline has left Bartaboard</h1>
            <p className="mt-2 text-muted">
              Shared headlines stay here for 30 days. Today&rsquo;s news from every Bangladeshi outlet is on the board.
            </p>
          </div>
        ) : isShare || pathname === null ? (
          <div className="h-64 animate-pulse rounded-3xl border border-line bg-surface shadow-card" aria-busy />
        ) : (
          <div className="rounded-3xl border border-line bg-surface p-7 shadow-card">
            <h1 className="text-2xl font-semibold tracking-tight">This page doesn&rsquo;t exist</h1>
            <p className="mt-2 text-muted">The address may be mistyped, or the page has moved.</p>
          </div>
        )}
      </main>

      <footer className="mt-10 rounded-2xl bg-surface-2 px-5 py-5 text-center">
        <p className="text-sm text-muted">Every Bangladeshi headline, on one board.</p>
        <Link
          href="/"
          className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline"
        >
          See today&rsquo;s headlines on Bartaboard
        </Link>
        <SocialLinks />
      </footer>
    </div>
  );
}

function Headline({ shared: { item, related, image }, now }: { shared: ShareData & { kind: "headline" }; now: number }) {
  const [imageState, setImageState] = useState<"loading" | "shown" | "failed">("loading");
  const source = sourceById(item.sourceId);
  // undefined: still being looked for; null: none to be had (some outlets refuse every server).
  const noPicture = image === null || imageState === "failed";
  return (
    <>
      <article className="overflow-hidden rounded-3xl border border-line bg-surface shadow-card">
        {noPicture ? (
          // The outlet's masthead in the picture's place, so the card reads the same with or without one.
          <div
            className="flex aspect-[1.91/1] w-full flex-col items-center justify-center gap-3 bg-[radial-gradient(120%_100%_at_50%_0%,var(--accent-soft),var(--surface-2))]"
            aria-hidden
          >
            <div className="origin-center scale-150">
              {source ? <SourceLogo source={source} link={false} /> : <span className="text-[15px] font-semibold">{item.sourceName}</span>}
            </div>
            {item.category !== "other" && (
              <span className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                {CATEGORY_LABEL.get(item.category)}
              </span>
            )}
          </div>
        ) : (
          <div className={`relative aspect-[1.91/1] w-full bg-surface-2 ${imageState === "shown" ? "" : "animate-pulse"}`}>
            {image && (
              // eslint-disable-next-line @next/next/no-img-element -- the outlet's own picture, on its server
              <img
                key={image}
                src={image}
                alt=""
                referrerPolicy="no-referrer"
                fetchPriority="high"
                ref={(el) => {
                  // Already in the browser's cache: loaded before React was listening.
                  if (el?.complete && el.naturalWidth > 0) setImageState("shown");
                }}
                onLoad={() => setImageState("shown")}
                onError={() => setImageState("failed")}
                className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${imageState === "shown" ? "opacity-100" : "opacity-0"}`}
              />
            )}
          </div>
        )}
        <div className="p-5 sm:p-7">
          {source ? <SourceLogo source={source} /> : <p className="text-[15px] font-semibold">{item.sourceName}</p>}
          <p className="mt-3 flex flex-wrap gap-x-2 text-xs text-muted">
            {item.category !== "other" && <span>{CATEGORY_LABEL.get(item.category)}</span>}
            {item.category !== "other" && (item.publishedAt || item.seenAt) && <span>·</span>}
            <ItemTime item={item} now={now} />
          </p>
          <h1 lang={item.lang} className="mt-3 text-[24px] font-semibold leading-[1.45] tracking-tight sm:text-[28px]">{item.title}</h1>
          <a
            href={item.link}
            rel="noopener"
            className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent px-6 text-[15px] font-semibold text-accent-ink shadow-card transition active:scale-[0.98] sm:w-auto sm:inline-flex"
          >
            Read on {item.sourceName}
            <ArrowUpRightIcon className="h-4 w-4" />
          </a>
        </div>
      </article>

      {related.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 flex items-center gap-3 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            Also reported by
            <span className="h-px flex-1 bg-line" />
          </h2>
          <ul className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
            {related.slice(0, RELATED_MAX).map((it) => (
              <li key={it.link} className="border-b border-line last:border-b-0">
                <a
                  href={it.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex gap-3 px-4 py-3 text-[14px] leading-[1.5] transition hover:bg-surface-2/60 sm:px-5"
                >
                  <span className="w-28 shrink-0 truncate pt-px text-xs font-semibold text-accent">
                    {it.sourceName}
                  </span>
                  <span lang={it.lang} className="min-w-0 group-hover:text-accent">{it.title}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
