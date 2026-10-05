const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";

export class FetchError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "FetchError";
  }
}

export interface FetchedText {
  text: string;
  url: string;
  contentType: string;
}

export interface FetchedBytes {
  bytes: ArrayBuffer;
  url: string;
  contentType: string;
}

interface FetchOptions {
  timeoutMs?: number;
  accept?: string;
}

/** GET a URL with a timeout and a browser-like User-Agent; errors become `FetchError`s. */
export async function fetchBytes(
  url: string,
  { timeoutMs = 12_000, accept = "*/*" }: FetchOptions = {},
): Promise<FetchedBytes> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: accept,
        "Accept-Language": "bn-BD,bn;q=0.9,en;q=0.8",
      },
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) throw new FetchError(`HTTP ${res.status}`, res.status);
    const bytes = await res.arrayBuffer();
    return { bytes, url: res.url || url, contentType: res.headers.get("content-type") ?? "" };
  } catch (err) {
    if (err instanceof FetchError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new FetchError(`Timed out after ${timeoutMs / 1000}s`);
    }
    const cause = err instanceof Error && err.cause instanceof Error ? `: ${err.cause.message}` : "";
    throw new FetchError(`${err instanceof Error ? err.message : String(err)}${cause}`);
  } finally {
    clearTimeout(timer);
  }
}

/** GET a URL as text with charset-aware decoding (falls back to UTF-8). */
export async function fetchText(url: string, options: FetchOptions = {}): Promise<FetchedText> {
  const { bytes, url: finalUrl, contentType } = await fetchBytes(url, options);
  const charset = /charset=([\w-]+)/i.exec(contentType)?.[1]?.toLowerCase() ?? "utf-8";
  let text: string;
  try {
    text = new TextDecoder(charset).decode(bytes);
  } catch {
    text = new TextDecoder("utf-8").decode(bytes);
  }
  return { text, url: finalUrl, contentType };
}

/** Many BD sites return an HTML page with status 200 instead of a real 404. */
export function looksLikeXml(text: string): boolean {
  const head = text.trimStart().slice(0, 500).toLowerCase();
  if (head.startsWith("<!doctype html") || head.startsWith("<html")) return false;
  return head.startsWith("<?xml") || /<(rss|feed|urlset|sitemapindex|rdf:rdf)[\s>]/.test(head);
}
