import type { NewsItem } from "@/lib/types";
import { fullTime, timeAgo } from "./time";

/**
 * A headline's age. Without a publish time, falls back to when Bartaboard first saw it on the
 * homepage, marked with "~" since the story may be a little older.
 */
export function ItemTime({ item, now, className }: { item: NewsItem; now: number; className?: string }) {
  if (item.publishedAt) {
    return (
      <time dateTime={item.publishedAt} title={fullTime(item.publishedAt)} className={className}>
        {timeAgo(item.publishedAt, now)}
      </time>
    );
  }
  if (item.seenAt) {
    return (
      <time
        dateTime={item.seenAt}
        title={`First seen on the homepage ${fullTime(item.seenAt)}; the site gives no publish time`}
        className={className}
      >
        ~{timeAgo(item.seenAt, now)}
      </time>
    );
  }
  return null;
}
