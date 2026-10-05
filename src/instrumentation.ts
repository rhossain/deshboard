/** Runs once when the server starts. Set `NEWS_BACKGROUND_REFRESH=0` to fetch only when readers ask. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEWS_BACKGROUND_REFRESH === "0") return;
  const { startBackgroundRefresh } = await import("./lib/news");
  startBackgroundRefresh();
}
