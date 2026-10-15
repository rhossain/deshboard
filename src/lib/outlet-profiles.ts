/**
 * A few lines about each outlet, in English and Bangla, for its page (src/components/pages/OutletPage.tsx): what it
 * is, since when, from where. Each language's page gets its own text, so the English and Bangla pages of an outlet
 * aren't the same headlines in two wrappers (search engines kept only one of each pair).
 *
 * Facts were checked against the outlets' own pages, Wikipedia and the press in October 2026; a fact that couldn't
 * be confirmed is left out rather than guessed. No editors' names (they change), no opinions about outlets.
 * A test checks that every outlet with a page (directory.ts OUTLETS) has both texts.
 */
export interface OutletProfile {
  /** The year it started, when known: shown in the page's description. */
  since?: number;
  en: string;
  bn: string;
}

export const OUTLET_PROFILES: Record<string, OutletProfile> = {};

export const outletProfile = (id: string): OutletProfile | undefined => OUTLET_PROFILES[id];
