import Link from "next/link";
import type { ReactNode } from "react";
import { BartaboardLogo } from "./BartaboardLogo";

/** The site's own pages, linked from the foot of every page. */
export const SITE_LINKS = [
  { href: "/sources/", label: "All newspapers" },
  { href: "/videos/", label: "TV news videos" },
  { href: "/about/", label: "About" },
  { href: "/health/", label: "Source health" },
  { href: "/privacy/", label: "Privacy" },
  { href: "/terms/", label: "Terms" },
];

/**
 * A page of text under the logo (about, sources, privacy, terms): a heading, an optional intro and
 * "last updated" line, the body, and the site's links. `wide` for pages of lists rather than prose.
 */
export function InfoPage({
  title,
  intro,
  updated,
  wide = false,
  children,
}: {
  title: string;
  intro?: ReactNode;
  updated?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`mx-auto min-h-dvh px-4 pb-16 pt-[max(env(safe-area-inset-top),1.25rem)] sm:px-6 sm:pt-8 ${
        wide ? "max-w-6xl" : "max-w-2xl"
      }`}
    >
      <header>
        <Link href="/" className="inline-block text-[26px]" aria-label="Bartaboard home">
          <BartaboardLogo />
        </Link>
        <h1 className="mt-6 font-display text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        {updated && <p className="mt-2 text-sm text-muted">Last updated {updated}</p>}
        {intro && <div className="mt-4 max-w-2xl space-y-3 text-[15px] leading-relaxed text-muted">{intro}</div>}
      </header>

      {/* Prose gets its typography here; a wide page of lists styles its own. */}
      <div
        className={
          wide
            ? "mt-8"
            : "mt-8 space-y-4 text-[15px] leading-relaxed [&_a]:font-semibold [&_a]:text-accent [&_a:hover]:underline [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_li]:mt-1.5 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5"
        }
      >
        {children}
      </div>

      <footer className="mt-12 text-center text-xs text-muted">
        <Link href="/" className="font-semibold text-accent hover:underline">
          ← Back to the headlines
        </Link>
        <nav aria-label="Site" className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-2">
          {SITE_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-foreground">
              {l.label}
            </Link>
          ))}
        </nav>
      </footer>
    </div>
  );
}
