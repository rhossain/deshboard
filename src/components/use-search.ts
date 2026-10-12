"use client";

import { useEffect, useMemo, useState } from "react";
import { compileSearch, hasSearchTerms, installSearchTerms, type Search } from "@/lib/search";

let loading: Promise<void> | undefined;

/** The word list, fetched once: about 9 KB that only readers who search need, so it isn't in the page's first load. */
function loadSearchTerms(): Promise<void> {
  loading ??= import("@/lib/search-terms")
    .then(({ SEARCH_TERMS }) => installSearchTerms(SEARCH_TERMS))
    .catch(() => {
      loading = undefined; // Offline for a moment: the next search tries again.
    });
  return loading;
}

/**
 * The query as a Search (see search.ts), or null with nothing to search for. The first search fetches the word
 * list; until it arrives the words match as typed, then the search widens to their equivalents.
 */
export function useSearch(query: string): Search | null {
  const [ready, setReady] = useState(hasSearchTerms);
  const active = query.trim() !== "";
  useEffect(() => {
    if (active && !ready) void loadSearchTerms().then(() => setReady(hasSearchTerms()));
  }, [active, ready]);
  // `ready` is a dependency: once the list is in, the same query compiles to a wider search.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => compileSearch(query), [query, ready]);
}
