"use client";

import { createContext, memo, useContext, useRef, useState, type ReactNode } from "react";
import { sourceProblem } from "@/lib/problems";
import type { NewsFeed, NewsItem, NewsSource, SourceStatus } from "@/lib/types";
import { ItemTime } from "./ItemTime";
import { AlertIcon, ArrowUpRightIcon, ChevronIcon, ItemMenu, NewDot } from "./ui";

const PER_CARD = 8;

const METHOD_LABEL: Record<string, string> = { rss: "RSS", sitemap: "Sitemap", html: "Web" };

/**
 * One source's headlines. With `collapsible` (phones), tapping the header folds the card down to
 * just its header; unavailable sources start folded. A search or category filter opens every card
 * so matches are never hidden. Memoized: the board re-renders for every filter and panel change.
 */
export const SourceCard = memo(function SourceCard({
  source,
  status,
  items,
  filtering,
  now,
  collapsible = false,
  savedCollapsed,
  seenLead,
  onToggle,
  isNew,
  savedLinks,
  onToggleSave,
  onShare,
}: {
  source: NewsSource;
  status?: SourceStatus;
  items: NewsItem[];
  filtering: boolean;
  now: number;
  collapsible?: boolean;
  /** The reader's saved choice for this card; undefined means the default. */
  savedCollapsed?: boolean;
  /** The lead headline's link when the card was last toggled. */
  seenLead?: string;
  onToggle?: (sourceId: string, collapsed: boolean) => void;
  /** True for headlines since the reader's last visit. */
  isNew: (item: NewsItem) => boolean;
  savedLinks: Set<string>;
  onToggleSave: (item: NewsItem) => void;
  onShare: (item: NewsItem) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const ref = useRef<HTMLElement>(null);
  if (filtering && items.length === 0) return null;

  const problem = sourceProblem(source, status);
  const pending = !problem && !status;
  const collapsed = collapsible && !filtering && (savedCollapsed ?? !!problem);
  const [lead, ...rest] = showAll ? items : items.slice(0, PER_CARD);
  const hasNew = collapsed && !!lead && !!seenLead && seenLead !== lead.link;

  const toggle = () => {
    // Folding a card whose header has scrolled under the toolbar would leave the reader further down
    // the page; bring the header back into view first.
    const card = ref.current;
    const toolbar = document.querySelector("[data-toolbar]");
    if (!collapsed && card && toolbar) {
      const offset = card.getBoundingClientRect().top - toolbar.getBoundingClientRect().bottom - 8;
      if (offset < 0) window.scrollBy({ top: offset, behavior: "instant" });
    }
    onToggle?.(source.id, !collapsed);
  };

  return (
    <article
      ref={ref}
      className={`flex flex-col overflow-hidden rounded-2xl border border-line bg-surface ${
        problem ? "" : "shadow-card"
      }`}
    >
      <header className={`relative flex items-center justify-between gap-3 px-4 pt-4 ${collapsed ? "pb-4" : "pb-3"}`}>
        {collapsible && (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={!collapsed}
            aria-label={`${collapsed ? "Expand" : "Collapse"} ${source.name}`}
            className="absolute inset-0 transition active:bg-surface-2"
          />
        )}
        <div className={`relative min-w-0 ${collapsible ? "pointer-events-none" : ""}`}>
          <SourceLogo source={source} link={!collapsible} />
          <p className="mt-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
            {source.kind} · {source.lang === "bn" ? "বাংলা" : "English"}
            {METHOD_LABEL[source.method] && <> · {METHOD_LABEL[source.method]}</>}
          </p>
          {collapsed && problem && <p className="mt-1 truncate text-xs text-muted">{problem.message}</p>}
        </div>
        <div className="pointer-events-none relative flex shrink-0 items-center gap-2">
          {hasNew && (
            <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold">
              New
            </span>
          )}
          {!problem && !pending && items.length > 0 && (
            <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold tabular-nums text-accent">
              {items.length}
            </span>
          )}
          {collapsible && (
            <ChevronIcon className={`h-5 w-5 text-muted transition duration-300 ${collapsed ? "" : "rotate-180"}`} />
          )}
        </div>
      </header>

      {problem ? (
        <Fold open={!collapsed}>
          <div className="mx-4 mb-4 flex gap-3 rounded-xl bg-surface-2 p-3.5 text-sm">
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
            <div className="min-w-0">
              <p className="text-foreground/80">{problem.message}</p>
              {problem.detail && <p className="mt-1 break-words text-xs text-muted">Details: {problem.detail}</p>}
              <a
                href={source.homepage}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
              >
                Visit {new URL(source.homepage).host.replace(/^www\./, "")}
                <ArrowUpRightIcon className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </Fold>
      ) : pending ? (
        <Fold open={!collapsed}>
          <ul className="space-y-4 px-4 pb-5 pt-1" aria-busy aria-label="Loading headlines">
            {Array.from({ length: 4 }, (_, i) => (
              <li key={i} className="space-y-2">
                <div className="skeleton h-3.5 rounded-full" style={{ width: `${92 - i * 10}%` }} />
                <div className="skeleton h-2.5 w-16 rounded-full" />
              </li>
            ))}
          </ul>
        </Fold>
      ) : (
        <Fold open={!collapsed}>
          {lead && (
            <div className="border-t border-line">
              <Headline
                item={lead}
                now={now}
                isNew={isNew(lead)}
                saved={savedLinks.has(lead.link)}
                onToggleSave={onToggleSave}
                onShare={onShare}
                lead
              />
            </div>
          )}
          {rest.length > 0 && (
            <ul className="border-t border-line">
              {rest.map((it) => (
                <li key={it.link} className="border-b border-line last:border-b-0">
                  <Headline
                    item={it}
                    now={now}
                    isNew={isNew(it)}
                    saved={savedLinks.has(it.link)}
                    onToggleSave={onToggleSave}
                    onShare={onShare}
                  />
                </li>
              ))}
            </ul>
          )}
          {status?.ok && items.length === 0 && <p className="px-4 pb-6 text-sm text-muted">No headlines.</p>}
          {items.length > PER_CARD && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              aria-expanded={showAll}
              className="flex min-h-12 w-full items-center justify-center gap-1.5 border-t border-line text-sm font-semibold text-accent transition active:bg-surface-2"
            >
              {showAll ? "Show less" : `Show all ${items.length}`}
              <ChevronIcon className={`h-4 w-4 transition ${showAll ? "rotate-180" : ""}`} />
            </button>
          )}
        </Fold>
      )}
    </article>
  );
});

