"use client";

import type { NewsItem } from "@/lib/types";
import { useLocale, useStrings } from "./locale";
import { fullTime, timeAgo } from "./time";

/**
 * A headline's age. Without a publish time, falls back to when Bartaboard first saw it on the
 * homepage, marked with "~" since the story may be a little older.
 */
export function ItemTime({ item, now, className }: { item: NewsItem; now: number; className?: string }) {
  const locale = useLocale();
  const t = useStrings();
  if (item.publishedAt) {
    return (
      <time dateTime={item.publishedAt} title={fullTime(item.publishedAt, locale)} className={className}>
        {timeAgo(item.publishedAt, now, locale)}
      </time>
    );
  }
  if (item.seenAt) {
    return (
      <time
        dateTime={item.seenAt}
        title={t.firstSeen(fullTime(item.seenAt, locale))}
        className={className}
      >
        ~{timeAgo(item.seenAt, now, locale)}
      </time>
    );
  }
  return null;
}
