/**
 * Runs `fn` once the page has loaded and the browser is idle (at most `timeout` ms after loading), so
 * work that isn't for the reader's first look (analytics, the rest of the feed) doesn't compete with the
 * headlines, the fonts and hydration on a slow phone. Returns a function that cancels it.
 */
export function whenSettled(fn: () => void, timeout = 2000): () => void {
  let idle: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const wait = () => {
    if (typeof requestIdleCallback === "function") idle = requestIdleCallback(fn, { timeout });
    else timer = setTimeout(fn, 200);
  };
  if (document.readyState === "complete") wait();
  else window.addEventListener("load", wait, { once: true });
  return () => {
    window.removeEventListener("load", wait);
    if (idle !== undefined) cancelIdleCallback(idle);
    clearTimeout(timer);
  };
}
