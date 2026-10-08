"use client";

import { useState } from "react";
import { SHARE_TARGETS, sharePath, videoSharePath } from "@/lib/share";
import type { NewsItem } from "@/lib/types";
import { LinkIcon, ShareIcon } from "./ui";

// Brand marks from Simple Icons (CC0), 24×24.
const BRAND_PATHS: Record<string, string> = {
  facebook:
    "M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z",
  whatsapp:
    "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z",
  x: "M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z",
  telegram:
    "M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z",
};

/** The Bartaboard link for a headline, on whatever address the reader is using. */
export function shareUrl(item: NewsItem): string {
  return new URL(sharePath(item.link), window.location.origin).href;
}

/** The Bartaboard link for a video. */
export function videoShareUrl(id: string): string {
  return new URL(videoSharePath(id), window.location.origin).href;
}

/** What the share sheet shares: a headline or a video, each as its Bartaboard link. */
export interface Shareable {
  title: string;
  url: string;
  /** The outlet or channel. */
  sourceName: string;
  video?: boolean;
}

/** Inside the share sheet: the headline or video, each social site, copy link, and the system share menu. */
export function ShareOptions({ shared }: { shared: Shareable }) {
  const { title, url, sourceName } = shared;
  const [copied, setCopied] = useState(false);
  // Only rendered after a tap on Share, never on the server.
  const canNativeShare = typeof navigator.share === "function";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the link is in the field below to copy by hand.
    }
  };

  const tile =
    "flex flex-col items-center gap-2 rounded-2xl px-1 py-3 text-xs font-medium text-muted transition hover:bg-surface-2 hover:text-foreground active:scale-95";
  const disc = "flex h-12 w-12 items-center justify-center rounded-full bg-surface-2";

  return (
    <div>
      <div className="rounded-2xl bg-surface-2 px-4 py-3">
        <p className="text-xs font-semibold text-accent">{sourceName}</p>
        <p className="mt-0.5 line-clamp-3 text-[15px] font-medium leading-[1.5]">{title}</p>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-1 sm:grid-cols-5">
        {SHARE_TARGETS.map((t) => (
          <a key={t.id} href={t.href(url, title)} target="_blank" rel="noopener noreferrer" className={tile}>
            <span className={disc}>
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill={t.color} aria-hidden>
                <path d={BRAND_PATHS[t.id]} />
              </svg>
            </span>
            {t.label}
          </a>
        ))}
        {canNativeShare && (
          <button type="button" className={tile} onClick={() => navigator.share({ title, url }).catch(() => {})}>
            <span className={disc}>
              <ShareIcon className="h-6 w-6" />
            </span>
            More
          </button>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-xl border border-line bg-surface-2 p-1.5 pl-3">
        <LinkIcon className="h-4 w-4 shrink-0 text-muted" />
        <input
          readOnly
          value={url}
          aria-label="Share link"
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 bg-transparent text-sm text-muted outline-none"
        />
        <button
          type="button"
          onClick={copy}
          className="h-9 shrink-0 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-ink transition active:scale-95"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted">
        {shared.video
          ? "The link opens a Bartaboard page for this video, with a button to watch it on YouTube."
          : `The link opens a Bartaboard page for this headline, with a button to the article on ${sourceName}.`}
      </p>
    </div>
  );
}
