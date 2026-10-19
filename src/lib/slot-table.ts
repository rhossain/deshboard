/**
 * The Page's slot table: when posts go out each Dhaka day and what each is (page-posts.ts picks them). Standalone,
 * so the admin's pages and edge functions can read it without the picking code.
 */

/**
 * What a post is: five headlines (a carousel, "headlines"), one headline ("news": breaking news, or a headlines slot
 * with too few stories), a TV channel's video, or five videos (a carousel, "roundup").
 */
export type PostContent = "headlines" | "news" | "video" | "roundup";

/** A time of the Dhaka day ("HH:MM") and what goes out then. */
export interface Slot {
  time: string;
  content: PostContent;
}

/**
 * Ten posts a day: five of five headlines, three videos and two of five videos, an hour or more apart. The FB_SLOTS
 * repository variable replaces them (see parseSlots).
 */
export const SLOTS: Slot[] = [
  { time: "08:00", content: "headlines" },
  { time: "09:15", content: "video" },
  { time: "10:30", content: "headlines" },
  { time: "12:00", content: "video" },
  { time: "13:00", content: "roundup" },
  { time: "16:00", content: "headlines" },
  { time: "17:30", content: "video" },
  { time: "19:00", content: "headlines" },
  { time: "21:00", content: "roundup" },
  { time: "22:30", content: "headlines" },
];

/** "08:00" → minutes after midnight. */
function minutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

const DHAKA_OFFSET_MS = 6 * 3600_000;
const DAY_MS = 86_400_000;

/** The slots of the Dhaka days around `now`, with their times (ms). */
export function slotTimes(now: number, slots: Slot[]): (Slot & { at: number })[] {
  const midnight = Math.floor((now + DHAKA_OFFSET_MS) / DAY_MS) * DAY_MS - DHAKA_OFFSET_MS;
  return [-1, 0, 1].flatMap((d) => slots.map((s) => ({ ...s, at: midnight + d * DAY_MS + minutes(s.time) * 60_000 })));
}

/**
 * The `slots` setting (FB_SLOTS): times, each five headlines unless followed by `news` (one headline), `video` (one
 * video) or `roundup` (five videos): "08:00, 09:15 video, 13:00 roundup, 21:30". Malformed entries are left out; none
 * left, the default.
 */
export function parseSlots(value: string | undefined): Slot[] {
  const slots = new Map<string, Slot>();
  for (const entry of (value ?? "").split(",")) {
    const m = /^\s*([01]?\d|2[0-3]):([0-5]\d)(?:\s+(headlines|news|video|roundup))?\s*$/i.exec(entry);
    if (!m) continue;
    const time = `${m[1].padStart(2, "0")}:${m[2]}`;
    slots.set(time, { time, content: (m[3]?.toLowerCase() ?? "headlines") as PostContent });
  }
  return slots.size ? [...slots.values()].sort((a, b) => minutes(a.time) - minutes(b.time)) : SLOTS;
}
