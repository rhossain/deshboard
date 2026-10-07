"use client";

import { useEffect, useId, useRef, useState, type ReactNode, type KeyboardEvent, type ToggleEvent } from "react";
import { flushSync } from "react-dom";

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  full = false,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
  full?: boolean;
}) {
  return (
    <div
      className={`${full ? "flex" : "inline-flex"} rounded-xl border border-line bg-surface-2 p-1`}
      role="group"
      aria-label={label}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`flex-1 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${
            value === o.value
              ? "bg-surface text-foreground shadow-card ring-1 ring-line"
              : "text-muted hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Icon({ children, className = "h-5 w-5" }: { children: ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function RefreshIcon({ spinning, className }: { spinning?: boolean; className?: string }) {
  return (
    <Icon className={`${className ?? "h-5 w-5"} ${spinning ? "animate-spin" : ""}`}>
      <path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v4.5h-4.5" />
    </Icon>
  );
}

export const SearchIcon = (p: { className?: string }) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.2-4.2" />
  </Icon>
);

export const CloseIcon = (p: { className?: string }) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);

export const SlidersIcon = (p: { className?: string }) => (
  <Icon {...p}>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </Icon>
);

export const GridIcon = (p: { className?: string }) => (
  <Icon {...p}>
    <rect x="4" y="4" width="7" height="7" rx="1.5" />
    <rect x="13" y="4" width="7" height="7" rx="1.5" />
    <rect x="4" y="13" width="7" height="7" rx="1.5" />
    <rect x="13" y="13" width="7" height="7" rx="1.5" />
  </Icon>
);

export const NewspaperIcon = (p: { className?: string }) => (
  <Icon {...p}>
    <path d="M5 5.5A1.5 1.5 0 0 1 6.5 4h10A1.5 1.5 0 0 1 18 5.5V18a2 2 0 0 0 2 2H7a2 2 0 0 1-2-2z" />
    <path d="M18 9h1.5A1.5 1.5 0 0 1 21 10.5V18a2 2 0 0 1-2 2" />
    <path d="M8.5 8h6M8.5 11.5h6M8.5 15h3.5" />
  </Icon>
);

export const VideoIcon = (p: { className?: string }) => (
  <Icon {...p}>
    <rect x="3" y="5" width="18" height="14" rx="3" />
    <path d="M10.5 9.5v5l4-2.5z" />
  </Icon>
);

export const ClockIcon = (p: { className?: string }) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8v4l2.5 2" />
  </Icon>
);

export const ChevronIcon = (p: { className?: string }) => (
  <Icon {...p}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
);

export const ArrowUpRightIcon = (p: { className?: string }) => (
  <Icon {...p}>
    <path d="M7 17 17 7M8 7h9v9" />
  </Icon>
);

export const AlertIcon = (p: { className?: string }) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8v4.5M12 16h.01" />
  </Icon>
);

export const SunIcon = (p: { className?: string }) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3.5" />
    <path d="M12 3v1.5M12 19.5V21M3 12h1.5M19.5 12H21M5.6 5.6l1.1 1.1M17.3 17.3l1.1 1.1M5.6 18.4l1.1-1.1M17.3 6.7l1.1-1.1" />
  </Icon>
);

export const MoonIcon = (p: { className?: string }) => (
  <Icon {...p}>
    <path d="M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10Z" />
  </Icon>
);

/** Half-filled circle: "follow the system". */
export const AutoThemeIcon = (p: { className?: string }) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" />
  </Icon>
);

/** Stacked pages: one story told by several outlets. */
export const StackIcon = (p: { className?: string }) => (
  <Icon {...p}>
    <rect x="4" y="9" width="16" height="11" rx="2" />
    <path d="M6.5 6h11M9 3h6" />
  </Icon>
);

/** The small dot that marks a headline published since the reader's last visit. */
export function NewDot({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full bg-gold align-middle ${className}`}
      title="New since your last visit"
    >
      <span className="sr-only">New: </span>
    </span>
  );
}

export const BookmarkIcon = ({ filled, className }: { filled?: boolean; className?: string }) => (
  <Icon className={className}>
    <path d="M7 4.5h10a1 1 0 0 1 1 1V20l-6-4-6 4V5.5a1 1 0 0 1 1-1Z" fill={filled ? "currentColor" : "none"} />
  </Icon>
);

/** A pinned source or channel: one of the reader's own, shown first. */
export const StarIcon = ({ filled, className }: { filled?: boolean; className?: string }) => (
  <Icon className={className}>
    <path
      d="m12 3.8 2.5 5.1 5.6.8-4 4 .9 5.6-5-2.7-5 2.7.9-5.6-4-4 5.6-.8Z"
      fill={filled ? "currentColor" : "none"}
    />
  </Icon>
);

export const ArrowUpIcon = (p: { className?: string }) => (
  <Icon {...p}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Icon>
);

export const ShareIcon = (p: { className?: string }) => (
  <Icon {...p}>
    <path d="M12 15V4M8 7.5 12 3.5l4 4" />
    <path d="M8.5 10.5H7a2 2 0 0 0-2 2V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6.5a2 2 0 0 0-2-2h-1.5" />
  </Icon>
);

export const LinkIcon = (p: { className?: string }) => (
  <Icon {...p}>
    <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
  </Icon>
);

