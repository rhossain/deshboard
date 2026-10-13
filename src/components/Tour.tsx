"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocale, useStrings } from "./locale";
import { formatCount } from "./time";
import { CloseIcon } from "./ui";

type StepId =
  | "welcome"
  | "sections"
  | "views"
  | "search"
  | "categories"
  | "pins"
  | "save"
  | "filters"
  | "refresh"
  | "language"
  | "done";

/**
 * The tour's stops, in order. `targets` are tried in turn and the first one on screen is lit up (the
 * desktop and phone layouts put some controls in different places); a stop whose targets are all
 * missing (Top stories has no ⋮ until the headlines load, say) is left out. No targets: a card in the middle.
 */
const STEPS: { id: StepId; targets?: string[] }[] = [
  { id: "welcome" },
  { id: "sections", targets: ['[data-tour="sections"]', "[data-bottom-nav]"] },
  { id: "views", targets: ['[data-tour="views"]'] },
  { id: "search", targets: ['[data-tour="search"]'] },
  { id: "categories", targets: ['[data-tour="categories"]'] },
  { id: "pins", targets: ['[data-tour="pins"]'] },
  { id: "save", targets: ['main button[aria-haspopup="menu"]'] },
  { id: "filters", targets: ['[data-tour="filters"]', '[data-tour="filters-phone"]'] },
  { id: "refresh", targets: ['[data-tour="refresh"]'] },
  { id: "language", targets: ['[data-tour="language"]'] },
  { id: "done" },
];

/** Whether the reader has seen (or turned down) the tour; the invitation shows once. */
const KEY = "bartaboard:tour";

export function tourSeen(): boolean {
  try {
    return localStorage.getItem(KEY) === "seen";
  } catch {
    return true; // Storage unavailable: don't invite on every page view.
  }
}

export function markTourSeen() {
  try {
    localStorage.setItem(KEY, "seen");
  } catch {
    // Storage unavailable: nothing to remember it in.
  }
}

/** The first of `selectors` that is on screen: laid out, and not in a folded card. */
function findTarget(selectors: string[]): HTMLElement | null {
  for (const selector of selectors) {
    for (const el of document.querySelectorAll<HTMLElement>(selector)) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && !el.closest("[inert]")) return el;
    }
  }
  return null;
}

/** Room around the lit-up control, and between it and the card. */
const PAD = 6;
const GAP = 12;
const GUTTER = 16;

type Box = { top: number; left: number; width: number; height: number };

/**
 * A step-by-step walkthrough of the board's features. Each stop dims the page around one control and
 * explains it in a card beside it. A modal dialog: the page underneath can't be used meanwhile, and
 * Escape (or Skip) ends it. ← and → move between stops.
 */
