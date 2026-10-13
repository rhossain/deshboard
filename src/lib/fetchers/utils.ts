/** Collapse whitespace and decode the handful of entities that survive parsing. */
export function cleanTitle(input: unknown): string {
  const s = textOf(input)
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
  return s;
}

/** fast-xml-parser yields strings, numbers or `{ "#text": ... }` objects. */
export function textOf(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return textOf(v[0]);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("#text" in o) return textOf(o["#text"]);
    if ("@_href" in o) return textOf(o["@_href"]);
  }
  return "";
}

export function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

/**
 * Parse the date formats seen on BD feeds, e.g.
 * "Sun, 04 Oct 2026 22:31:55 +0600", "2026-10-04 22:39:44 GMT+6",
 * "2026-10-05T00:11:06+06:00", "2026-10-04 22:00:00" (assumed Dhaka time).
 */
export function parseDate(input: unknown): string | undefined {
  let s = textOf(input).trim();
  if (!s) return undefined;
  // A date with no time ("2026-10-13": Channel 24's sitemap) would read as 6 a.m. Dhaka, out of order
  // with every timed headline. Left out, the headline is timed by when it was first seen instead.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;

  s = s
    .replace(/GMT\s*\+\s*6(?::?00)?\b/i, "+06:00")
    .replace(/\s\+06$/, " +06:00");

  // "YYYY-MM-DD HH:mm(:ss)" with no zone → treat as Asia/Dhaka (UTC+6)
  const bare = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)$/.exec(s);
  if (bare) s = `${bare[1]}T${bare[2].length === 5 ? bare[2] + ":00" : bare[2]}+06:00`;

  // "YYYY-MM-DD HH:mm:ss +06:00" → ISO
  const spaced = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ?([+-]\d{2}:?\d{2})$/.exec(s);
  if (spaced) s = `${spaced[1]}T${spaced[2]}${spaced[3]}`;

  // Any other time with no zone ("Sun, 04 Oct 2026 22:31:55", "… 10:31 PM") is Dhaka time too, not the
  // zone of the machine that runs the fetch.
  if (/\s\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]\.?m\.?)?$/i.test(s)) s += " +0600";

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return undefined;
  // Ignore obviously wrong dates (e.g. far in the future)
  if (d.getTime() > Date.now() + 36 * 3600_000) return undefined;
  return d.toISOString();
}

/** Reinterpret a time that was Dhaka wall-clock but labelled UTC (some feeds do this): subtract 6 hours. */
export function shiftDhakaAsUtc(iso: string | undefined): string | undefined {
  return iso && new Date(new Date(iso).getTime() - 6 * 3600_000).toISOString();
}

/** Today's date in Asia/Dhaka as YYYY-MM-DD, optionally shifted by `offsetDays`. */
export function dhakaDate(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function resolveUrl(href: string, base: string): string | undefined {
  try {
    const u = new URL(href.trim(), base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return undefined;
    u.hash = "";
    return u.toString();
  } catch {
    return undefined;
  }
}

/** Query parameters that only say where a reader came from. */
const TRACKING = /^(utm_\w+|fbclid|gclid|ocid)$/i;

/**
 * One address for an article that sites (and Google News for them) give in several forms: its AMP page
 * (`/amp/bangladesh/…`, `…/amp`), behind `/index.php/`, or with tracking parameters. Other query
 * parameters stay: some sites name the article in them (`?id=…`).
 */
export function canonicalLink(link: string): string {
  try {
    const u = new URL(link);
    u.hostname = u.hostname.toLowerCase();
    u.pathname = u.pathname
      .replace(/^\/index\.php(?=\/)/, "")
      .replace(/^\/amp(?=\/.)/, "")
      .replace(/(.)\/amp\/?$/, "$1");
    for (const key of [...u.searchParams.keys()]) if (TRACKING.test(key)) u.searchParams.delete(key);
    u.hash = "";
    return u.toString();
  } catch {
    return link;
  }
}

/** What two addresses of the same article have in common: no scheme, `www.` or trailing slash. */
export const addressKey = (link: string) => link.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");

/** A headline's words, for telling one outlet's same headline at two addresses: case and spacing ignored. */
export const titleKey = (title: string) => title.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();

export function dedupeByLink<T extends { link: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((it) => {
    const key = addressKey(it.link);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