// The three dots as one path: every headline has these, so each element saved counts hundreds of times.
export const DotsIcon = (p: { className?: string }) => (
  <Icon {...p}>
    <path
      d="M12 4.1a1.4 1.4 0 1 0 0 2.8a1.4 1.4 0 1 0 0-2.8ZM12 10.6a1.4 1.4 0 1 0 0 2.8a1.4 1.4 0 1 0 0-2.8ZM12 17.1a1.4 1.4 0 1 0 0 2.8a1.4 1.4 0 1 0 0-2.8Z"
      fill="currentColor"
      stroke="none"
    />
  </Icon>
);

// A row is h-10, plus the menu's padding; used to flip the menu above the button near the bottom edge.
const menuHeight = (rows: number) => rows * 40 + 16;

/**
 * The ⋮ menu beside a headline (never inside its link) with Share and Save. The menu is a native
 * popover, so it sits above cards that clip their overflow and closes on outside tap or Escape.
 * The dots turn gold while the headline is saved. Its items are only rendered while it's open: the
 * board has hundreds of these.
 */
export function ItemMenu({
  saved,
  onToggleSave,
  onShare,
  extra,
  className = "",
}: {
  saved: boolean;
  onToggleSave: () => void;
  onShare: () => void;
  /** One more item after Save, such as pinning the video's channel. */
  extra?: { label: string; icon: ReactNode; onSelect: () => void };
  className?: string;
}) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  // The menu is pinned to where the button was; any scroll or resize closes it rather than leaving it behind.
  useEffect(() => {
    if (!open) return;
    const close = () => menu.current?.hidePopover();
    window.addEventListener("scroll", close, { capture: true, passive: true });
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, { capture: true });
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const place = (e: ToggleEvent<HTMLDivElement>) => {
    if (e.newState !== "open") return;
    // Render the items before the menu shows, so it never appears empty.
    flushSync(() => setOpen(true));
    const el = menu.current;
    // Anchor to the dots, not the button: the button stretches to the full height of the headline row.
    const r = button.current?.firstElementChild?.getBoundingClientRect();
    if (!el || !r) return;
    el.style.right = `${Math.max(8, window.innerWidth - r.right)}px`;
    if (r.bottom + menuHeight(extra ? 3 : 2) + 8 > window.innerHeight) {
      el.style.top = "auto";
      el.style.bottom = `${window.innerHeight - r.top + 6}px`;
    } else {
      el.style.bottom = "auto";
      el.style.top = `${r.bottom + 6}px`;
    }
  };

  const items = () => Array.from(menu.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const all = items();
    const at = all.indexOf(document.activeElement as HTMLElement);
    all[(at + (e.key === "ArrowDown" ? 1 : all.length - 1)) % all.length]?.focus();
  };

  const run = (action: () => void) => () => {
    menu.current?.hidePopover();
    action();
  };

  const row =
    "flex h-10 w-full items-center gap-3 whitespace-nowrap rounded-lg px-3 text-left text-sm font-medium text-foreground outline-none transition hover:bg-surface-2 focus-visible:bg-surface-2";

  return (
    <>
      <button
        ref={button}
        type="button"
        popoverTarget={id}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={saved ? "More actions (saved)" : "More actions"}
        title="More actions"
        className={`flex w-10 shrink-0 items-start justify-center pt-3 transition active:scale-90 ${
          saved ? "text-gold" : open ? "text-foreground" : "text-muted/60 hover:text-foreground"
        } ${className}`}
      >
        <DotsIcon className="h-[18px] w-[18px]" />
      </button>
      <div
        ref={menu}
        id={id}
        popover="auto"
        role="menu"
        onBeforeToggle={place}
        onToggle={(e) => {
          const isOpen = e.newState === "open";
          setOpen(isOpen);
          if (isOpen) items()[0]?.focus();
        }}
        onKeyDown={onKeyDown}
        className="fixed inset-auto m-0 min-w-48 rounded-xl border border-line bg-surface p-1 text-foreground shadow-card"
      >
        {open && (
          <>
            <button type="button" role="menuitem" onClick={run(onShare)} className={row}>
              <ShareIcon className="h-[18px] w-[18px] text-muted" />
              Share
            </button>
            <button type="button" role="menuitem" onClick={run(onToggleSave)} className={row}>
              <BookmarkIcon filled={saved} className={`h-[18px] w-[18px] ${saved ? "text-gold" : "text-muted"}`} />
              {saved ? "Remove from saved" : "Save for later"}
            </button>
            {extra && (
              <button type="button" role="menuitem" onClick={run(extra.onSelect)} className={row}>
                {extra.icon}
                {extra.label}
              </button>
            )}
          </>
        )}
      </div>
    </>
  );
}

/** A modal bottom sheet built on <dialog>, so focus trapping and Escape come from the browser. */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="sheet"
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      aria-label={title}
    >
      <div className="pb-safe rounded-t-3xl border border-line bg-surface shadow-2xl sm:rounded-3xl">
        <div className="px-5 pb-6 pt-3">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line sm:hidden" aria-hidden />
          <div className="mb-5 flex items-center justify-between">
            <h2 className="font-display text-2xl font-semibold">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-muted hover:text-foreground"
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>
          {children}
        </div>
      </div>
    </dialog>
  );
}