/** Animates height open and closed; folded content is inert so it can't be tabbed into. */
function Fold({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div
      className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
      inert={!open}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

/** Memoized, so a search only re-renders the headlines it adds or removes. */
const Headline = memo(function Headline({
  item,
  now,
  isNew,
  saved,
  onToggleSave,
  onShare,
  lead = false,
}: {
  item: NewsItem;
  now: number;
  isNew: boolean;
  saved: boolean;
  onToggleSave: (item: NewsItem) => void;
  onShare: (item: NewsItem) => void;
  lead?: boolean;
}) {
  // Opened headlines turn muted through the browser's own :visited state.
  return (
    <div className="flex">
      <a
        data-headline
        lang={item.lang}
        href={item.link}
        target="_blank"
        rel="noopener noreferrer"
        className="group block min-w-0 flex-1 py-3 pl-4 text-foreground transition visited:text-muted active:bg-surface-2 hover:bg-surface-2/60"
      >
        <span
          className={`block leading-[1.55] group-hover:text-accent ${lead ? "text-[17px] font-semibold" : "text-[15px]"}`}
        >
          {isNew && <NewDot className="mr-2 -mt-0.5" />}
          {item.title}
        </span>
        <ItemTime item={item} now={now} className="mt-1 block text-xs text-muted" />
      </a>
      <ItemMenu saved={saved} onToggleSave={() => onToggleSave(item)} onShare={() => onShare(item)} />
    </div>
  );
});

/** The feed's logos and their measurements (see scripts/fetch-news.ts). */
export const Logos = createContext<Pick<NewsFeed, "logos" | "logoShapes">>({ logos: {}, logoShapes: {} });

/**
 * The source's logo, linking to its homepage. Wide images are shown alone;
 * square ones (favicons) sit next to the name; if there is no image the name
 * is shown as text.
 */
export function SourceLogo({
  source,
  size = "md",
  link = true,
}: {
  source: NewsSource;
  size?: "sm" | "md";
  /** False when the logo sits inside a larger tap target (a collapsible card header). */
  link?: boolean;
}) {
  const { logos, logoShapes } = useContext(Logos);
  const src = logos[source.id];
  const shape = logoShapes[source.id];
  const [failed, setFailed] = useState(false);
  const kind = !src || failed ? "none" : shape && shape.width / shape.height >= 1.8 ? "logo" : "icon";

  // Logos are drawn on a fixed plate so they read the same in light and dark mode.
  const plate = shape?.light ? "bg-neutral-800" : "bg-white";
  const sm = size === "sm";
  const Tag = link ? "a" : "span";

  return (
    <Tag
      {...(link ? { href: source.homepage, target: "_blank", rel: "noopener noreferrer" } : {})}
      title={source.name}
      className={`flex min-w-0 items-center gap-2 font-semibold hover:text-accent ${sm ? "h-5 text-xs" : "h-9 text-[15px]"}`}
    >
      {kind !== "none" && (
        // eslint-disable-next-line @next/next/no-img-element -- third-party logos, measured by the fetch script
        <img
          src={src}
          alt={kind === "logo" ? source.name : ""}
          // Its measured size reserves its width; lazy, so the logos don't compete with the page itself.
          width={shape?.width}
          height={shape?.height}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className={
            kind === "logo"
              ? sm
                ? `h-5 w-auto max-w-[110px] rounded object-contain object-left px-1 py-0.5 ${plate}`
                : `h-9 w-auto max-w-[180px] rounded-lg object-contain object-left px-2 py-1.5 ring-1 ring-line ${plate}`
              : `${sm ? "h-4 w-4" : "h-7 w-7"} shrink-0 rounded-md object-contain ${plate}`
          }
        />
      )}
      {kind !== "logo" && <span className="truncate">{source.name}</span>}
    </Tag>
  );
}
