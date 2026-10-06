/** Runs once when the server starts. Set `NEWS_BACKGROUND_REFRESH=0` to fetch only when readers ask. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEWS_BACKGROUND_REFRESH === "0") return;
  const { startBackgroundRefresh } = await import("./lib/news");
  startBackgroundRefresh();
  // Pages carry the logos' measurements once they're prepared (see cachedLogoShapes).
  const { warmLogos } = await import("./lib/logos");
  void warmLogos();
}
