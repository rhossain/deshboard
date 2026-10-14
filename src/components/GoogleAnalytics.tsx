"use client";

import { useEffect } from "react";
import { allowed, GA_ID } from "@/lib/consent";
import { useConsentState } from "./ConsentBanner";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

let started = false;

/** Loads gtag.js once. Ad storage stays denied: there are no ads, and visits aren't shared for advertising. */
function start(id: string) {
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    // gtag.js reads the `arguments` object itself, not an array.
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag("consent", "default", {
    analytics_storage: "granted",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  window.gtag("js", new Date());
  window.gtag("config", id);
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(script);
  started = true;
}

/** Google Analytics' own cookies (_ga, _ga_…), removed when a reader turns analytics off. */
function clearCookies() {
  const host = window.location.hostname;
  for (const name of document.cookie.split("; ").map((c) => c.split("=")[0])) {
    if (!name.startsWith("_ga")) continue;
    for (const domain of ["", `; domain=${host}`, `; domain=.${host.replace(/^www\./, "")}`]) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${domain}`;
    }
  }
}

/**
 * Google Analytics 4, for live visitor counts and what's read. It runs only where src/lib/consent.ts allows
 * analytics: straight away outside the EU, UK and Switzerland, and there once the reader accepts. Page
 * views after the first are counted by GA's own history tracking (enhanced measurement).
 */
export function GoogleAnalytics() {
  const state = useConsentState();
  const ok = GA_ID != null && state.region != null && allowed("analytics");
  useEffect(() => {
    if (!GA_ID) return;
    if (ok && !started) start(GA_ID);
    else if (started) {
      window.gtag?.("consent", "update", { analytics_storage: ok ? "granted" : "denied" });
      if (!ok) clearCookies();
    }
  }, [ok]);
  return null;
}
