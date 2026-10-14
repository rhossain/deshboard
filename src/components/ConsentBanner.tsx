"use client";

import { useState, useSyncExternalStore } from "react";
import {
  canChoose,
  type Choice,
  choose,
  closeChoices,
  getServerState,
  getState,
  needsAnswer,
  openChoices,
  subscribe,
} from "@/lib/consent";
import { type Locale, localePath } from "@/lib/i18n";
import { STRINGS } from "@/lib/strings";
import { LocaleProvider } from "./locale";
import { Sheet } from "./ui";

const noSubscribe = () => () => {};

/** The page's language, from <html lang> (this is in the root layout, outside the pages' LocaleProvider). */
function usePageLocale(): Locale {
  return useSyncExternalStore<Locale>(
    noSubscribe,
    () => (document.documentElement.lang === "bn" ? "bn" : "en"),
    () => "en",
  );
}

export function useConsentState() {
  return useSyncExternalStore(subscribe, getState, getServerState);
}

/**
 * Asks readers in the EU, UK and Switzerland about analytics and ad cookies (see src/lib/consent.ts): a card at the
 * foot of the screen until they answer, and the choices sheet, from the card or the footer.
 */
export function ConsentBanner() {
  const state = useConsentState();
  const locale = usePageLocale();
  const t = STRINGS[locale].consent;
  if (!state.on) return null;
  return (
    <LocaleProvider locale={locale}>
      {needsAnswer(state) && !state.open && (
        <div className="consent-card pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-4 md:bottom-8">
          <section
            aria-label={t.label}
            className="tour-invite pointer-events-auto w-full max-w-xl rounded-2xl border border-line bg-surface p-4 shadow-card"
          >
            <p className="text-sm leading-relaxed">
              {t.message}{" "}
              <a href={`${localePath("/privacy/", locale)}#ads`} className="font-semibold text-accent hover:underline">
                {t.privacy}
              </a>
            </p>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={openChoices}
                className="h-10 rounded-full px-4 text-sm font-semibold text-muted transition hover:text-foreground"
              >
                {t.choose}
              </button>
              <button
                type="button"
                onClick={() => choose({ analytics: false, ads: false })}
                className="h-10 rounded-full border border-line px-4 text-sm font-semibold transition hover:bg-surface-2 active:scale-95"
              >
                {t.reject}
              </button>
              <button
                type="button"
                onClick={() => choose({ analytics: true, ads: true })}
                className="h-10 rounded-full bg-foreground px-5 text-sm font-semibold text-background transition hover:opacity-90 active:scale-95"
              >
                {t.accept}
              </button>
            </div>
          </section>
        </div>
      )}
      <Sheet open={state.open} onClose={closeChoices} title={t.label}>
        {state.open && <Choices initial={state.choice} locale={locale} />}
      </Sheet>
    </LocaleProvider>
  );
}

function Choices({ initial, locale }: { initial: Choice | null; locale: Locale }) {
  const t = STRINGS[locale].consent;
  const [choice, setChoice] = useState<Choice>(initial ?? { analytics: false, ads: false });
  const row = (purpose: keyof Choice, name: string, note: string) => (
    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line p-4">
      <input
        type="checkbox"
        checked={choice[purpose]}
        onChange={(e) => setChoice((c) => ({ ...c, [purpose]: e.target.checked }))}
        className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--accent)]"
      />
      <span>
        <span className="block font-semibold">{name}</span>
        <span className="mt-0.5 block text-sm text-muted">{note}</span>
      </span>
    </label>
  );
  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed text-muted">{t.intro}</p>
      {row("analytics", t.analytics, t.analyticsNote)}
      {row("ads", t.ads, t.adsNote)}
      <div className="flex flex-wrap justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={() => choose({ analytics: false, ads: false })}
          className="h-10 rounded-full border border-line px-4 text-sm font-semibold transition hover:bg-surface-2 active:scale-95"
        >
          {t.reject}
        </button>
        <button
          type="button"
          onClick={() => choose(choice)}
          className="h-10 rounded-full border border-line px-4 text-sm font-semibold transition hover:bg-surface-2 active:scale-95"
        >
          {t.save}
        </button>
        <button
          type="button"
          onClick={() => choose({ analytics: true, ads: true })}
          className="h-10 rounded-full bg-foreground px-5 text-sm font-semibold text-background transition hover:opacity-90 active:scale-95"
        >
          {t.accept}
        </button>
      </div>
    </div>
  );
}

/** "Cookie choices" in a footer, where readers are asked (EU, UK and Switzerland, once switched on). */
export function ConsentChoicesLink({ className = "hover:text-foreground" }: { className?: string }) {
  const state = useConsentState();
  const locale = usePageLocale();
  if (!canChoose(state)) return null;
  return (
    <button type="button" onClick={openChoices} className={className}>
      {STRINGS[locale].consent.footer}
    </button>
  );
}
