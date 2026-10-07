// Dates and times are formatted by hand rather than with Intl: the first Intl formatter a page builds
// (and the first localeCompare) stalls a slow phone while the browser loads its locale data, and the
// board needs one for every headline as it starts. The interface is English, and Bangladesh keeps
// UTC+6 all year (no daylight saving since 2009), so Dhaka time is a fixed offset.

const DHAKA_OFFSET_MS = 6 * 3600_000;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
// As en-GB abbreviates them ("Sept", not "Sep").
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];

/** The moment as Dhaka's wall clock, read with the getUTC… methods. */
function dhaka(t: number | string): Date {
  return new Date(new Date(t).getTime() + DHAKA_OFFSET_MS);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "16:01" */
export function dhakaClock(t: number | string): string {
  const d = dhaka(t);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** "Wednesday 7 October" */
export function dhakaDate(t: number | string): string {
  const d = dhaka(t);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "2026-10-07": the calendar day in Dhaka. */
export function dhakaDay(t: number | string): string {
  return dhaka(t).toISOString().slice(0, 10);
}

/** "7 Oct 2026, 16:01" */
export function fullTime(iso: string | undefined): string {
  if (!iso) return "";
  const d = dhaka(iso);
  return `${d.getUTCDate()} ${SHORT_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${dhakaClock(iso)}`;
}

function relative(n: number, unit: "minute" | "hour" | "day"): string {
  if (unit === "day" && Math.abs(n) === 1) return n < 0 ? "yesterday" : "tomorrow";
  const amount = `${Math.abs(n)} ${unit}${Math.abs(n) === 1 ? "" : "s"}`;
  return n < 0 ? `${amount} ago` : `in ${amount}`;
}

/** "just now", "5 minutes ago", "3 hours ago", "yesterday", "4 days ago" */
export function timeAgo(iso: string | undefined, now = Date.now()): string {
  if (!iso) return "";
  const diff = (new Date(iso).getTime() - now) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return "just now";
  if (abs < 3600) return relative(Math.round(diff / 60), "minute");
  if (abs < 86400) return relative(Math.round(diff / 3600), "hour");
  return relative(Math.round(diff / 86400), "day");
}

/** "4,828" */
export function formatCount(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** "999", "1.2K", "48K", "1M" */
export function compactCount(n: number): string {
  if (n < 1000) return String(n);
  const k = Math.round(n / 100) / 10;
  return k < 1000 ? `${k}K` : `${Math.round(k / 100) / 10}M`;
}
