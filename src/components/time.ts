// Dates and times are formatted by hand rather than with Intl: the first Intl formatter a page builds
// (and the first localeCompare) stalls a slow phone while the browser loads its locale data, and the
// board needs one for every headline as it starts. Bangladesh keeps UTC+6 all year (no daylight
// saving since 2009), so Dhaka time is a fixed offset. Each function takes the page's locale: Bangla
// pages get Bangla month and day names and Bangla digits.

import { type Locale, localDigits } from "@/lib/i18n";

const DHAKA_OFFSET_MS = 6 * 3600_000;
const MONTHS: Record<Locale, string[]> = {
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  bn: ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"],
};
const WEEKDAYS: Record<Locale, string[]> = {
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  bn: ["রবিবার", "সোমবার", "মঙ্গলবার", "বুধবার", "বৃহস্পতিবার", "শুক্রবার", "শনিবার"],
};
const SHORT_WEEKDAYS: Record<Locale, string[]> = {
  en: WEEKDAYS.en.map((d) => d.slice(0, 3)),
  bn: ["রবি", "সোম", "মঙ্গল", "বুধ", "বৃহস্পতি", "শুক্র", "শনি"],
};
// As en-GB abbreviates them ("Sept", not "Sep"). Bangla month names are short enough as they are.
const SHORT_MONTHS: Record<Locale, string[]> = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"],
  bn: MONTHS.bn,
};

/** The moment as Dhaka's wall clock, read with the getUTC… methods. */
function dhaka(t: number | string): Date {
  return new Date(new Date(t).getTime() + DHAKA_OFFSET_MS);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "16:01" */
export function dhakaClock(t: number | string, locale: Locale = "en"): string {
  const d = dhaka(t);
  return localDigits(`${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`, locale);
}

/** "Wednesday 7 October", "বুধবার ৭ অক্টোবর" */
export function dhakaDate(t: number | string, locale: Locale = "en"): string {
  const d = dhaka(t);
  return localDigits(`${WEEKDAYS[locale][d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[locale][d.getUTCMonth()]}`, locale);
}

/** "Wed 7 Oct", "বুধ ৭ অক্টোবর" */
export function dhakaShortDate(t: number | string, locale: Locale = "en"): string {
  const d = dhaka(t);
  return localDigits(
    `${SHORT_WEEKDAYS[locale][d.getUTCDay()]} ${d.getUTCDate()} ${SHORT_MONTHS[locale][d.getUTCMonth()]}`,
    locale,
  );
}

/** "2026-10-07": the calendar day in Dhaka. */
export function dhakaDay(t: number | string): string {
  return dhaka(t).toISOString().slice(0, 10);
}

/** "7 Oct 2026, 16:01" */
export function fullTime(iso: string | undefined, locale: Locale = "en"): string {
  if (!iso) return "";
  const d = dhaka(iso);
  return localDigits(
    `${d.getUTCDate()} ${SHORT_MONTHS[locale][d.getUTCMonth()]} ${d.getUTCFullYear()}, ${dhakaClock(iso)}`,
    locale,
  );
}

const UNITS: Record<Locale, Record<"minute" | "hour" | "day", [string, string]>> = {
  en: { minute: ["minute", "minutes"], hour: ["hour", "hours"], day: ["day", "days"] },
  bn: { minute: ["মিনিট", "মিনিট"], hour: ["ঘণ্টা", "ঘণ্টা"], day: ["দিন", "দিন"] },
};

function relative(n: number, unit: "minute" | "hour" | "day", locale: Locale): string {
  const abs = Math.abs(n);
  if (unit === "day" && abs === 1) {
    if (locale === "bn") return n < 0 ? "গতকাল" : "আগামীকাল";
    return n < 0 ? "yesterday" : "tomorrow";
  }
  const amount = `${localDigits(String(abs), locale)} ${UNITS[locale][unit][abs === 1 ? 0 : 1]}`;
  if (locale === "bn") return n < 0 ? `${amount} আগে` : `${amount} পরে`;
  return n < 0 ? `${amount} ago` : `in ${amount}`;
}

/** "just now", "5 minutes ago", "3 hours ago", "yesterday", "4 days ago" */
export function timeAgo(iso: string | undefined, now = Date.now(), locale: Locale = "en"): string {
  if (!iso) return "";
  const diff = (new Date(iso).getTime() - now) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return locale === "bn" ? "এইমাত্র" : "just now";
  if (abs < 3600) return relative(Math.round(diff / 60), "minute", locale);
  if (abs < 86400) return relative(Math.round(diff / 3600), "hour", locale);
  return relative(Math.round(diff / 86400), "day", locale);
}

/** "4,828", "৪,৮২৮" */
export function formatCount(n: number, locale: Locale = "en"): string {
  return localDigits(String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","), locale);
}

/** "999", "1.2K", "48K", "1M"; in Bangla "১.২ হাজার", "৪৮ হাজার", "১০ লাখ" */
export function compactCount(n: number, locale: Locale = "en"): string {
  if (n < 1000) return localDigits(String(n), locale);
  const k = Math.round(n / 100) / 10;
  if (locale === "bn") {
    return localDigits(n < 100_000 ? `${k} হাজার` : `${Math.round(n / 10_000) / 10} লাখ`, locale);
  }
  return k < 1000 ? `${k}K` : `${Math.round(k / 100) / 10}M`;
}
