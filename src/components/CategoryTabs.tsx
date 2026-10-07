"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { compactCount } from "./time";
import { ChevronIcon } from "./ui";

export interface CategoryTab {
  id: string;
  label: string;
  /** The other language's name, shown as a tooltip. */
  title?: string;
  /** The tab's own address, so crawlers and middle-clicks can follow it; a plain click stays in place. */
  href: string;
  count: number;
}


/**
 * An editorial section bar: text tabs on one scrolling row, with an accent underline that slides to
 * the active tab. On phones the active tab is scrolled to the centre; on pointer devices arrow buttons
 * appear when the row overflows.
 */
export function CategoryTabs({
  tabs,
  value,
  onChange,
  label = "Filter by category",
}: {
  tabs: CategoryTab[];
  value: string;
  onChange: (id: string) => void;
  label?: string;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const indicator = useRef<HTMLSpanElement>(null);
  const buttons = useRef(new Map<string, HTMLAnchorElement>());
  const [edges, setEdges] = useState({ start: false, end: false });
  const first = useRef(true);

  const updateEdges = useCallback(() => {
    const el = rail.current;
    if (!el) return;
    const start = el.scrollLeft > 4;
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
    setEdges((e) => (e.start === start && e.end === end ? e : { start, end }));
  }, []);

  /** Moves the underline to the active tab. Written to the DOM directly: it follows layout, not state. */
  const placeIndicator = useCallback(() => {
    const btn = buttons.current.get(value);
    const bar = indicator.current;
    if (!btn || !bar) return;
    bar.style.width = `${btn.offsetWidth - 24}px`;
    bar.style.transform = `translateX(${btn.offsetLeft + 12}px)`;
  }, [value]);

  useLayoutEffect(() => {
    placeIndicator();
    // No slide on first paint; animate only later changes.
    if (first.current && indicator.current) {
      indicator.current.style.transition = "none";
      void indicator.current.offsetWidth;
      indicator.current.style.transition = "";
      first.current = false;
    }
  }, [placeIndicator, tabs]);

  // Centre the active tab in the row.
  useEffect(() => {
    const el = rail.current;
    const btn = buttons.current.get(value);
    if (!el || !btn) return;
    el.scrollTo({ left: btn.offsetLeft - (el.clientWidth - btn.offsetWidth) / 2, behavior: "smooth" });
  }, [value]);

  // Web fonts and resizes change tab widths.
  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      placeIndicator();
      updateEdges();
    });
    ro.observe(el);
    for (const b of buttons.current.values()) ro.observe(b);
    return () => ro.disconnect();
  }, [placeIndicator, updateEdges, tabs]);

  const scrollBy = (dir: 1 | -1) => {
    const el = rail.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.7, behavior: "smooth" });
  };

  const mask = `linear-gradient(to right, ${edges.start ? "transparent, #000 40px" : "#000"}, ${
    edges.end ? "#000 calc(100% - 40px), transparent" : "#000"
  })`;

  return (
    <div className="relative">
      <div
        ref={rail}
        onScroll={updateEdges}
        className="no-scrollbar relative flex overflow-x-auto px-2 sm:px-4"
        style={{ maskImage: mask, WebkitMaskImage: mask }}
        role="group"
        aria-label={label}
      >
        {tabs.map((t) => {
          const active = t.id === value;
          const empty = !active && t.count === 0;
          return (
            <a
              key={t.id}
              ref={(el) => {
                if (el) buttons.current.set(t.id, el);
                else buttons.current.delete(t.id);
              }}
              href={t.href}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                e.preventDefault();
                if (!empty) onChange(t.id);
              }}
              aria-current={active ? "page" : undefined}
              aria-disabled={empty || undefined}
              title={t.title}
              className={`group relative flex h-12 shrink-0 items-center gap-1.5 px-3 text-[14px] transition-colors active:opacity-70 aria-disabled:opacity-30 ${
                active ? "text-foreground" : "text-muted hover:text-foreground"
              }`}
            >
              {/* The hidden bold copy reserves the active width, so tabs don't shift when selected. */}
              <span className="grid">
                <span className={`col-start-1 row-start-1 ${active ? "font-semibold" : "font-medium"}`}>{t.label}</span>
                <span className="invisible col-start-1 row-start-1 font-semibold" aria-hidden>
                  {t.label}
                </span>
              </span>
              <span
                className={`rounded-full px-1.5 py-px text-[10.5px] font-semibold tabular-nums transition-colors ${
                  active ? "bg-accent-soft text-accent" : "text-muted/80"
                }`}
              >
                {compactCount(t.count)}
              </span>
            </a>
          );
        })}
        <span
          ref={indicator}
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-0 h-[3px] rounded-t-full bg-accent transition-[transform,width] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
        />
      </div>

      {/* Arrow buttons for mouse users; touch users swipe. */}
      {(["start", "end"] as const).map((side) =>
        edges[side] ? (
          <button
            key={side}
            type="button"
            onClick={() => scrollBy(side === "start" ? -1 : 1)}
            aria-label={side === "start" ? "Scroll categories left" : "Scroll categories right"}
            className={`absolute top-1/2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-surface text-muted shadow-card transition hover:text-foreground [@media(hover:hover)]:flex ${
              side === "start" ? "left-1" : "right-1"
            }`}
          >
            <ChevronIcon className={`h-4 w-4 ${side === "start" ? "rotate-90" : "-rotate-90"}`} />
          </button>
        ) : null,
      )}
    </div>
  );
}
