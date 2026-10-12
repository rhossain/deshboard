"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Locale } from "@/lib/i18n";
import { STRINGS, type Strings } from "@/lib/strings";

const LocaleContext = createContext<Locale>("en");

/** The page's interface language, for everything inside: set once by the page (see src/lib/i18n.ts). */
export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext value={locale}>{children}</LocaleContext>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

/** The interface strings in the page's language. */
export function useStrings(): Strings {
  return STRINGS[useLocale()];
}
