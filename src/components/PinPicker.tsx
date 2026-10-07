"use client";

import { useState } from "react";
import { MAX_PINS, type Pins, togglePin } from "./pinned";
import { ArrowUpIcon, ChevronIcon, CloseIcon, SearchIcon, Segmented, StarIcon } from "./ui";

export interface PinOption {
  id: string;
  name: string;
  /** A second line, such as the language. */
  hint?: string;
}

const PIN_OPTIONS: { value: "on" | "off"; label: string }[] = [
  { value: "on", label: "Pinned first" },
  { value: "off", label: "Usual order" },
];

/**
 * Picks and ranks the reader's own sources (or channels): up to MAX_PINS, moved up and down with the
 * arrows. Goes in a Sheet. `noun` is "news site" or "channel".
 */
export function PinPicker({
  noun,
  options,
  pins,
  onChange,
}: {
  noun: string;
  options: PinOption[];
  pins: Pins;
  onChange: (change: (pins: Pins) => Pins) => void;
}) {
  const [query, setQuery] = useState("");
  const byId = new Map(options.map((o) => [o.id, o]));
  // Pins for sources that have since been dropped are kept in storage but not shown.
  const pinned = pins.ids.filter((id) => byId.has(id));
  const full = pins.ids.length >= MAX_PINS;
  const q = query.trim().toLowerCase();
  const rest = options.filter((o) => !pins.ids.includes(o.id) && (!q || o.name.toLowerCase().includes(q)));

  const move = (id: string, step: -1 | 1) =>
    onChange((p) => {
      const ids = [...p.ids];
      const at = ids.indexOf(id);
      const to = at + step;
      if (at < 0 || to < 0 || to >= ids.length) return p;
      [ids[at], ids[to]] = [ids[to], ids[at]];
      return { ...p, ids };
    });

  const iconButton =
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-surface-2 hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent";

  return (
    <div className="-mx-5 max-h-[min(62dvh,36rem)] space-y-6 overflow-y-auto px-5">
      <p className="text-sm text-muted">
        Pin up to {MAX_PINS} {noun}s. Theirs come first, in your order; everyone else&rsquo;s follow. Saved on
        this device.
      </p>

      <Segmented
        label={`Show pinned ${noun}s first`}
        value={pins.off ? "off" : "on"}
        onChange={(v) => onChange((p) => ({ ...p, off: v === "off" }))}
        options={PIN_OPTIONS}
        full
      />

      <section>
        <h3 className="mb-2 flex items-baseline justify-between text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
          Your {noun}s
          <span className="tabular-nums tracking-normal">
            {pinned.length} / {MAX_PINS}
          </span>
        </h3>
        {pinned.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-4 py-5 text-center text-sm text-muted">
            None yet. Pick some below.
          </p>
        ) : (
          <ol className="divide-y divide-line rounded-xl border border-line">
            {pinned.map((id, i) => (
              <li key={id} className="flex items-center gap-1 py-1 pl-3 pr-1">
                <span className="w-6 shrink-0 text-xs font-semibold tabular-nums text-muted">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{byId.get(id)!.name}</span>
                <button
                  type="button"
                  onClick={() => move(id, -1)}
                  disabled={i === 0}
                  aria-label={`Move ${byId.get(id)!.name} up`}
                  className={iconButton}
                >
                  <ArrowUpIcon className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => move(id, 1)}
                  disabled={i === pinned.length - 1}
                  aria-label={`Move ${byId.get(id)!.name} down`}
                  className={iconButton}
                >
                  <ArrowUpIcon className="h-4 w-4 rotate-180" />
                </button>
                <button
                  type="button"
                  onClick={() => onChange((p) => togglePin(p, id))}
                  aria-label={`Unpin ${byId.get(id)!.name}`}
                  className={iconButton}
                >
                  <CloseIcon className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Add {noun}s</h3>
        <label className="relative mb-2 block">
          <span className="sr-only">Find a {noun}</span>
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Find a ${noun}`}
            className="h-11 w-full rounded-xl border border-line bg-surface pl-9 pr-3 text-[16px] outline-none focus:border-accent md:h-10 md:text-sm"
          />
        </label>
        {full && (
          <p className="mb-2 text-xs text-muted">
            That&rsquo;s {MAX_PINS}. Unpin one to add another.
          </p>
        )}
        <ul className="divide-y divide-line rounded-xl border border-line">
          {rest.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => onChange((p) => togglePin(p, o.id))}
                disabled={full}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-surface-2 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <StarIcon className="h-4 w-4 shrink-0 text-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{o.name}</span>
                  {o.hint && <span className="block text-xs text-muted">{o.hint}</span>}
                </span>
                <span className="text-xs font-semibold text-accent">Pin</span>
              </button>
            </li>
          ))}
          {rest.length === 0 && <li className="px-3 py-4 text-center text-sm text-muted">No {noun}s match.</li>}
        </ul>
      </section>
    </div>
  );
}

/** The button that opens the picker: "5 pinned". */
export function PinButton({ noun, count, onClick }: { noun: string; count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-11 w-full items-center gap-2.5 rounded-xl border border-line bg-surface px-3.5 text-sm font-medium transition hover:bg-surface-2 md:h-10"
    >
      <StarIcon filled={count > 0} className={`h-4 w-4 ${count > 0 ? "text-gold" : "text-muted"}`} />
      <span className="flex-1 text-left">{count > 0 ? `${count} pinned` : `Pin your ${noun}s`}</span>
      <ChevronIcon className="h-4 w-4 -rotate-90 text-muted" />
    </button>
  );
}
