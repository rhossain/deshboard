import type { NewsSource, SourceStatus } from "./types";
import { isFetched } from "./sources";

export interface Problem {
  /** Plain-language explanation for readers. */
  message: string;
  /** The technical reason (fetch error or source note), for a tooltip. */
  detail?: string;
}

/** Ordered: the first pattern that matches the technical text wins. */
const EXPLANATIONS: [RegExp, string][] = [
  [/ENOTFOUND|EAI_AGAIN|DNS/i, "The site could not be reached; its address may have changed."],
  [/\b40[123]\b|\b451\b|bot blocking|robots\.txt/i, "The site is blocking automated access to its headlines."],
  [/\b429\b/, "The site is limiting requests right now. Try again in a few minutes."],
  [/HTTP 5\d\d|maintenance/i, "The site is having problems or is under maintenance."],
  [/\b404\b|not found/i, "The site's news feed could not be found; its address may have changed."],
  [/redirect loop/i, "The site's news feed is broken (it redirects endlessly)."],
  [/Timed out|timeout/i, "The site took too long to respond."],
  [/certificate|SSL|TLS/i, "The site's security certificate could not be verified."],
  [/ECONNREFUSED|ECONNRESET|fetch failed/i, "The site could not be reached."],
  [/articlePattern|layout may have changed/i, "No headlines were found on the homepage; the site's layout may have changed."],
  [/not XML|soft 404|returns? (the )?homepage|returns? HTML/i, "The site's feed returns a web page instead of headlines."],
  [/no titles|no news:title/i, "The site's feed lists links but no headlines."],
  [/JS-rendered|live stream only/i, "The site loads its headlines with JavaScript, so they can't be read directly."],
  [/stale|inactive/i, "The site's feed hasn't been updated recently."],
  [/empty/i, "The site's feed has no headlines right now."],
];

function explain(text: string): string | undefined {
  return EXPLANATIONS.find(([re]) => re.test(text))?.[1];
}

/**
 * For a source whose headlines came from Google News: a short label, and why, for a tooltip. Its
 * own site refused us (usually a bot check), and Google lists articles a little after they appear.
 */
export function fallbackNote(status?: SourceStatus): Problem | undefined {
  if (status?.via !== "google-news") return undefined;
  const why = explain(status.directError ?? "") ?? "The site's own feed couldn't be read.";
  return {
    message: "via Google News",
    detail: `${why} These headlines come from Google News instead, and may appear a little later than on the site.`,
  };
}

/**
 * Why a source has no headlines: it is not fetched at all, or its last fetch
 * failed. Returns undefined while it is loading or when it is fine.
 */
export function sourceProblem(source: NewsSource, status?: SourceStatus): Problem | undefined {
  if (!isFetched(source)) {
    const why = explain(source.notes ?? "");
    return {
      message: `Not available. ${why ?? "Headlines can't currently be fetched from this site."}`,
      detail: source.notes,
    };
  }
  if (status && !status.ok) {
    return {
      message: `Couldn't load headlines. ${explain(status.error ?? "") ?? "The site returned an unexpected response."}`,
      detail: status.error,
    };
  }
  return undefined;
}
