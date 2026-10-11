"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpIcon } from "./ui";

// Ring around the arrow that fills with how far down the page the reader is.
const R = 20;
const CIRCUMFERENCE = 2 * Math.PI * R;

/** A round button pinned to the bottom corner that appears after a screen of scrolling and returns to the top. */
export function BackToTop() {
  const [shown, setShown] = useState(false);
  const ring = useRef<SVGCircleElement>(null);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const y = window.scrollY;
      setShown(y > window.innerHeight * 0.8);
      // Written to the DOM directly so scrolling doesn't re-render.
      ring.current?.setAttribute("stroke-dashoffset", String(CIRCUMFERENCE * (1 - (max > 0 ? Math.min(y / max, 1) : 0))));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  const toTop = () => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "instant" : "smooth" });
  };

  return (
    <button
      type="button"
      onClick={toTop}
      aria-label="Back to top"
      title="Back to top"
      aria-hidden={!shown}
      tabIndex={shown ? 0 : -1}
      className={`back-to-top group fixed right-4 z-30 grid h-12 w-12 place-items-center rounded-full border border-line bg-surface/90 text-foreground shadow-card backdrop-blur-xl backdrop-saturate-150 transition duration-300 ease-out hover:text-accent active:scale-90 md:right-6 ${
        shown ? "translate-y-0 scale-100 opacity-100" : "pointer-events-none translate-y-4 scale-75 opacity-0"
      }`}
    >
      <svg viewBox="0 0 48 48" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden>
        <circle cx="24" cy="24" r={R} fill="none" strokeWidth="2.5" className="stroke-line" />
        <circle
          ref={ring}
          cx="24"
          cy="24"
          r={R}
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE}
          className="stroke-accent"
        />
      </svg>
      <ArrowUpIcon className="relative h-5 w-5 transition-transform duration-200 group-hover:-translate-y-0.5" />
    </button>
  );
}
