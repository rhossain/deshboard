// Bartaboard logo: the pinned-card mark, name and tagline as one image per theme, trimmed and resized from the
// 2107px originals in public/brand (bartaboard-logo-light.png has dark lettering for light backgrounds,
// bartaboard-logo-dark.png light lettering for dark ones) to 160px-tall WebP, about 30 KB each. globals.css
// shows the one that matches the theme, including a saved choice. Sized from the surrounding font-size, so
// `<BartaboardLogo className="text-2xl" />` scales it. The favicon (src/app/icon.png), home-screen icon
// (src/app/apple-icon.png) and the manifest/structured-data icons (public/brand/bartaboard-icon-192.png, -512.png)
// are resized from the mark alone (public/brand/bartaboard-icon.png). `tagline={false}` shows the mark and name
// only (bartaboard-wordmark-*.webp, the same originals with the tagline erased, 120px tall), for the board's
// compact masthead where the tagline would be too small to read.

export const BARTA_GREEN = "#26be60";

export function BartaboardLogo({ className = "", tagline = true }: { className?: string; tagline?: boolean }) {
  const [file, width, height] = tagline ? ["logo", 746, 160] : ["wordmark", 554, 120];
  return (
    <span className={`inline-flex items-center leading-none ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- static export, no image optimizer */}
      <img
        src={`/brand/bartaboard-${file}-light.webp`}
        width={width}
        height={height}
        alt="Bartaboard"
        // Lazy, so the browser skips the theme's other logo (display: none) rather than download both.
        loading="lazy"
        decoding="async"
        className="logo-on-light h-[1.5em] w-auto max-w-none select-none"
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- static export, no image optimizer */}
      <img
        src={`/brand/bartaboard-${file}-dark.webp`}
        width={width}
        height={height}
        // Only one of the two shows; the other is hidden from screen readers so the name isn't read twice.
        alt=""
        aria-hidden
        loading="lazy"
        decoding="async"
        className="logo-on-dark h-[1.5em] w-auto max-w-none select-none"
      />
    </span>
  );
}
