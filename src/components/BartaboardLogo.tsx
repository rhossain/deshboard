// Bartaboard logo: the pinned news card with the Bangladesh map, and the lowercase wordmark, drawn as SVG with
// the text outlined (masters and the scripts that draw them: brand-kit/). One file per theme: the -light files
// have dark lettering for light backgrounds, the -dark files light lettering for dark ones; globals.css shows
// the one that matches the theme, including a saved choice. Sized from the surrounding font-size, so
// `<BartaboardLogo className="text-2xl" />` scales it. `tagline={false}` shows the mark and name only
// (bartaboard-header-*.svg), for the board's compact masthead where the tagline would be too small to read.
// The favicon (src/app/favicon.ico, icon.png), home-screen icon (src/app/apple-icon.png) and the
// manifest/structured-data icons (public/brand/bartaboard-icon-192.png, -512.png, -maskable-512.png) come from
// brand-kit/web.

/** The brand green: the flag green of the wordmark's "barta" and the map. */
export const BARTA_GREEN = "#006a4e";

// Both lockups share one frame (630 × 115): the mark sets the height either way.
const WIDTH = 630;
const HEIGHT = 115;

export function BartaboardLogo({ className = "", tagline = true }: { className?: string; tagline?: boolean }) {
  const file = tagline ? "logo" : "header";
  // Tall enough with the tagline that its line stays legible; the compact one matches the old masthead.
  const size = tagline ? "h-[2em]" : "h-[1.35em]";
  return (
    <span className={`inline-flex items-center leading-none ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- static export, no image optimizer */}
      <img
        src={`/brand/bartaboard-${file}-light.svg`}
        width={WIDTH}
        height={HEIGHT}
        alt="Bartaboard"
        // Lazy, so the browser skips the theme's other logo (display: none) rather than download both.
        loading="lazy"
        decoding="async"
        className={`logo-on-light ${size} w-auto max-w-none select-none`}
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- static export, no image optimizer */}
      <img
        src={`/brand/bartaboard-${file}-dark.svg`}
        width={WIDTH}
        height={HEIGHT}
        // Only one of the two shows; the other is hidden from screen readers so the name isn't read twice.
        alt=""
        aria-hidden
        loading="lazy"
        decoding="async"
        className={`logo-on-dark ${size} w-auto max-w-none select-none`}
      />
    </span>
  );
}
