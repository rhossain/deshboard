/**
 * Theme preference shared by the server layout (inline script) and the client toggle.
 * "system" follows the OS setting and is stored as no value at all.
 */
export type Theme = "system" | "light" | "dark";

export const THEME_KEY = "bd-news-desk:theme";

/** The page background per theme, for the browser's toolbar colour (<meta name="theme-color">). */
export const THEME_COLORS = { light: "#f6f4ef", dark: "#0e0f11" } as const;

/**
 * The browser toolbar colour (<meta name="theme-color">) is managed here rather than by Next's
 * viewport export: React hydrates its own <head> metas by attributes, so any pre-paint edit to them
 * makes React insert duplicates. THEME_SCRIPT appends two metas React never owns, one per colour
 * scheme; applyThemeColor keeps both pointing at the chosen theme. They are only ever edited.
 */
export const THEME_META_CLASS = "theme-color";

/** Points the two theme-color metas at `theme` ("system" = one colour per OS scheme). */
export function applyThemeColor(theme: Theme) {
  const metas = document.querySelectorAll<HTMLMetaElement>(`meta.${THEME_META_CLASS}`);
  (["light", "dark"] as const).forEach((scheme, i) => {
    if (metas[i]) metas[i].content = THEME_COLORS[theme === "system" ? scheme : theme];
  });
}

/**
 * Runs in <head> before first paint: applies a saved light/dark choice so the page never flashes the
 * other theme, and creates the theme-color metas (light scheme first, as applyThemeColor expects).
 */
export const THEME_SCRIPT = `(function(){var t;
try{t=localStorage.getItem(${JSON.stringify(THEME_KEY)})}catch(e){}
if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t);else t=null;
var c=${JSON.stringify(THEME_COLORS)};
["light","dark"].forEach(function(s){var m=document.createElement("meta");m.name="theme-color";
m.className=${JSON.stringify(THEME_META_CLASS)};m.media="(prefers-color-scheme: "+s+")";m.content=c[t||s];
document.head.appendChild(m)})})()`;
