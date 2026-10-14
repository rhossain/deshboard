import Link from "next/link";
import type { ReactNode } from "react";
import { type Locale, localePath } from "@/lib/i18n";
import { SOCIAL_LINKS, type SocialLink } from "@/lib/social";
import { STRINGS } from "@/lib/strings";
import { BartaboardLogo } from "./BartaboardLogo";
import { ConsentChoicesLink } from "./ConsentBanner";

/**
 * The site's own pages, linked from the foot of every page. `bn`: the page has a Bangla twin under
 * /bn, which Bangla pages link to instead.
 */
export const SITE_LINKS: { id: keyof (typeof STRINGS)["en"]["links"]; href: string; bn?: boolean }[] = [
  { id: "sources", href: "/sources", bn: true },
  { id: "videos", href: "/videos", bn: true },
  { id: "about", href: "/about", bn: true },
  { id: "health", href: "/health" },
  { id: "privacy", href: "/privacy", bn: true },
  { id: "terms", href: "/terms", bn: true },
];

/** A site link's address on a page in `locale`. */
export const siteLinkHref = (l: (typeof SITE_LINKS)[number], locale: Locale) =>
  l.bn ? localePath(l.href, locale) : l.href;

export function SocialIcon({ id, className = "h-5 w-5" }: { id: SocialLink["id"]; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      {id === "facebook" ? (
        <path
          fill="currentColor"
          d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07c0 6.02 4.39 11.01 10.13 11.91v-8.43H7.08v-3.48h3.05V9.41c0-3.03 1.79-4.7 4.53-4.7 1.31 0 2.69.24 2.69.24v2.97h-1.51c-1.5 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.48h-2.8v8.43C19.61 23.08 24 18.09 24 12.07Z"
        />
      ) : (
        <g fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" />
          <circle cx="12" cy="12" r="4.25" />
          <circle cx="17.6" cy="6.4" r="0.6" fill="currentColor" stroke="none" />
        </g>
      )}
    </svg>
  );
}

/** Bartaboard's social pages (src/lib/social.ts), as icons at the foot of every page. */
export function SocialLinks({ locale = "en" }: { locale?: Locale }) {
  const t = STRINGS[locale];
  return (
    <ul aria-label={t.follow} className="mt-4 flex justify-center gap-2">
      {SOCIAL_LINKS.map((l) => (
        <li key={l.id}>
          <a
            href={l.href}
            target="_blank"
            rel="me noopener"
            aria-label={t.followOn(locale === "bn" ? l.nameBn : l.name)}
            title={t.followOn(locale === "bn" ? l.nameBn : l.name)}
            className="flex h-10 w-10 items-center justify-center rounded-full text-muted transition hover:bg-surface-2 hover:text-foreground"
          >
            <SocialIcon id={l.id} />
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Thanks to the site whose idea Bartaboard builds on, at the foot of every page. */
export function InspiredBy({ locale = "en" }: { locale?: Locale }) {
  const [before, after] = STRINGS[locale].thanks;
  return (
    <p className="mt-3 text-center text-xs text-muted">
      {before}
      <a
        href="https://www.24livenewspaper.com/"
        target="_blank"
        rel="noopener"
        className="underline hover:text-foreground"
      >
        24livenewspaper.com
      </a>
      {after}
    </p>
  );
}

/**
 * A page of text under the logo (about, sources, privacy, terms): a heading, an optional intro and
 * "last updated" line, the body, and the site's links. `wide` for pages of lists rather than prose.
 * `locale` is the page's language; `other` is the same page in the other language, if there is one.
 */
export function InfoPage({
  title,
  intro,
  updated,
  wide = false,
  locale = "en",
  other,
  children,
}: {
  title: string;
  intro?: ReactNode;
  updated?: string;
  wide?: boolean;
  locale?: Locale;
  other?: string;
  children: ReactNode;
}) {
  const t = STRINGS[locale];
  const otherLocale: Locale = locale === "bn" ? "en" : "bn";
  return (
    <div
      lang={locale === "bn" ? "bn" : undefined}
      className={`mx-auto min-h-dvh px-4 pb-16 pt-[max(env(safe-area-inset-top),1.25rem)] sm:px-6 sm:pt-8 ${
        wide ? "max-w-6xl" : "max-w-2xl"
      }`}
    >
      <header>
        <div className="flex items-center justify-between gap-4">
          <Link href={localePath("/", locale)} className="inline-block text-[26px]" aria-label={t.home}>
            {/* The tagline is English, in the image itself. */}
            <BartaboardLogo tagline={locale !== "bn"} />
          </Link>
          {other && (
            <a
              href={other}
              hrefLang={otherLocale}
              lang={otherLocale}
              aria-label={`${t.switchLanguageShort}: ${t.switchLanguageLabel}`}
              title={t.switchLanguageLabel}
              className="inline-flex h-10 shrink-0 items-center justify-center rounded-full border border-line px-3 text-sm font-semibold text-foreground transition hover:bg-surface-2 active:scale-95"
            >
              {t.switchLanguageShort}
            </a>
          )}
        </div>
        <h1 className="mt-6 font-display text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        {updated && <p className="mt-2 text-sm text-muted">{t.lastUpdated(updated)}</p>}
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
        <Link href={localePath("/", locale)} className="font-semibold text-accent hover:underline">
          {t.backToHeadlines}
        </Link>
        <nav aria-label={t.siteNav} className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-2">
          {SITE_LINKS.map((l) => (
            <Link key={l.href} href={siteLinkHref(l, locale)} className="hover:text-foreground">
              {t.links[l.id]}
            </Link>
          ))}
          {other && (
            <a href={other} hrefLang={otherLocale} lang={otherLocale} className="font-semibold hover:text-foreground">
              {t.switchLanguage}
            </a>
          )}
          <ConsentChoicesLink />
        </nav>
        <SocialLinks locale={locale} />
        <InspiredBy locale={locale} />
      </footer>
    </div>
  );
}
