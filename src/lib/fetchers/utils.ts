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

  s = s
    .replace(/GMT\s*\+\s*6(?::?00)?\b/i, "+06:00")
    .replace(/\s\+06$/, " +06:00");

  // "YYYY-MM-DD HH:mm(:ss)" with no zone → treat as Asia/Dhaka (UTC+6)
  const bare = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)$/.exec(s);
  if (bare) s = `${bare[1]}T${bare[2].length === 5 ? bare[2] + ":00" : bare[2]}+06:00`;

  // "YYYY-MM-DD HH:mm:ss +06:00" → ISO
  const spaced = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ?([+-]\d{2}:?\d{2})$/.exec(s);
  if (spaced) s = `${spaced[1]}T${spaced[2]}${spaced[3]}`;

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return undefined;
  // Ignore obviously wrong dates (e.g. far in the future)
  if (d.getTime() > Date.now() + 36 * 3600_000) return undefined;
  return d.toISOString();
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

export function dedupeByLink<T extends { link: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((it) => {
    const key = it.link.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
