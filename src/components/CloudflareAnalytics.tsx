"use client";

import { useEffect } from "react";
import { whenSettled } from "@/lib/settled";

/**
 * Cloudflare Web Analytics' beacon (no cookies, see the privacy policy): visit counts and real readers'
 * Core Web Vitals. Loaded once the page has settled rather than as a deferred script, so it doesn't run
 * between the HTML and the board's own scripts on a slow phone. It reports the page view when it loads.
 * `token` comes from the layout: ANALYTICS_TOKEN is decided by SITE_URL, which only the build knows.
 */
export function CloudflareAnalytics({ token }: { token: string | null }) {
  useEffect(() => {
    if (!token || document.querySelector("script[data-cf-beacon]")) return;
    return whenSettled(() => {
      const script = document.createElement("script");
      script.defer = true;
      script.src = "https://static.cloudflareinsights.com/beacon.min.js";
      script.setAttribute("data-cf-beacon", JSON.stringify({ token }));
      document.body.appendChild(script);
    }, 4000);
  }, [token]);
  return null;
}
