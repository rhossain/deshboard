"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { CATEGORIES } from "@/lib/categories";
import { articleUrl, linkKey } from "@/lib/share";
import { findStories } from "@/lib/stories";
import type { NewsItem, NewsSource } from "@/lib/types";
import { ItemTime } from "./ItemTime";
import { Logo } from "./Logo";
import { loadFeed } from "./NewsBoard";
import { LogoUrls, SourceLogo } from "./SourceCard";
import { ArrowUpRightIcon } from "./ui";

const CATEGORY_LABEL = new Map(CATEGORIES.map((c) => [c.id, c.label]));
const RELATED_MAX = 6;

const noSubscribe = () => () => {};

interface Shared {
  item: NewsItem;
  source: NewsSource;
  /** The same story from other outlets. */
  related: NewsItem[];
  logos: Record<string, string>;
  now: number;
}

/**
 * The page for a shared headline (`/s/<host>/<path>`, see sharePath) and for any other unknown
 * address. The site is static, so the headline is looked up in the browser: links to an outlet on
 * the board show the headline, or go straight to the article once it has left the board; anything
 * else goes to the board.
 */
export function SharedHeadline() {
  // null while prerendering: the page is the same file for every address.
  const pathname = useSyncExternalStore(noSubscribe, () => window.location.pathname, () => null);
  const [shared, setShared] = useState<Shared | null>(null);
  const isShare = pathname?.startsWith("/s/");

  useEffect(() => {
    if (!pathname?.startsWith("/s/")) return;
    const found = articleUrl(pathname.slice(3).replace(/\/$/, "").split("/"));
    if (!found) {
      window.location.replace("/");
      return;
    }
    const controller = new AbortController();
    loadFeed(controller.signal).then(
      (feed) => {
        const items = feed.results.flatMap((r) => r.items);
        const key = linkKey(found.url.href);
        const item = items.find((it) => linkKey(it.link) === key);
        // The headline has left the board: the article itself is the best we can do.
        if (!item) return window.location.replace(found.url.href);
        const story = findStories(items).find((st) => st.items.some((it) => it.link === item.link));
        const related = story?.items.filter((it) => it.link !== item.link) ?? [];
        document.title = `${item.title} · ${found.source.name}`;
        setShared({ item, source: found.source, related, logos: feed.logos, now: Date.now() });
      },
      () => {
        if (!controller.signal.aborted) window.location.replace(found.url.href);
      },
    );
    return () => controller.abort();
  }, [pathname]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-4 pb-12 pt-[max(env(safe-area-inset-top),1.25rem)] sm:px-6 sm:pt-8">
      <header>
        <Link href="/" className="inline-block text-[24px]" aria-label="Deshboard home">
          <Logo />
        </Link>
      </header>

      <main className="mt-8 flex-1">
        {shared ? (
          <LogoUrls value={shared.logos}>
            <Headline shared={shared} />
          </LogoUrls>
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
          See today&rsquo;s headlines on Deshboard
        </Link>
      </footer>
    </div>
  );
}

function Headline({ shared: { item, source, related, now } }: { shared: Shared }) {
  return (
    <>
      <article className="overflow-hidden rounded-3xl border border-line bg-surface shadow-card">
        <div className="p-5 sm:p-7">
          <SourceLogo source={source} />
          <p className="mt-3 flex flex-wrap gap-x-2 text-xs text-muted">
            {item.category !== "other" && <span>{CATEGORY_LABEL.get(item.category)}</span>}
            {item.category !== "other" && (item.publishedAt || item.seenAt) && <span>·</span>}
            <ItemTime item={item} now={now} />
          </p>
          <h1 className="mt-3 text-[24px] font-semibold leading-[1.45] tracking-tight sm:text-[28px]">{item.title}</h1>
          <a
            href={item.link}
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
                  <span className="min-w-0 group-hover:text-accent">{it.title}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
