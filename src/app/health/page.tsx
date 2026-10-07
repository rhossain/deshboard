import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { fullTime, timeAgo } from "@/components/time";
import { getHealth } from "@/lib/health";
import { cachedResult } from "@/lib/news";
import { fallbackNote, sourceProblem } from "@/lib/problems";
import { isFetched, SOURCES } from "@/lib/sources";
import type { NewsSource } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Source health",
  description: "Which news portals Deshboard can read right now, which are failing, and since when.",
  // A status page for whoever runs the site, not something to find in search.
  robots: { index: false, follow: true },
};

type State = "failing" | "fallback" | "waiting" | "ok" | "off";

const STATE_ORDER: State[] = ["failing", "fallback", "waiting", "ok", "off"];
const STATE_LABEL: Record<State, string> = {
  failing: "Failing",
  fallback: "Via Google News",
  waiting: "Not fetched yet",
  ok: "Working",
  off: "Not fetched",
};
const STATE_STYLE: Record<State, string> = {
  failing: "bg-danger-soft text-danger",
  fallback: "bg-gold/15 text-gold",
  waiting: "bg-surface-2 text-muted",
  ok: "bg-accent-soft text-accent",
  off: "bg-surface-2 text-muted",
};
const METHOD_LABEL: Record<string, string> = { rss: "RSS", sitemap: "Sitemap", html: "Homepage" };

interface Row {
  source: NewsSource;
  state: State;
  result: ReturnType<typeof cachedResult>;
  health: ReturnType<typeof getHealth>;
}

/** Every source's state from the server's cache (this page never triggers a fetch), failing ones first. */
function report(): { rows: Row[]; now: number } {
  const rows: Row[] = SOURCES.map((source) => {
    const result = cachedResult(source.id);
    const state: State = !isFetched(source)
      ? "off"
      : !result
        ? "waiting"
        : !result.ok
          ? "failing"
          : result.via
            ? "fallback"
            : "ok";
    return { source, state, result, health: getHealth(source.id) };
  }).sort(
    (a, b) =>
      STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state) ||
      (a.state === "failing" ? (a.health.failingSince ?? "").localeCompare(b.health.failingSince ?? "") : 0) ||
      (a.state === "fallback"
        ? (a.health.directFailingSince ?? "").localeCompare(b.health.directFailingSince ?? "")
        : 0),
  );
  return { rows, now: Date.now() };
}

/** How each source is doing, how long failing ones have failed, and which section names land in "Other". */
export default function HealthPage() {
  const { rows, now } = report();
  const count = (s: State) => rows.filter((r) => r.state === s).length;
  const otherTotal = rows.reduce(
    (n, r) => n + (r.result?.items.filter((it) => it.category === "other").length ?? 0),
    0,
  );

  return (
    <div className="mx-auto min-h-dvh max-w-4xl px-4 pb-16 pt-[max(env(safe-area-inset-top),1.25rem)] sm:px-6 sm:pt-8">
      <header>
        <Link href="/" className="inline-block text-[26px]" aria-label="Deshboard home">
          <Logo />
        </Link>
        <h1 className="mt-6 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Source health</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          Each source&rsquo;s latest fetch, from the server&rsquo;s cache. Failing sources come first, longest-failing
          at the top, then sites that refuse us and are read through Google News instead. Working sources list the
          section names whose headlines land in &ldquo;Other&rdquo;; adding them to{" "}
          <code className="rounded bg-surface-2 px-1 text-xs">src/lib/categories.ts</code> files them properly.
        </p>
        <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold">
          {(["ok", "fallback", "failing", "waiting", "off"] as State[])
            .filter((s) => count(s) > 0)
            .map((s) => (
              <span key={s} className={`rounded-full px-3 py-1 ${STATE_STYLE[s]}`}>
                {count(s)} {s === "fallback" ? STATE_LABEL[s] : STATE_LABEL[s].toLowerCase()}
              </span>
            ))}
          {otherTotal > 0 && (
            <span className="rounded-full bg-gold/15 px-3 py-1 text-gold">
              {otherTotal.toLocaleString()} headlines in &ldquo;Other&rdquo;
            </span>
          )}
        </div>
      </header>

      <ol className="mt-8 overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        {rows.map((row) => (
          <SourceRow key={row.source.id} row={row} now={now} />
        ))}
      </ol>

      <p className="mt-8 text-center text-xs text-muted">
        <Link href="/" className="font-semibold text-accent hover:underline">
          ← Back to the headlines
        </Link>
      </p>
    </div>
  );
}

function SourceRow({ row: { source, state, result, health }, now }: { row: Row; now: number }) {
  const failed = sourceProblem(source, result);
  const fallback = fallbackNote(result);
  // Why the site itself failed; for a failing source, also why Google News couldn't stand in.
  const problem = fallback
    ? { message: fallback.detail, detail: result?.directError }
    : failed && {
        ...failed,
        detail: [failed.detail, result?.fallbackError && `Google News: ${result.fallbackError}`].filter(Boolean).join(" · "),
      };
  const working = state === "ok" || state === "fallback";
  const unmapped = working ? Object.entries(health.unmapped ?? {}) : [];
  const facts: string[] = [];
  if (working && result) {
    facts.push(
      `${result.count.toLocaleString()} headlines${state === "fallback" ? " from Google News" : ""}`,
      `${(result.durationMs / 1000).toFixed(1)} s`,
    );
  }
  if (state === "fallback" && health.directFailingSince) {
    facts.push(`site failing since ${timeAgo(health.directFailingSince, now)}`);
  }
  if (state === "failing") {
    if (health.failingSince) facts.push(`failing since ${timeAgo(health.failingSince, now)}`);
    if (health.lastOkAt) facts.push(`last worked ${timeAgo(health.lastOkAt, now)}`);
  }
  if (result) facts.push(`checked ${timeAgo(result.fetchedAt, now)}`);

  return (
    <li className="border-b border-line px-4 py-4 last:border-b-0 sm:px-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <a href={source.homepage} target="_blank" rel="noopener noreferrer" className="font-semibold hover:text-accent">
          {source.name}
        </a>
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
          {source.lang === "bn" ? "বাংলা" : "English"}
          {METHOD_LABEL[source.method] && <> · {METHOD_LABEL[source.method]}</>}
        </span>
        <span className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATE_STYLE[state]}`}>
          {STATE_LABEL[state]}
        </span>
      </div>
      {facts.length > 0 && (
        <p className="mt-1 text-xs text-muted" title={result ? fullTime(result.fetchedAt) : undefined}>
          {facts.join(" · ")}
        </p>
      )}
      {problem && (
        <p className="mt-2 text-sm text-foreground/80">
          {problem.message}
          {problem.detail && <span className="mt-0.5 block break-words text-xs text-muted">{problem.detail}</span>}
        </p>
      )}
      {unmapped.length > 0 && (
        <p className="mt-2 text-xs leading-relaxed text-muted">
          <span className="font-semibold text-gold">In &ldquo;Other&rdquo;:</span>{" "}
          {unmapped.map(([section, n], i) => (
            <span key={section}>
              {i > 0 && ", "}
              <code className="rounded bg-surface-2 px-1">{section}</code> {n}
            </span>
          ))}
        </p>
      )}
    </li>
  );
}
