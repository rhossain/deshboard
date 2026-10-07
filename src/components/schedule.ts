/** How often new headlines and videos are published (the timer that starts .github/workflows/deploy.yml). */
export const UPDATE_EVERY_MS = 15 * 60 * 1000;
/** The build takes about a minute and Hostinger then copies it, so look for it this long after it's due. */
export const PUBLISH_LAG_MS = 2 * 60 * 1000;
/** While an update is overdue, look again this often. */
export const RETRY_MS = 60 * 1000;
/** Scrolled less than this, new items replace the list at once: nothing the reader is on moves. */
export const AT_TOP_PX = 200;
