import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cache, type ReactNode } from "react";
import { ItemTime } from "@/components/ItemTime";
import { BartaboardLogo } from "@/components/BartaboardLogo";
import { SharedVideo } from "@/components/SharedVideo";
import { SourceLogo } from "@/components/SourceCard";
import { ArrowUpRightIcon } from "@/components/ui";
import { thumb, watchUrl } from "@/components/youtube";
import { articleUrl, getSharedArticle } from "@/lib/article";
import { CATEGORIES } from "@/lib/categories";
import { getServedLogo } from "@/lib/logos";
import { sharedVideoId, sharePath, videoSharePath } from "@/lib/share";
import { getVideos } from "@/lib/videos";

const CATEGORY_LABEL = new Map(CATEGORIES.map((c) => [c.id, c.label]));
const RELATED_MAX = 6;

/** Request time, for "2 hours ago" (outside the component: rendering must be pure). */
const requestTime = () => Date.now();

type Props = { params: Promise<{ url: string[] }> };

/**
 * A shared video (`/s/youtu.be/<id>`) that is still in the Videos view, with its channel's name;
 * null if it has left it. Memoized per request (metadata and page both ask).
 */
const getSharedVideo = cache(async (id: string) => {
  const feed = await getVideos().catch(() => null);
  const video = feed?.videos.find((v) => v.id === id);
  if (!video) return null;
  return { video, channelName: feed?.channels.find((c) => c.id === video.channel)?.name ?? video.channel };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { url } = await params;
  const videoId = sharedVideoId(url);
  if (videoId) {
    const shared = await getSharedVideo(videoId);
    if (!shared) return { robots: { index: false, follow: true } };
    const { video, channelName } = shared;
    const summary = `${channelName} · via Bartaboard`;
    const image = { url: thumb(video.id, "hqdefault"), width: 480, height: 360 };
    return {
      title: { absolute: `${video.title} · ${channelName}` },
      description: summary,
      // The video on YouTube is the original; this page only points to it.
      robots: { index: false, follow: true },
      alternates: { canonical: watchUrl(video.id) },
      openGraph: {
        title: video.title,
        description: summary,
        url: videoSharePath(video.id),
        siteName: `Bartaboard · ${channelName}`,
        type: "video.other",
        images: [image],
      },
      twitter: { card: "summary_large_image", title: video.title, description: summary, images: [image.url] },
    };
  }
  const article = await getSharedArticle(url.join("/"));
  if (!article) return { robots: { index: false, follow: true } };

  const { title, source, description, image } = article;
  const summary = description ?? `${source.name} · via Bartaboard`;
  return {
    title: { absolute: `${title} · ${source.name}` },
    description: summary,
    // The outlet's article is the original; this page only points to it.
    robots: { index: false, follow: true },
    alternates: { canonical: article.link },
    openGraph: {
      title,
      description: summary,
      url: sharePath(article.link),
      siteName: `Bartaboard · ${source.name}`,
      type: "article",
      ...(image && { images: [{ url: image }] }),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description: summary,
      ...(image && { images: [image] }),
    },
  };
}

/** A headline or video shared from Bartaboard: the outlet, the headline, a way to the article and back to the board. */
export default async function SharePage({ params }: Props) {
  const { url } = await params;
  const videoId = sharedVideoId(url);
  if (videoId) {
    const shared = await getSharedVideo(videoId);
    // The video has left the Videos view: YouTube still has it.
    if (!shared) redirect(watchUrl(videoId));
    return (
      <SharePageShell>
        <SharedVideo video={shared.video} channelName={shared.channelName} now={requestTime()} />
      </SharePageShell>
    );
  }
  const article = await getSharedArticle(url.join("/"));
  if (!article) {
    // Still one of our outlets, but its headline is gone and the site can't be read: just go there.
    const found = articleUrl(url);
    if (found) redirect(found.url.href);
    redirect("/");
  }

  const { title, link, source, item, description, image, related } = article;
  const now = requestTime();
  const logo = await getServedLogo(source).catch(() => undefined);

  return (
    <SharePageShell>
      <article className="overflow-hidden rounded-3xl border border-line bg-surface shadow-card">
        {image && (
          // eslint-disable-next-line @next/next/no-img-element -- the outlet's own image, hotlinked as-is
          <img
            src={image}
            alt=""
            referrerPolicy="no-referrer"
            className="aspect-[1.91/1] w-full bg-surface-2 object-cover"
          />
        )}
        <div className="p-5 sm:p-7">
          <SourceLogo source={source} shape={logo === undefined ? undefined : (logo?.shape ?? null)} />
          {item && (
            <p className="mt-3 flex flex-wrap gap-x-2 text-xs text-muted">
              {item.category !== "other" && <span>{CATEGORY_LABEL.get(item.category)}</span>}
              {item.category !== "other" && (item.publishedAt || item.seenAt) && <span>·</span>}
              <ItemTime item={item} now={now} />
            </p>
          )}
          <h1 lang={item?.lang ?? source.lang} className="mt-3 text-[24px] font-semibold leading-[1.45] tracking-tight sm:text-[28px]">{title}</h1>
          {description && description !== title && (
            <p className="mt-3 text-[15px] leading-relaxed text-muted">{description}</p>
          )}
          <a
            href={link}
            rel="noopener"
            className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent px-6 text-[15px] font-semibold text-accent-ink shadow-card transition active:scale-[0.98] sm:w-auto sm:inline-flex"
          >
            Read on {source.name}
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
    </SharePageShell>
  );
}

/** The share page around a headline or video: the logo above, a way to the board below. */
function SharePageShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-4 pb-12 pt-[max(env(safe-area-inset-top),1.25rem)] sm:px-6 sm:pt-8">
      <header>
        <Link href="/" className="inline-block text-[24px]" aria-label="Bartaboard home">
          <BartaboardLogo />
        </Link>
      </header>

      <main className="mt-8 flex-1">
        {children}
      </main>

      <footer className="mt-10 rounded-2xl bg-surface-2 px-5 py-5 text-center">
        <p className="text-sm text-muted">Every Bangladeshi headline, on one board.</p>
        <Link
          href="/"
          className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline"
        >
          See today&rsquo;s headlines on Bartaboard
        </Link>
      </footer>
    </div>
  );
}
