"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { needsAnswer } from "@/lib/consent";
import { SOCIAL_LINKS } from "@/lib/social";
import { currentVisit } from "@/lib/visits";
import { useConsentState } from "./ConsentBanner";
import { SocialIcon } from "./InfoPage";
import { useStrings } from "./locale";
import { tourSeen } from "./Tour";
import { CloseIcon, ShareIcon } from "./ui";

/**
 * A reader's second day: the moment to ask them to keep Bartaboard close, so the next visit doesn't need
 * another ad or search. One card at the foot of the board, offering to put it on the home screen (the
 * browser's own install prompt; on iPhone and iPad, where there is none, how to do it in Safari) and to
 * follow the Facebook Page. It waits for the site tour's invitation and the cookie question, and once
 * closed stays away for SNOOZE_DAYS; an install or a follow isn't offered again.
 */
const KEY = "bartaboard:return-prompt";
const SNOOZE_DAYS = 21;
/** Seconds into the visit before it appears: the headlines come first. */
const DELAY_MS = 6000;
const FACEBOOK = SOCIAL_LINKS.find((l) => l.id === "facebook")!;

interface Stored {
  closedAt?: string;
  installed?: boolean;
  followed?: boolean;
}

function read(): Stored {
  try {
    return (JSON.parse(localStorage.getItem(KEY) ?? "{}") as Stored) ?? {};
  } catch {
    return {};
  }
}

function remember(patch: Partial<Stored>) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...read(), ...patch }));
  } catch {
    // Storage unavailable: it may ask again next time.
  }
}

/** Chrome's install event (not in TypeScript's DOM types). */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// The browser offers installing once, early, often before the board has drawn: kept from the start.
let installEvent: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    // Ours instead of the browser's own banner, on the second day rather than the first.
    e.preventDefault();
    installEvent = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    installEvent = null;
    remember({ installed: true });
    window.gtag?.("event", "app_installed");
    notify();
  });
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
/** iPhone and iPad (iPadOS says it's a Mac, but has touch): no install prompt, but Safari can add it. */
const isIos = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

const snoozed = (s: Stored) => !!s.closedAt && Date.now() - Date.parse(s.closedAt) < SNOOZE_DAYS * 86_400_000;

/**
 * From the third day it goes ahead of the tour's invitation, which a reader may never answer (Tour.tsx
 * asks this before inviting).
 */
export function returnPromptTakesTurn(): boolean {
  const s = read();
  return currentVisit().days >= 3 && !snoozed(s) && !(s.installed && s.followed);
}

export function ReturnPrompt() {
  const t = useStrings().returnPrompt;
  const asking = needsAnswer(useConsentState());
  const canPrompt = useSyncExternalStore(subscribe, () => installEvent != null, () => false);
  const [due, setDue] = useState(false);
  const [ios, setIos] = useState(false);
  const [steps, setSteps] = useState(false);
  const [stored, setStored] = useState<Stored>({});

  useEffect(() => {
    const visit = currentVisit();
    const s = read();
    if (visit.days < 2 || snoozed(s) || (!tourSeen() && visit.days < 3)) return;
    const timer = setTimeout(() => {
      setStored(s);
      setIos(isIos() && !isStandalone());
      setDue(true);
    }, DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  const offerInstall = !stored.installed && (canPrompt || ios);
  const offerFollow = !stored.followed;
  if (!due || asking || (!offerInstall && !offerFollow)) return null;

  const close = () => {
    remember({ closedAt: new Date().toISOString() });
    setDue(false);
  };
  const followed = () => {
    remember({ followed: true, closedAt: new Date().toISOString() });
    setDue(false);
  };
  const install = async () => {
    const event = installEvent;
    if (!event) return;
    await event.prompt();
    const { outcome } = await event.userChoice;
    installEvent = null;
    notify();
    // Either way, enough asking for today: closed for SNOOZE_DAYS (the follow can wait for then).
    if (outcome === "accepted") remember({ installed: true });
    close();
  };
  const [before, after] = t.iosSteps("{share}").split("{share}");

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-30 flex justify-center px-4 md:bottom-8" role="status">
      <section
        aria-label={t.label}
        className="tour-invite pointer-events-auto w-full max-w-md rounded-2xl border border-line bg-surface p-4 shadow-card"
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{offerInstall ? t.installTitle : t.followTitle}</p>
            <p className="mt-0.5 text-sm text-muted">
              {offerInstall && steps ? (
                <>
                  {before}
                  <ShareIcon className="mx-0.5 inline h-4 w-4 align-[-3px] text-accent" />
                  {after}
                </>
              ) : offerInstall ? (
                t.installBody
              ) : (
                t.followBody
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label={t.later}
            title={t.later}
            className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-foreground"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
          {offerInstall && offerFollow && (
            <a
              href={FACEBOOK.href}
              target="_blank"
              rel="noopener"
              onClick={followed}
              className="mr-auto inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline"
            >
              <SocialIcon id="facebook" className="h-4 w-4" />
              {t.followLink}
            </a>
          )}
          {offerInstall ? (
            canPrompt ? (
              <button
                type="button"
                onClick={install}
                className="h-10 shrink-0 rounded-full bg-accent px-5 text-sm font-semibold text-accent-ink transition active:scale-95"
              >
                {t.install}
              </button>
            ) : (
              !steps && (
                <button
                  type="button"
                  onClick={() => setSteps(true)}
                  className="h-10 shrink-0 rounded-full bg-accent px-5 text-sm font-semibold text-accent-ink transition active:scale-95"
                >
                  {t.how}
                </button>
              )
            )
          ) : (
            <a
              href={FACEBOOK.href}
              target="_blank"
              rel="noopener"
              onClick={followed}
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-accent-ink transition active:scale-95"
            >
              <SocialIcon id="facebook" className="h-4 w-4" />
              {t.follow}
            </a>
          )}
        </div>
      </section>
    </div>
  );
}
