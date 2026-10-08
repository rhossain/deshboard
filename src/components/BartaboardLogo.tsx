// Bartaboard lockup: the pinned-card mark (a raster, public/brand/bartaboard-icon.png) beside live text,
// so the name and tagline stay crisp at any size and follow the theme. Set in Montserrat (next/font, see
// layout.tsx): Black for the name, Light with wide tracking for the tagline. Everything is sized from the
// surrounding font-size, so `<BartaboardLogo className="text-2xl" />` scales the whole lockup.

export const BARTA_GREEN = "#26be60";

export function BartaboardIcon({ className = "" }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- static export, no image optimizer
  return <img src="/brand/bartaboard-icon.png" alt="" aria-hidden className={`select-none ${className}`} />;
}

export function BartaboardWordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`whitespace-nowrap font-brand font-black leading-[0.9] tracking-[-0.045em] ${className}`}>
      <span style={{ color: BARTA_GREEN }}>Barta</span>
      <span className="text-foreground">board</span>
    </span>
  );
}

export function BartaboardLogo({ tagline = false, className = "" }: { tagline?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center leading-none ${className}`} aria-label="Bartaboard">
      <BartaboardIcon className={`${tagline ? "h-[2.05em] -mr-[0.06em]" : "h-[1.3em] mr-[0.02em]"} w-auto shrink-0`} />
      <span className="flex flex-col">
        <BartaboardWordmark />
        {tagline && (
          <span className="mt-[0.5em] whitespace-nowrap pl-[0.1em] font-brand text-[0.285em] font-light tracking-[0.11em] text-muted">
            Bangladesh News. On Your Board.
          </span>
        )}
      </span>
    </span>
  );
}
