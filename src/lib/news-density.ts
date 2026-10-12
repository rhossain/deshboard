/**
 * How tightly the news is set: "comfortable" (the default) or "compact" (smaller type and less space
 * around each headline, so more fit on a screen). A compact choice is kept as <html
 * data-news-density="compact">, set before paint by NEWS_DENSITY_SCRIPT, and the headlines take it
 * from CSS (the `compact:` variant in globals.css), so the prerendered board never shifts.
 */
export type NewsDensity = "comfortable" | "compact";

export const NEWS_DENSITY_KEY = "bartaboard:news-density";
export const NEWS_DENSITY_ATTR = "data-news-density";

export const NEWS_DENSITY_SCRIPT = `try{if(localStorage.getItem(${JSON.stringify(NEWS_DENSITY_KEY)})==="compact")
document.documentElement.setAttribute(${JSON.stringify(NEWS_DENSITY_ATTR)},"compact")}catch(e){}`;
