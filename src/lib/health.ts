import { readStore, writeStoreSoon } from "./store";
import type { SourceResult } from "./types";

/** What the health page knows about a source beyond its latest fetch. */
export interface SourceHealth {
  /** Last successful fetch (ISO). */
  lastOkAt?: string;
  /** First failure of the current run of failures (ISO); unset while the source works. */
  failingSince?: string;
  /**
   * While its headlines come from Google News: when the site's own feed or page started failing
   * (ISO). Unset once the site works again.
   */
  directFailingSince?: string;
  /**
   * From the latest successful fetch: section names of headlines that landed in "Other", with
   * counts. Candidates for a synonym in src/lib/categories.ts.
   */
  unmapped?: Record<string, number>;
}

const NAME = "health";
/** Section names kept per source, most frequent first. */
const MAX_UNMAPPED = 8;

const g = globalThis as unknown as { __health?: Record<string, SourceHealth> };
const data = (g.__health ??= readStore<Record<string, SourceHealth>>(NAME, {}));

export function recordHealth(result: SourceResult, unmapped: Map<string, number>): void {
  const prev = data[result.sourceId] ?? {};
  data[result.sourceId] = result.ok
    ? {
        lastOkAt: result.fetchedAt,
        unmapped: Object.fromEntries([...unmapped].sort((a, b) => b[1] - a[1]).slice(0, MAX_UNMAPPED)),
        ...(result.via
          ? { directFailingSince: prev.directFailingSince ?? prev.failingSince ?? result.fetchedAt }
          : {}),
      }
    : { ...prev, failingSince: prev.failingSince ?? prev.directFailingSince ?? result.fetchedAt };
  writeStoreSoon(NAME, () => data);
}

export function getHealth(sourceId: string): SourceHealth {
  return data[sourceId] ?? {};
}
