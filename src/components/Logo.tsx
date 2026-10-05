// Brand mark and wordmark. The mark is a sun rising over two headline rows: the red disc on green
// echoes the Bangladesh flag ("Desh"), the rows are the news "board". Colours are fixed, not theme
// tokens, so the mark looks the same everywhere; src/app/icon.svg and apple-icon.tsx reuse the geometry.

export const BRAND_GREEN = "#0c6b4f";
export const BRAND_RED = "#f42a41";

export function LogoMark({ size, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill={BRAND_GREEN} />
      <path d="M9 16a7 7 0 0 1 14 0z" fill={BRAND_RED} />
      <rect x="7" y="18.5" width="18" height="2.4" rx="1.2" fill="#ffffff" />
      <rect x="7" y="22.6" width="11" height="2.4" rx="1.2" fill="#ffffff" fillOpacity="0.6" />
    </svg>
  );
}

/** One-line logo sized by the surrounding font-size: "Desh" in the serif accent, "board" in sans. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-[0.28em] leading-none ${className}`}>
      <LogoMark className="h-[0.92em] w-[0.92em] shrink-0" />
      <span className="whitespace-nowrap">
        <span className="font-display font-semibold tracking-tight text-accent">Desh</span>
        <span className="font-sans font-bold tracking-[-0.04em]">board</span>
      </span>
    </span>
  );
}
