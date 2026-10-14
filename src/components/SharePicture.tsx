"use client";

import { useState } from "react";
import { SourceLogo } from "./SourceCard";
import type { LogoShape, NewsSource } from "@/lib/types";

/**
 * The shared headline's picture, or the outlet's masthead in its place, the same size, when there is
 * none or it won't load (some outlets refuse every server, so their pictures can't be found).
 */
export function SharePicture({
  image,
  source,
  shape,
  section,
}: {
  image?: string;
  source: NewsSource;
  shape?: LogoShape | null;
  /** The headline's section, under the masthead. */
  section?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (image && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- the outlet's own image, hotlinked as-is
      <img
        src={image}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="aspect-[1.91/1] w-full bg-surface-2 object-cover"
      />
    );
  }
  return (
    <div
      className="flex aspect-[1.91/1] w-full flex-col items-center justify-center gap-3 bg-[radial-gradient(120%_100%_at_50%_0%,var(--accent-soft),var(--surface-2))]"
      aria-hidden
    >
      <div className="origin-center scale-150">
        <SourceLogo source={source} shape={shape} link={false} />
      </div>
      {section && (
        <span className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{section}</span>
      )}
    </div>
  );
}
