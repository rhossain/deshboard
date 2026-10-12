"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Search } from "@/lib/search";

const SearchContext = createContext<Search | null>(null);

/** The board's current search, for every <Highlight> inside: set by the board as the reader types. */
export function SearchProvider({ search, children }: { search: Search | null; children: ReactNode }) {
  return <SearchContext value={search}>{children}</SearchContext>;
}

/** A title with the words the reader searched for marked, or the plain title when there's no search. */
export function Highlight({ text }: { text: string }) {
  const ranges = useContext(SearchContext)?.ranges(text);
  if (!ranges?.length) return text;
  const parts: ReactNode[] = [];
  let at = 0;
  for (const [start, end] of ranges) {
    if (start > at) parts.push(text.slice(at, start));
    parts.push(
      <mark key={start} className="rounded-sm bg-accent-soft px-0.5 text-inherit">
        {text.slice(start, end)}
      </mark>,
    );
    at = end;
  }
  if (at < text.length) parts.push(text.slice(at));
  return parts;
}
