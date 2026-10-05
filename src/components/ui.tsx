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

export function Chip({
  active,
  onClick,
  label,
  title,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  title?: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      disabled={!active && count === 0}
      className={`inline-flex h-9 shrink-0 snap-start items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition active:scale-95 disabled:opacity-40 ${
        active
          ? "border-foreground bg-foreground text-background"
          : "border-line bg-surface text-foreground/80 hover:border-foreground/30"
      }`}
    >
      {label}
      <span className={`tabular-nums text-[11px] ${active ? "opacity-70" : "text-muted"}`}>
        {count.toLocaleString()}
      </span>
    </button>
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
