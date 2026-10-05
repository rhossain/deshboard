"use client";

import type { ReactNode } from "react";

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

/** Saves or un-saves a headline. Sits beside the headline's link, never inside it. */
export function SaveButton({
  saved,
  onToggle,
  className = "",
}: {
  saved: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={saved}
      aria-label={saved ? "Remove from saved" : "Save for later"}
      title={saved ? "Remove from saved" : "Save for later"}
      className={`flex w-11 shrink-0 items-start justify-center pt-3 transition active:scale-90 ${
        saved ? "text-gold" : "text-muted/60 hover:text-foreground"
      } ${className}`}
    >
      <BookmarkIcon filled={saved} className="h-[18px] w-[18px]" />
    </button>
  );
}
