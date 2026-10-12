/**
 * The site's two interface languages. English pages keep their addresses; each Bangla page is the
 * same address under /bn/ (/bn/, /bn/news/sports/). Headlines are never translated: both show every
 * outlet's own words.
 */
export type Locale = "en" | "bn";
export const LOCALES: Locale[] = ["en", "bn"];

/** The language codes the pages declare (`<html lang>`, hreflang, Open Graph). */
export const LANG_TAG: Record<Locale, string> = { en: "en", bn: "bn" };
export const OG_LOCALE: Record<Locale, string> = { en: "en_US", bn: "bn_BD" };

/** An address in `locale`: "/news/sports/" → "/bn/news/sports/". `path` is the English address. */
export function localePath(path: string, locale: Locale): string {
  return locale === "bn" ? `/bn${path}` : path;
}

/** The locale an address is in, from its /bn/ prefix. */
export function pathLocale(pathname: string): Locale {
  return pathname === "/bn" || pathname.startsWith("/bn/") ? "bn" : "en";
}

/**
 * For a page that exists in both languages, its address in each (and x-default, the English one),
 * for <link rel="alternate" hreflang>.
 */
export function languageAlternates(path: string): Record<string, string> {
  return { en: path, bn: localePath(path, "bn"), "x-default": path };
}

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";

/** Western digits as Bangla ones on Bangla pages: "12:05" → "১২:০৫". */
export function localDigits(s: string, locale: Locale): string {
  return locale === "bn" ? s.replace(/[0-9]/g, (d) => BN_DIGITS[+d]) : s;
}
