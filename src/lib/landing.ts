/**
 * The address the reader arrived at, read once as the page's scripts load. The board rewrites the address
 * to its own filters as soon as it starts (NewsBoard), which drops anything else in it, such as an ad's
 * campaign tags (utm_source, utm_campaign…) and Facebook's click id (fbclid). Google Analytics and the
 * Meta Pixel start later (they wait for the consent check), so they read the arrival from here instead.
 *
 * Imported by components in the root layout, whose code runs before any page's effects.
 */
const href = typeof window === "undefined" ? null : window.location.href;

/** The full address of the page the reader landed on, tags included; null while prerendering. */
export const LANDING_URL = href;

/** A parameter of the landing address (`fbclid`, `utm_source`…), or null. */
export function landingParam(name: string): string | null {
  if (!href) return null;
  try {
    return new URL(href).searchParams.get(name);
  } catch {
    return null;
  }
}

/** Whether the reader is still on the page they landed on (path only: the board changes the query). */
export const stillOnLanding = () => !!href && new URL(href).pathname === window.location.pathname;