export function Tour({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useStrings();
  const locale = useLocale();
  const dialog = useRef<HTMLDialogElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const spot = useRef<HTMLDivElement>(null);
  const nextButton = useRef<HTMLButtonElement>(null);
  // The stops this page can show, worked out as the tour opens.
  const [steps, setSteps] = useState<typeof STEPS>([]);
  const [at, setAt] = useState(0);
  // Whether the reader has moved from the first stop: from then on each stop is read out as it comes.
  const [moved, setMoved] = useState(false);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) {
      // A frame first, so a section the board just switched to has drawn its controls.
      const frame = requestAnimationFrame(() => {
        setSteps(STEPS.filter((s) => !s.targets || findTarget(s.targets)));
        setAt(0);
        setMoved(false);
        el.showModal();
      });
      return () => cancelAnimationFrame(frame);
    }
    if (!open && el.open) el.close();
  }, [open]);

  const step = steps[at];

  /** Lights up the current stop's control and places the card beside it (or in the middle). */
  const place = useCallback(() => {
    const box = card.current;
    const lit = spot.current;
    if (!step || !box || !lit) return;
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const target = step.targets && findTarget(step.targets);
    const h = box.offsetHeight;
    const w = box.offsetWidth;
    const put = (el: HTMLElement, b: Partial<Box>) => {
      for (const [k, v] of Object.entries(b)) el.style.setProperty(k, `${v}px`);
    };
    if (!target) {
      put(lit, { top: vh / 2, left: vw / 2, width: 0, height: 0 });
      put(box, { top: (vh - h) / 2, left: (vw - w) / 2 });
      return;
    }
    const r = target.getBoundingClientRect();
    const around = {
      top: r.top - PAD,
      left: Math.max(PAD / 2, r.left - PAD),
      width: Math.min(vw - PAD, r.width + PAD * 2),
      height: r.height + PAD * 2,
    };
    put(lit, around);
    // Below the control when it fits, else above it, else over the bottom of the screen.
    const below = around.top + around.height + GAP;
    const above = around.top - GAP - h;
    const top = below + h <= vh - GUTTER ? below : above >= GUTTER ? above : vh - GUTTER - h;
    const left = Math.min(Math.max(GUTTER, r.left + r.width / 2 - w / 2), vw - GUTTER - w);
    put(box, { top, left });
  }, [step]);

  // Bring each stop's control into view, then place everything; and again as the page moves.
  useLayoutEffect(() => {
    if (!step) return;
    const target = step.targets && findTarget(step.targets);
    if (target) {
      const r = target.getBoundingClientRect();
      if (r.top < 0 || r.bottom > window.innerHeight) target.scrollIntoView({ block: "center" });
    }
    place();
    nextButton.current?.focus();
  }, [step, place]);
  useEffect(() => {
    if (!step) return;
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, { capture: true, passive: true });
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, { capture: true });
    };
  }, [step, place]);

  const last = at === steps.length - 1;
  const next = () => {
    if (last) return onClose();
    setAt(at + 1);
    setMoved(true);
  };
  const back = () => {
    setAt(Math.max(0, at - 1));
    setMoved(true);
  };
  const text = step && t.tour.steps[step.id];

  return (
    <dialog
      ref={dialog}
      className="tour"
      aria-label={t.tour.label}
      onClose={() => {
        onClose();
        // Focus goes back where it was, unless that is gone (the invitation that started the tour).
        if (document.activeElement === document.body) document.querySelector("main")?.focus({ preventScroll: true });
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") next();
        else if (e.key === "ArrowLeft") back();
      }}
    >
      {open && step && text && (
        <>
          {/* The page dimmed around the lit-up control; with no control, all of it. */}
          <div ref={spot} className="tour-spot" aria-hidden />
          <div
            ref={card}
            role="group"
            aria-roledescription={t.tour.label}
            aria-labelledby="tour-title"
            aria-describedby="tour-body"
            className="tour-card absolute w-[min(22rem,calc(100%-2rem))] rounded-2xl border border-line bg-surface p-5 text-foreground shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gold">
                {t.tour.step(formatCount(at + 1, locale), formatCount(steps.length, locale))}
              </p>
              <button
                type="button"
                onClick={onClose}
                aria-label={t.tour.skip}
                className="-mr-2 -mt-2 flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-foreground"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>
            <h2 id="tour-title" className="mt-1 font-display text-xl font-semibold">
              {text.title}
            </h2>
            <p id="tour-body" className="mt-2 text-sm leading-relaxed text-muted">
              {text.body}
            </p>
            {/* Focus stays on Next, so each new stop is announced here; the first comes with the card's name. */}
            <p className="sr-only" aria-live="polite">
              {moved ? `${text.title}. ${text.body}` : ""}
            </p>
            <div className="mt-5 flex items-center gap-2">
              <div className="flex gap-1" aria-hidden>
                {steps.map((s, i) => (
                  <span key={s.id} className={`h-1.5 rounded-full transition-all ${i === at ? "w-4 bg-accent" : "w-1.5 bg-line"}`} />
                ))}
              </div>
              <div className="ml-auto flex gap-2">
                {at > 0 ? (
                  <button
                    type="button"
                    onClick={back}
                    className="h-10 rounded-full border border-line px-4 text-sm font-semibold transition hover:bg-surface-2 active:scale-95"
                  >
                    {t.tour.back}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onClose}
                    className="h-10 rounded-full px-3 text-sm font-semibold text-muted transition hover:text-foreground"
                  >
                    {t.tour.skip}
                  </button>
                )}
                <button
                  type="button"
                  ref={nextButton}
                  onClick={next}
                  className="h-10 rounded-full bg-foreground px-5 text-sm font-semibold text-background transition hover:opacity-90 active:scale-95"
                >
                  {last ? t.tour.finish : t.tour.next}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </dialog>
  );
}

/**
 * Offers the tour once, to a reader who hasn't seen it, a few seconds after the page has settled: a
 * small card at the foot of the screen that never moves the page.
 */
export function TourInvite({ onStart }: { onStart: () => void }) {
  const t = useStrings();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (tourSeen()) return;
    const timer = setTimeout(() => setShow(true), 4000);
    return () => clearTimeout(timer);
  }, []);

  if (!show) return null;
  const dismiss = () => {
    markTourSeen();
    setShow(false);
  };
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-30 flex justify-center px-4 md:bottom-8" role="status">
      <div className="tour-invite pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border border-line bg-surface p-3 pl-4 shadow-card">
        <p className="min-w-0 flex-1 text-sm">{t.tour.invite}</p>
        <button
          type="button"
          onClick={() => {
            dismiss();
            onStart();
          }}
          className="h-10 shrink-0 rounded-full bg-accent px-4 text-sm font-semibold text-accent-ink transition active:scale-95"
        >
          {t.tour.start}
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t.tour.later}
          title={t.tour.later}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-foreground"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
