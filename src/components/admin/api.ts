/** The admin page's calls to /api/admin (functions/api/admin), and the shapes they answer with. */
import type { Block, Card, Platform, Policy, SocialPost } from "@/lib/social-store";
import type { QueueSettings } from "@/lib/social-settings";
import type { Slot } from "@/lib/slot-table";

export type { Block, Card, Platform, Policy, QueueSettings, Slot, SocialPost };

export interface Run {
  at: string;
  step: string;
  ok: boolean;
  summary: unknown;
}

export interface QueueData {
  now: string;
  platform: Platform;
  /** Whether this platform posts for real (else a trial). */
  live: boolean;
  settings: QueueSettings;
  /** This platform's slot table in effect. */
  slots: Slot[];
  /** The Page's slot table in effect (Settings edits it). */
  pageSlots: Slot[];
  blocks: Block[];
  runs: Run[];
  posts: SocialPost[];
}

export interface Health {
  now: string;
  live: boolean;
  instagramLive: boolean;
  lastRunMinutesAgo: number | null;
  runs: Run[];
  facebook: { ok: boolean; page?: string; error?: string };
  instagram: { ok: boolean; username?: string; used?: number; limit?: number; error?: string };
  telegram: boolean;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly post?: SocialPost,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(`/api/admin${path}`, {
    credentials: "same-origin",
    cache: "no-store",
    ...rest,
    headers: json === undefined ? rest.headers : { "content-type": "application/json", ...rest.headers },
    body: json === undefined ? rest.body : JSON.stringify(json),
  });
  // Access's sign-in page (an expired session) instead of the API's JSON.
  if (res.redirected || !res.headers.get("content-type")?.includes("json")) throw new ApiError(401, "signed out: reload the page to sign in again");
  const body = (await res.json()) as T & { error?: string; post?: SocialPost };
  if (!res.ok) throw new ApiError(res.status, body.error ?? res.statusText, body.post);
  return body;
}

export const api = {
  queue: (platform: Platform = "facebook") => call<QueueData>(`/queue?platform=${platform}`),
  history: (days = 7) => call<{ days: number; posts: SocialPost[] }>(`/history?days=${days}`),
  health: () => call<Health>("/health"),
  settings: (s: Partial<QueueSettings>) => call<QueueSettings>("/settings", { method: "PUT", json: s }),
  action: (post: SocialPost, action: string, extra: Record<string, unknown> = {}) =>
    call<SocialPost>(`/posts/${post.id}/${action}`, { method: "POST", json: { version: post.version, ...extra } }),
  edit: (post: SocialPost, e: { message?: string; scheduledAt?: string; order?: number[]; cards?: Card[]; policy?: Policy }) =>
    call<SocialPost>(`/posts/${post.id}`, { method: "PATCH", json: { version: post.version, ...e } }),
  create: (p: { message: string; link?: string; scheduledAt?: string }) => call<SocialPost>("/posts", { method: "POST", json: p }),
  createFromItem: (p: { card: Card; content: "news" | "video"; message?: string; scheduledAt?: string; platform?: Platform }) =>
    call<SocialPost>("/posts", { method: "POST", json: p }),
  bulk: (action: string, posts: SocialPost[], extra: Record<string, unknown> = {}) =>
    call<{ results: { id: string; ok: boolean; error?: string }[] }>("/bulk", {
      method: "POST",
      json: { action, items: posts.map((p) => ({ id: p.id, version: p.version })), ...extra },
    }),
  unblock: (id: number) => call<{ ok: boolean }>(`/blocks/${id}`, { method: "DELETE" }),
};

const DHAKA = "Asia/Dhaka";

/** "16:00", as Dhaka's clock reads it. */
export const dhakaTime = (iso: string | number) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: DHAKA, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/** "Mon 19 Oct", Dhaka's day. */
export const dhakaDate = (iso: string | number) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: DHAKA, weekday: "short", day: "numeric", month: "short" }).format(new Date(iso));

/** "2026-10-19", Dhaka's day, for grouping. */
export const dhakaDay = (iso: string | number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: DHAKA, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

/** The ISO time for "HH:MM" Dhaka on the Dhaka day of `day`. */
export function atDhakaTime(day: string | number, hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const d = dhakaDay(day);
  return new Date(`${d}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+06:00`).toISOString();
}

/** "in 25 min", "3 h ago". */
export function relative(iso: string, now: number): string {
  const min = Math.round((Date.parse(iso) - now) / 60_000);
  const abs = Math.abs(min);
  const text = abs < 60 ? `${abs} min` : `${Math.round(abs / 6) / 10} h`;
  return min >= 0 ? `in ${text}` : `${text} ago`;
}

export const CONTENT_LABEL: Record<string, string> = {
  headlines: "5 headlines",
  news: "Headline",
  video: "Video",
  roundup: "5 videos",
  custom: "Your post",
};

export const PLATFORM_LABEL: Record<Platform, string> = { facebook: "Facebook", instagram: "Instagram" };

export const POLICY_LABEL: Record<Policy, string> = {
  auto_unless_rejected: "Posts unless rejected",
  auto: "Posts by itself",
  manual: "Needs approval",
};
