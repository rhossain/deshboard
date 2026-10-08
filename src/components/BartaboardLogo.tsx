// Bartaboard lockup: the pinned-card mark (a raster: public/brand/bartaboard-icon.webp, 192px, resized from the
// 585px bartaboard-icon.png) beside live text, so the name and tagline stay crisp at any size and follow the
// theme. Set in Montserrat (next/font, see layout.tsx): Black for the name, Light with wide tracking for the
// tagline. Everything is sized from the surrounding font-size, so `<BartaboardLogo className="text-2xl" />`
// scales the whole lockup. The favicon (src/app/icon.png), home-screen icon (src/app/apple-icon.png) and the
// manifest/structured-data icons (public/brand/bartaboard-icon-192.png, -512.png) are resized from it too.

export const BARTA_GREEN = "#26be60";

export function BartaboardIcon({ className = "" }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- already a small WebP, sized by CSS
  return <img src="/brand/bartaboard-icon.webp" width={192} height={192} alt="" aria-hidden className={`select-none ${className}`} />;
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
