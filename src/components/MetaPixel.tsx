"use client";

import { useEffect } from "react";
import { allowed, META_PIXEL_ID } from "@/lib/consent";
import { landingParam } from "@/lib/landing";
import { currentVisit } from "@/lib/visits";
import { useConsentState } from "./ConsentBanner";

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[];
  push: Fbq;
  loaded: boolean;
  version: string;
};

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

let started = false;
const COOKIE_DAYS = 90;

/** The site's own domain for cookies (bartaboard.com for www. too), as the Pixel sets them. */
const cookieDomain = () => window.location.hostname.replace(/^www\./, "");

/**
 * Facebook's click id from an ad, as the Pixel's _fbc cookie (Meta's format: fb.1.<time>.<fbclid>). The
 * Pixel reads fbclid from the address itself, but the board has rewritten the address by the time the
 * Pixel loads (see landing.ts).
 */
function keepClickId() {
  const fbclid = landingParam("fbclid");
  if (!fbclid || document.cookie.split("; ").some((c) => c.startsWith("_fbc="))) return;
  const expires = new Date(Date.now() + COOKIE_DAYS * 86_400_000).toUTCString();
  document.cookie = `_fbc=fb.1.${Date.now()}.${encodeURIComponent(fbclid)}; expires=${expires}; path=/; domain=.${cookieDomain()}; SameSite=Lax`;
}

/** Meta's loader (fbevents.js), as its own snippet sets it up: calls are queued until it arrives. */
function start(id: string) {
  keepClickId();
  if (!window.fbq) {
    const fbq = function () {
      // fbevents.js reads the `arguments` object itself, as Meta's snippet passes it.
      // eslint-disable-next-line prefer-rest-params, prefer-spread
      if (fbq.callMethod) fbq.callMethod.apply(fbq, arguments as unknown as unknown[]);
      // eslint-disable-next-line prefer-rest-params
      else fbq.queue.push(arguments);
    } as Fbq;
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = "2.0";
    fbq.queue = [];
    window.fbq = fbq;
    window._fbq ??= fbq;
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(script);
  }
  window.fbq("consent", "grant");
  window.fbq("init", id);
  // Later pages: the Pixel counts the board's own address changes (history) as page views itself.
  window.fbq("track", "PageView");
  // A reader back on another day: what an ad is worth (see docs/promotion.md), and an audience to show the next ones to.
  const visit = currentVisit();
  if (visit.returnedToday) window.fbq("trackCustom", "ReturnVisit", { days: visit.days });
  started = true;
}

/** The Pixel's cookies (_fbp, _fbc), removed when a reader turns ads off. */
function clearCookies() {
  for (const name of ["_fbp", "_fbc"]) {
    for (const domain of ["", `; domain=${window.location.hostname}`, `; domain=.${cookieDomain()}`]) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${domain}`;
    }
  }
}

/**
 * The Meta Pixel, so Bartaboard's own Facebook and Instagram ads can be measured: which ads bring readers
 * who open the page (PageView) and who come back on another day (ReturnVisit), and an audience of past
 * visitors to show the next ads to. Nothing else is sent: no headlines read, no account details.
 *
 * It runs only where src/lib/consent.ts allows ads: straight away outside the EU, UK and Switzerland, and
 * there once the reader accepts ads. Turned off later, it stops and its cookies go.
 */
export function MetaPixel() {
  const state = useConsentState();
  const ok = META_PIXEL_ID != null && state.region != null && allowed("ads");
  useEffect(() => {
    // Counted on every page, whether or not the Pixel runs (the return prompt uses it too).
    currentVisit();
    if (!META_PIXEL_ID) return;
    if (ok && !started) start(META_PIXEL_ID);
    else if (started && !ok) {
      window.fbq?.("consent", "revoke");
      clearCookies();
      started = false;
    }
  }, [ok]);
  return null;
}
