"use client";

import { useState } from "react";
import { sourceProblem } from "@/lib/problems";
import type { NewsItem, NewsSource, SourceStatus } from "@/lib/types";
import { fullTime, timeAgo } from "./time";
import { AlertIcon, ArrowUpRightIcon, ChevronIcon } from "./ui";

const PER_CARD = 8;

const METHOD_LABEL: Record<string, string> = { rss: "RSS", sitemap: "Sitemap", html: "Web" };

export function SourceCard({
  source,
  status,
  items,
  filtering,
  now,
}: {
  source: NewsSource;
  status?: SourceStatus;
  items: NewsItem[];
  filtering: boolean;
  now: number;
}) {
  const [expanded, setExpanded] = useState(false);
  if (filtering && items.length === 0) return null;
  const shown = expanded ? items : items.slice(0, PER_CARD);
  const problem = sourceProblem(source, status);
  const pending = !problem && !status;

  return (
    <article
      className={`flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card ${
        problem ? "shadow-none" : ""
      }`}
    >
      <header className="flex items-center justify-between gap-3 px-4 pb-3 pt-4">
        <div className="min-w-0">
          <SourceLogo source={source} />
          <p className="mt-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
            {source.kind} · {source.lang === "bn" ? "বাংলা" : "English"}
            {METHOD_LABEL[source.method] && <> · {METHOD_LABEL[source.method]}</>}
          </p>
        </div>
        {!problem && !pending && items.length > 0 && (
          <span className="shrink-0 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold tabular-nums text-accent">
            {items.length}
          </span>
        )}
      </header>

      {problem ? (
        <div className="mx-4 mb-4 flex flex-1 gap-3 rounded-xl bg-surface-2 p-3.5 text-sm">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
          <div className="min-w-0">
            <p className="text-foreground/80">{problem.message}</p>
            {problem.detail && <p className="mt-1 break-words text-xs text-muted">Details: {problem.detail}</p>}
            <a
              href={source.homepage}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
            >
              Visit {new URL(source.homepage).host.replace(/^www\./, "")}
              <ArrowUpRightIcon className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      ) : pending ? (
        <ul className="flex-1 space-y-4 px-4 pb-5 pt-1" aria-busy aria-label="Loading headlines">
          {Array.from({ length: 4 }, (_, i) => (
            <li key={i} className="space-y-2">
              <div className="skeleton h-3.5 rounded-full" style={{ width: `${92 - i * 10}%` }} />
              <div className="skeleton h-2.5 w-16 rounded-full" />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="flex-1 border-t border-line">
          {shown.map((it, i) => (
            <li key={it.link} className="border-b border-line last:border-b-0">
              <a
                href={it.link}
                target="_blank"
                rel="noopener noreferrer"
                className="group block px-4 py-3 transition active:bg-surface-2 hover:bg-surface-2/60"
              >
                <span
                  className={`block leading-[1.55] text-foreground group-hover:text-accent ${
                    i === 0 ? "text-[17px] font-semibold" : "text-[15px]"
                  }`}
                >
                  {it.title}
                </span>
                {it.publishedAt && (
                  <time
                    dateTime={it.publishedAt}
                    title={fullTime(it.publishedAt)}
                    className="mt-1 block text-xs text-muted"
                  >
                    {timeAgo(it.publishedAt, now)}
                  </time>
                )}
              </a>
            </li>
          ))}
          {status?.ok && items.length === 0 && <li className="px-4 py-6 text-sm text-muted">No headlines.</li>}
        </ul>
      )}

      {items.length > PER_CARD && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex min-h-12 items-center justify-center gap-1.5 border-t border-line text-sm font-semibold text-accent transition active:bg-surface-2"
        >
          {expanded ? "Show less" : `Show all ${items.length}`}
          <ChevronIcon className={`h-4 w-4 transition ${expanded ? "rotate-180" : ""}`} />
        </button>
      )}
    </article>
  );
}

/**
 * True for a light logo on a transparent background (made for a dark header),
 * which would vanish on our white logo plate. Logos are proxied through our
 * own origin, so the canvas is not tainted.
 */
function isLightOnTransparent(img: HTMLImageElement): boolean {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = Math.max(1, Math.round((64 * img.naturalHeight) / img.naturalWidth));
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let opaque = 0;
    let luminance = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 128) continue;
      opaque++;
      luminance += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
    }
    const transparentShare = 1 - opaque / (px.length / 4);
    return opaque > 0 && transparentShare > 0.1 && luminance / opaque > 200;
  } catch {
    return false;
  }
}

/**
 * The source's logo from /api/logo, linking to its homepage. Wide images are
 * shown alone; square ones (favicons) sit next to the name; if there is no
 * image the name is shown as text.
 */
export function SourceLogo({ source, size = "md" }: { source: NewsSource; size?: "sm" | "md" }) {
  const [kind, setKind] = useState<"loading" | "logo" | "icon" | "none">("loading");
  const [light, setLight] = useState(false);

  // Logos are drawn on a fixed plate so they read the same in light and dark mode.
  const plate = light ? "bg-neutral-800" : "bg-white";
  const sm = size === "sm";

  return (
    <a
      href={source.homepage}
      target="_blank"
      rel="noopener noreferrer"
      title={source.name}
      className={`flex min-w-0 items-center gap-2 font-semibold hover:text-accent ${sm ? "h-5 text-xs" : "h-9 text-[15px]"}`}
    >
      {kind !== "none" && (
        // eslint-disable-next-line @next/next/no-img-element -- proxied third-party logos of unknown size
        <img
          src={`/api/logo/${source.id}`}
          alt={kind === "logo" ? source.name : ""}
          onLoad={(e) => {
            const img = e.currentTarget;
            const { naturalWidth: w, naturalHeight: h } = img;
            setKind(w && h && w / h >= 1.8 ? "logo" : "icon");
            setLight(isLightOnTransparent(img));
          }}
          onError={() => setKind("none")}
          className={
            kind === "logo"
              ? sm
                ? `h-5 w-auto max-w-[110px] rounded object-contain object-left px-1 py-0.5 ${plate}`
                : `h-9 w-auto max-w-[180px] rounded-lg object-contain object-left px-2 py-1.5 ring-1 ring-line ${plate}`
              : kind === "icon"
                ? `${sm ? "h-4 w-4" : "h-7 w-7"} shrink-0 rounded-md object-contain ${plate}`
                : "absolute h-px w-px opacity-0"
          }
        />
      )}
      {kind !== "logo" && <span className="truncate">{source.name}</span>}
    </a>
  );
}
