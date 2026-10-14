import { dhakaDay } from "@/components/time";

/**
 * On which days this browser has opened Bartaboard, kept only in its own storage: the return prompt
 * (ReturnPrompt) waits for a second day, and the Meta Pixel tells our Facebook ads apart by whether the
 * readers they bring come back (its ReturnVisit event). Nothing about the visits leaves the browser here.
 */
const KEY = "bartaboard:visits";
/** Days remembered: enough to count "came back", not a history. */
const KEEP = 30;

interface Stored {
  /** Dhaka dates with a visit, oldest first, at most KEEP. */
  days: string[];
}

export interface Visit {
  /** Days with a visit, this one included (up to KEEP). */
  days: number;
  /** This page load is the first of a day after an earlier day's visit. */
  returnedToday: boolean;
}

let visit: Visit | null = null;

/** This page load's visit, counted once (later calls return the same answer). */
export function currentVisit(): Visit {
  if (visit) return visit;
  const today = dhakaDay(Date.now());
  let stored: Stored = { days: [] };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) stored = JSON.parse(raw) as Stored;
    if (!Array.isArray(stored.days)) stored = { days: [] };
  } catch {
    // Storage unavailable: every visit looks like the first.
  }
  const firstToday = !stored.days.includes(today);
  if (firstToday) {
    stored.days = [...stored.days, today].slice(-KEEP);
    try {
      localStorage.setItem(KEY, JSON.stringify(stored));
    } catch {
      // Nothing to remember it in.
    }
  }
  visit = { days: stored.days.length, returnedToday: firstToday && stored.days.length > 1 };
  return visit;
}
