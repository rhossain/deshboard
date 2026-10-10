import { useSyncExternalStore } from "react";

/**
 * Paid plans, paid by hand with bKash (docs/subscriptions.md, "Payment options"). They stay hidden until the
 * `PLANS` repository variable is `on` (deploy.yml passes it to the build as NEXT_PUBLIC_PLANS). While hidden,
 * /account/?plans=preview shows them on this device only, and /account/?plans=off hides them again.
 */
export const PLANS_PUBLIC = process.env.NEXT_PUBLIC_PLANS === "on";

/** The bKash Personal Retail Account readers pay to (the `BKASH_NUMBER` repository variable). Empty: not set up. */
export const BKASH_NUMBER = process.env.NEXT_PUBLIC_BKASH_NUMBER ?? "";

/** What Plus adds. Prices live in Supabase (`plan_prices`), so they change without a new build. */
export const PLUS_FEATURES = [
  "Up to 10 keyword alerts, sent as the headlines appear",
  "A morning digest of the top stories by email or Telegram",
  "Search beyond the last 72 hours",
];

const PREVIEW_KEY = "bartaboard:plans-preview";

/** Reads ?plans=preview / ?plans=off from the address, before /account/ tidies it away. */
export function readPlansPreview() {
  const value = new URLSearchParams(location.search).get("plans");
  try {
    if (value === "preview") localStorage.setItem(PREVIEW_KEY, "1");
    else if (value === "off") localStorage.removeItem(PREVIEW_KEY);
  } catch {}
}

function previewing(): boolean {
  try {
    return localStorage.getItem(PREVIEW_KEY) === "1";
  } catch {
    return false;
  }
}

/** Whether paid plans show on this device: on for everyone, or previewed here. */
export function usePlansVisible(): boolean {
  const preview = useSyncExternalStore(
    () => () => {},
    previewing,
    () => false,
  );
  return PLANS_PUBLIC || preview;
}

/** The plan in force: a paid plan counts only until `plan_until`. */
export function activePlan(profile: { plan: string; plan_until: string | null } | null): string {
  if (!profile || profile.plan === "free") return "free";
  return profile.plan_until && new Date(profile.plan_until) > new Date() ? profile.plan : "free";
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export const taka = (n: number) => `৳${n.toLocaleString("en-IN")}`;
