import Link from "next/link";
import type { ReactNode } from "react";
import { BartaboardLogo } from "./BartaboardLogo";

/** Where people reach whoever runs Bartaboard; also the support address on Google's sign-in screen. */
export const CONTACT_EMAIL = "hossain.robin007@gmail.com";

/** The privacy and terms pages: a plain column of text under the logo. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh max-w-2xl px-4 pb-16 pt-[max(env(safe-area-inset-top),1.25rem)] sm:px-6 sm:pt-8">
      <header>
        <Link href="/" className="inline-block text-[26px]" aria-label="Bartaboard home">
          <BartaboardLogo />
        </Link>
        <h1 className="mt-6 font-display text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-muted">Last updated {updated}</p>
      </header>

      <div className="mt-8 space-y-4 text-[15px] leading-relaxed [&_a]:font-semibold [&_a]:text-accent [&_a:hover]:underline [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_li]:mt-1.5 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
        {children}
      </div>

      <p className="mt-12 text-center text-xs text-muted">
        <Link href="/" className="font-semibold text-accent hover:underline">
          ← Back to the headlines
        </Link>
      </p>
    </div>
  );
}
