/**
 * Consent for analytics and ad cookies (the privacy policy's promise): readers outside Bangladesh are
 * asked before any such service runs, and can change their answer from "Cookie choices" in the footer.
 * Readers in Bangladesh aren't asked; there the services run once they are switched on.
 *
 * Nothing on the site sets such cookies yet, so the question only appears once one is switched on: the
 * `CONSENT` repository variable set to `on` (deploy.yml passes it to the build as NEXT_PUBLIC_CONSENT).
 * Until then `?consent=preview` shows it on one device, as if switched on and outside Bangladesh.
 *
 * A service that sets cookies runs only when `allowed("analytics")` or `allowed("ads")` says so, and
 * starts when `subscribe` reports the answer.
 */

export const CONSENT_ON = process.env.NEXT_PUBLIC_CONSENT === "on";

export type Purpose = "analytics" | "ads";
export type Choice = Record<Purpose, boolean>;

/** Where the question applies: "asked" outside Bangladesh, "not-asked" in it, null while finding out. */
export type Region = "asked" | "not-asked";

const CHOICE_KEY = "bartaboard:consent";
const REGION_KEY = "bartaboard:region";
const PREVIEW_KEY = "bartaboard:consent-preview";

interface Stored extends Choice {
  /** When the reader answered (ISO), so a later change of what is asked can ask again. */
  at: string;
}

interface State {
  /** Whether the question applies on this device at all: switched on, or previewed. */
  on: boolean;
  region: Region | null;
  /** The reader's answer, or null before they have given one. */
  choice: Choice | null;
  /** The choices panel is open (from the footer, or the banner's "Choose"). */
  open: boolean;
}

const read = <T>(key: string, storage: () => Storage): T | null => {
  try {
    const raw = storage().getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};
const write = (key: string, value: unknown, storage: () => Storage) => {
  try {
    storage().setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable: the answer lasts this page view.
  }
};
const local = () => window.localStorage;
const session = () => window.sessionStorage;

let state: State | null = null;
const listeners = new Set<() => void>();
const SERVER_STATE: State = { on: false, region: null, choice: null, open: false };

function init(): State {
  const preview = new URLSearchParams(window.location.search).get("consent") === "preview";
  if (preview) write(PREVIEW_KEY, true, session);
  const on = CONSENT_ON || preview || read<boolean>(PREVIEW_KEY, session) === true;
  const stored = read<Stored>(CHOICE_KEY, local);
  const choice = stored ? { analytics: !!stored.analytics, ads: !!stored.ads } : null;
  const s: State = { on, region: on && preview ? "asked" : read<Region>(REGION_KEY, session), choice, open: false };
  if (on && !s.region) void findRegion();
  return s;
}

function set(next: Partial<State>) {
  state = { ...get(), ...next };
  for (const l of listeners) l();
}

function get(): State {
  return (state ??= init());
}

/**
 * Bangladesh or not, from Cloudflare's own answer for this connection (the site's `/cdn-cgi/trace`: only
 * the country is read, and kept for the session). Where that can't be had (another host, offline), the
 * device's time zone; when in doubt, the reader is asked.
 */
async function findRegion() {
  let country: string | undefined;
  try {
    const res = await fetch("/cdn-cgi/trace", { cache: "no-store" });
    if (res.ok) country = /^loc=([A-Z]{2})$/m.exec(await res.text())?.[1];
  } catch {
    // Not behind Cloudflare: the time zone below.
  }
  const dhaka = Intl.DateTimeFormat().resolvedOptions().timeZone === "Asia/Dhaka";
  const region: Region = (country ? country === "BD" : dhaka) ? "not-asked" : "asked";
  write(REGION_KEY, region, session);
  set({ region });
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const getState = (): State => get();
export const getServerState = (): State => SERVER_STATE;

/** Whether a service for `purpose` may run: switched on, and allowed here (by region or the reader's answer). */
export function allowed(purpose: Purpose): boolean {
  const s = get();
  if (!s.on || !s.region) return false;
  return s.region === "not-asked" || !!s.choice?.[purpose];
}

/** The banner shows: switched on, outside Bangladesh, and not answered yet. */
export const needsAnswer = (s: State) => s.on && s.region === "asked" && !s.choice;

/** The footer's "Cookie choices" shows wherever readers are asked. */
export const canChoose = (s: State) => s.on && s.region === "asked";

export function choose(choice: Choice) {
  write(CHOICE_KEY, { ...choice, at: new Date().toISOString() } satisfies Stored, local);
  set({ choice, open: false });
}

export const openChoices = () => set({ open: true });
export const closeChoices = () => set({ open: false });
