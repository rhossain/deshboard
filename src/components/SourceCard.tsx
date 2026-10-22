"use client";

import { createContext, memo, useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { fallbackNote, sourceProblem } from "@/lib/problems";
import type { NewsFeed, NewsItem, NewsSource, SourceStatus } from "@/lib/types";
import { ItemTime } from "./ItemTime";
import { useLocale, useStrings } from "./locale";
import { formatCount } from "./time";
import { AlertIcon, ArrowUpRightIcon, ChevronIcon, CloseIcon, ItemMenu, NewDot, StarIcon } from "./ui";
import { Highlight } from "./Highlight";

const PER_CARD = 8;
/**
 * Headlines on a card in compact density. The card still has PER_CARD (the page is the same for
 * every reader and search engines); CSS hides the rest, and "Show all" opens them in a SourcePanel.
 */
const COMPACT_PER_CARD = 5;

/**
 * One source's headlines. With `collapsible` (phones), tapping the header folds the card down to
 * just its header; unavailable sources start folded. A search (or "new" only) opens every card so
 * matches are never hidden; a category keeps the cards foldable, as on the unfiltered board. Memoized: the board re-renders for every filter and panel change.
 */
export const SourceCard = memo(function SourceCard({
  source,
  status,
  items,
  filtering,
  foldable = !filtering,
  now,
  collapsible = false,
  savedCollapsed,
  seenLead,
  onToggle,
  isNew,
  savedLinks,
  onToggleSave,
  onShare,
  total,
  onShowAll,
  expanded = false,
  panelId,
  onExpand,
  pinned = false,
  onTogglePin,
}: {
  source: NewsSource;
  status?: SourceStatus;
  items: NewsItem[];
  filtering: boolean;
  /** False when the reader's matches must all show (a search): no card folds. Defaults to `!filtering`. */
  foldable?: boolean;
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
  /** Its headlines in the whole feed, while the page only has a few of them (see NewsSeed). */
  total?: number;
  /** Called when the card opens in full, for the board to load the headlines it doesn't have yet. */
  onShowAll?: () => void;
  /** Its SourcePanel is open: every headline, in a row of the grid under the card's row (as Videos' stories). */
  expanded?: boolean;
  /** The open panel's id, for the button that controls it. */
  panelId?: string;
  /** Opens or closes the card's SourcePanel (one at a time, so the board keeps which). */
  onExpand?: (sourceId: string) => void;
  /** One of the reader's own sources (see pinned.ts), shown first. */
  pinned?: boolean;
  onTogglePin?: (sourceId: string) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const t = useStrings();
  const locale = useLocale();
  if (filtering && items.length === 0) return null;

  const problem = sourceProblem(source, status, locale);
  // The last fetch failed but earlier ones' headlines are kept: those, with the reason in a note.
  const stale = !!problem && items.length > 0;
  // Headlines from Google News, because the site refuses us: said where the method usually is.
  const fallback = fallbackNote(status, locale);
  const pending = !problem && !status;
  // Folded on phones. Until the board knows it's on one (the prerendered page, and hydration), CSS
  // folds the card at phone widths instead, so nothing folds, moves or animates when the board starts.
  const foldsOnPhone = foldable && (savedCollapsed ?? (!!problem && !stale));
  const collapsed = collapsible && foldsOnPhone;
  const phoneFolded = !collapsible && foldsOnPhone;
  const [lead, ...rest] = items.slice(0, PER_CARD);
  const count = total ?? items.length;
  // Rows for the headlines still to come, so the card is already the size it will be.
  const placeholders = Math.max(0, Math.min(count, PER_CARD) - Math.min(items.length, PER_CARD));
  // The saved lead is the unfiltered card's, so a filtered card (a category) can't compare its own to it.
  const hasNew = collapsed && !filtering && !!lead && !!seenLead && seenLead !== lead.link;

  const toggle = () => {
    // Folding a card whose header has scrolled under the toolbar would leave the reader further down
    // the page; bring the header back into view first.
    const card = ref.current;
    const toolbar = document.querySelector("[data-toolbar]");
    if (!collapsed && card && toolbar) {
      const offset = card.getBoundingClientRect().top - toolbar.getBoundingClientRect().bottom - 8;
      if (offset < 0) window.scrollBy({ top: offset, behavior: "instant" });
    }
    // A folded card's panel would point at nothing: it closes with it.
    if (!collapsed && expanded) onExpand?.(source.id);
    onToggle?.(source.id, !collapsed);
  };

  return (
    <article
      ref={ref}
      data-source-card={source.id}
      // Cards off screen are skipped when the page is laid out and painted (most of them, on a page of
      // fifty); the estimate holds their place until they are.
      className={`flex flex-col overflow-hidden rounded-2xl border border-line bg-surface [contain-intrinsic-size:auto_560px] [content-visibility:auto] compact:[contain-intrinsic-size:auto_400px] ${
        problem ? "" : "shadow-card"
      }`}
    >
      <header
        className={`relative flex items-center justify-between gap-3 px-4 pt-4 ${
          collapsed ? "pb-4" : phoneFolded ? "pb-3 max-md:pb-4" : "pb-3"
        }`}
      >
        {/* A card that can't fold (during a search) doesn't offer to. */}
        {collapsible && foldable && (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={!collapsed}
            aria-label={collapsed ? t.expand(source.name) : t.collapse(source.name)}
            className="absolute inset-0 transition active:bg-surface-2"
          />
        )}
        <div className={`relative min-w-0 ${collapsible ? "pointer-events-none" : ""}`}>
          {/* Under the board's "Headlines by newspaper" (or "Your news" / "Other news") heading. */}
          <h3 className="min-w-0">
            <SourceLogo source={source} link={!collapsible} />
          </h3>
          <p className="mt-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
            {t.kinds[source.kind] ?? source.kind} · {t.lang[source.lang]}
            {fallback ? (
              <>
                {" · "}
                <span title={fallback.detail} className="underline decoration-dotted underline-offset-2">
                  {fallback.message}
                </span>
              </>
            ) : (
              t.methods[source.method] && <> · {t.methods[source.method]}</>
            )}
          </p>
          {(collapsed || phoneFolded) && problem && (
            <p className={`mt-1 truncate text-xs text-muted ${phoneFolded ? "md:hidden" : ""}`}>{problem.message}</p>
          )}
        </div>
        <div className="pointer-events-none relative flex shrink-0 items-center gap-2">
          {onTogglePin && (
            <button
              type="button"
              onClick={() => onTogglePin(source.id)}
              aria-pressed={pinned}
              aria-label={t.pins.pinName(source.name)}
              title={pinned ? t.pins.unpin(source.name) : t.pins.pinName(source.name)}
              className={`pointer-events-auto -my-2 flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-surface-2 active:scale-90 ${
                pinned ? "text-gold" : "text-muted hover:text-foreground"
              }`}
            >
              <StarIcon filled={pinned} className="h-[18px] w-[18px]" />
            </button>
          )}
          {hasNew && (
            <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold">
              {t.newBadge}
            </span>
          )}
          {(!problem || stale) && !pending && items.length > 0 && (
            <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold tabular-nums text-accent">
              {formatCount(count, locale)}
            </span>
          )}
          {/* Shown at phone widths even before the board knows it's on a phone (see phoneFolded). */}
          <ChevronIcon
            className={`h-5 w-5 text-muted transition duration-300 ${!foldable ? "hidden" : collapsible ? "" : "hidden max-md:block"} ${
              collapsed || phoneFolded ? "" : "rotate-180"
            }`}
          />
        </div>
      </header>

      {problem && !stale ? (
        <Fold open={!collapsed} phoneFolded={phoneFolded}>
          <div className="mx-4 mb-4 flex gap-3 rounded-xl bg-surface-2 p-3.5 text-sm">
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
            <div className="min-w-0">
              <p className="text-foreground/80">{problem.message}</p>
              {problem.detail && <p className="mt-1 break-words text-xs text-muted">{t.details(problem.detail)}</p>}
              <a
                href={source.homepage}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
              >
                {t.visit(new URL(source.homepage).host.replace(/^www\./, ""))}
                <ArrowUpRightIcon className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </Fold>
      ) : pending ? (
        <Fold open={!collapsed} phoneFolded={phoneFolded}>
          <ul className="space-y-4 px-4 pb-5 pt-1" aria-busy aria-label={t.loadingHeadlines}>
            {Array.from({ length: 4 }, (_, i) => (
              <li key={i} className="space-y-2">
                <div className="skeleton h-3.5 rounded-full" style={{ width: `${92 - i * 10}%` }} />
                <div className="skeleton h-2.5 w-16 rounded-full" />
              </li>
            ))}
          </ul>
        </Fold>
      ) : (
        <Fold open={!collapsed} phoneFolded={phoneFolded}>
          {stale && (
            <p
              title={[problem.message, problem.detail].filter(Boolean).join(" ")}
              className="mx-4 mb-3 flex gap-2 rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted"
            >
              <AlertIcon className="mt-px h-3.5 w-3.5 shrink-0" />
              {t.stale}
            </p>
          )}
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
              {rest.map((it, i) => (
                <li
                  key={it.link}
                  className={`border-b border-line last:border-b-0 ${
                    // The lead is row 0, so this is row i + 1.
                    i + 1 >= COMPACT_PER_CARD ? "compact:hidden" : ""
                  } ${i + 2 === COMPACT_PER_CARD && i + 1 < rest.length ? "compact:border-b-0" : ""}`}
                >
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
          {placeholders > 0 && (
            <ul className="border-t border-line" aria-hidden>
              {Array.from({ length: placeholders }, (_, i) => (
                <li
                  key={i}
                  className={`space-y-2 border-b border-line px-4 py-3 last:border-b-0 compact:py-2 ${
                    Math.min(items.length, PER_CARD) + i >= COMPACT_PER_CARD ? "compact:hidden" : ""
                  }`}
                >
                  <div className="skeleton h-3.5 rounded-full" />
                  <div className="skeleton h-3.5 w-3/5 rounded-full" />
                  <div className="skeleton h-2.5 w-16 rounded-full" />
                </li>
              ))}
            </ul>
          )}
          {status?.ok && count === 0 && <p className="px-4 pb-6 text-sm text-muted">{t.noHeadlines}</p>}
          {count > COMPACT_PER_CARD && (
            <button
              type="button"
              data-show-all
              onClick={() => {
                if (!expanded) onShowAll?.();
                onExpand?.(source.id);
              }}
              aria-expanded={expanded}
              aria-controls={expanded ? panelId : undefined}
              // With PER_CARD or fewer, only compact cards have more to show.
              className={`min-h-12 w-full items-center justify-center gap-1.5 border-t border-line text-sm font-semibold text-accent transition active:bg-surface-2 aria-expanded:bg-accent-soft ${
                count > PER_CARD || expanded ? "flex" : "hidden compact:flex"
              }`}
            >
              {expanded ? t.showLess : t.showAll(formatCount(count, locale))}
              <ChevronIcon className={`h-4 w-4 transition duration-300 ${expanded ? "rotate-180" : ""}`} />
            </button>
          )}
        </Fold>
      )}
    </article>
  );
});

/**
 * Animates height open and closed; folded content is inert so it can't be tabbed into. `phoneFolded`
 * folds it at phone widths with CSS alone (see SourceCard).
 */
function Fold({ open, phoneFolded, children }: { open: boolean; phoneFolded: boolean; children: ReactNode }) {
  const rows = !open ? "grid-rows-[0fr]" : phoneFolded ? "grid-rows-[1fr] max-md:grid-rows-[0fr]" : "grid-rows-[1fr]";
  return (
    <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${rows}`} inert={!open}>
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

/** Rows held for headlines still loading in an open panel (the whole feed is on its way). */
const PANEL_PLACEHOLDERS = 6;

/**
 * Every headline of one source, laid out across the grid in a row of its own under the source card's
 * row, newest first, as Videos lays out a story's other videos: a notch points up at the card, Escape
 * or the close buttons close it (and the board puts focus back on the card's "Show all").
 */
export function SourcePanel({
  id,
  source,
  items,
  total,
  now,
  isNew,
  savedLinks,
  onToggleSave,
  onShare,
  onClose,
}: {
  id: string;
  source: NewsSource;
  items: NewsItem[];
  /** Its headlines in the whole feed, while the page only has some of them. */
  total?: number;
  now: number;
  isNew: (item: NewsItem) => boolean;
  savedLinks: Set<string>;
  onToggleSave: (item: NewsItem) => void;
  onShare: (item: NewsItem) => void;
  onClose: () => void;
}) {
  const t = useStrings();
  const locale = useLocale();
  const panel = useRef<HTMLDivElement>(null);
  const notch = useRef<HTMLSpanElement>(null);
  const count = Math.max(total ?? 0, items.length);
  const waiting = Math.min(PANEL_PLACEHOLDERS, count - items.length);

  // On opening, the notch goes under the card (and again as the grid reflows), and the panel comes up
  // into view if it opened low on the screen.
  useLayoutEffect(() => {
    const el = panel.current;
    if (!el) return;
    const place = () => {
      const card = el.parentElement?.querySelector(`[data-source-card="${CSS.escape(source.id)}"]`);
      const mark = notch.current;
      if (!card || !mark) return;
      const c = card.getBoundingClientRect();
      const p = el.getBoundingClientRect();
      // A card as wide as the panel (one column) needs no pointer.
      mark.hidden = c.width > p.width * 0.6;
      mark.style.left = `${c.left - p.left + c.width / 2}px`;
    };
    place();
    const top = el.getBoundingClientRect().top;
    if (top > window.innerHeight * 0.7) window.scrollBy({ top: top - window.innerHeight * 0.4, behavior: "smooth" });
    const observer = new ResizeObserver(place);
    observer.observe(el);
    return () => observer.disconnect();
  }, [source.id]);

  return (
    <div
      ref={panel}
      id={id}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
      className="story-panel col-span-full -mt-1 sm:mt-0"
    >
      <section
        aria-labelledby={`${id}-title`}
        className="relative rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5"
      >
        <span
          ref={notch}
          aria-hidden
          className="absolute -top-[7px] h-3 w-3 -translate-x-1/2 rotate-45 rounded-tl-[3px] border-l border-t border-line bg-surface"
        />
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gold">{t.allHeadlines.label}</p>
            <p id={`${id}-title`} className="mt-1 font-display text-lg leading-snug">
              {t.allHeadlines.summary(formatCount(count, locale), source.name)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.allHeadlines.close(source.name)}
            title={t.allHeadlines.close(source.name)}
            className="-mr-1.5 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-surface-2 hover:text-foreground"
          >
            <CloseIcon className="h-[18px] w-[18px]" />
          </button>
        </div>
        <ul
          className="-mx-2 mt-3 grid gap-x-4 gap-y-1 border-t border-line pt-3 sm:grid-cols-2 xl:grid-cols-3"
          aria-busy={waiting > 0 || undefined}
        >
          {items.map((it) => (
            <li key={it.link} className="flex rounded-xl transition-colors hover:bg-surface-2">
              <a
                data-headline
                href={it.link}
                target="_blank"
                rel="noopener noreferrer"
                className="group block min-w-0 flex-1 py-2.5 pl-2 text-foreground transition visited:text-muted"
              >
                <span lang={it.lang} className="block text-[14px] leading-[1.5] group-hover:text-accent">
                  {isNew(it) && <NewDot className="mr-2 -mt-0.5" />}
                  <Highlight text={it.title} />
                </span>
                <ItemTime item={it} now={now} className="mt-1 block text-[11px] text-muted" />
              </a>
              <ItemMenu
                saved={savedLinks.has(it.link)}
                onToggleSave={() => onToggleSave(it)}
                onShare={() => onShare(it)}
                className="pt-1.5"
              />
            </li>
          ))}
          {Array.from({ length: Math.max(0, waiting) }, (_, i) => (
            <li key={`waiting-${i}`} aria-hidden className="space-y-2 px-2 py-3">
              <div className="skeleton h-3.5 rounded-full" />
              <div className="skeleton h-3.5 w-3/5 rounded-full" />
              <div className="skeleton h-2.5 w-16 rounded-full" />
            </li>
          ))}
        </ul>
        {/* A long list's end is far from the close button at the top. */}
        {count > 12 && (
          <button
            type="button"
            onClick={onClose}
            className="mt-3 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border-t border-line text-sm font-semibold text-accent transition hover:bg-surface-2 active:bg-surface-2"
          >
            {t.showLess}
            <ChevronIcon className="h-4 w-4 rotate-180" />
          </button>
        )}
      </section>
    </div>
  );
}

/** Memoized: a search re-renders only the headlines it adds, and each title's marks (Highlight, which reads the search). */
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
        href={item.link}
        target="_blank"
        rel="noopener noreferrer"
        className="group block min-w-0 flex-1 py-3 pl-4 text-foreground transition visited:text-muted active:bg-surface-2 hover:bg-surface-2/60 compact:py-2"
      >
        <span
          lang={item.lang}
          className={`block leading-[1.55] group-hover:text-accent compact:leading-[1.45] ${
            lead ? "text-[17px] font-semibold compact:text-[16px]" : "text-[15px] compact:text-[14px]"
          }`}
        >
          {isNew && <NewDot className="mr-2 -mt-0.5" />}
          <Highlight text={item.title} />
        </span>
        <ItemTime item={item} now={now} className="mt-1 block text-xs text-muted compact:mt-0.5" />
      </a>
      <ItemMenu
        saved={saved}
        onToggleSave={() => onToggleSave(item)}
        onShare={() => onShare(item)}
        className="compact:pt-2"
      />
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
