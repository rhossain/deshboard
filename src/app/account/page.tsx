import type { Metadata } from "next";
import Link from "next/link";
import { AccountPanel } from "@/components/AccountPanel";
import { BartaboardLogo } from "@/components/BartaboardLogo";

export const metadata: Metadata = {
  title: "Your account",
  description: "Sign in to Bartaboard with Google or an emailed code.",
  robots: { index: false, follow: true },
};

/**
 * Sign-in and the signed-in account. A static page: everything on it runs in the browser against Supabase, and
 * sign-in links and Google return here.
 */
export default function AccountPage() {
  return (
    <div className="mx-auto min-h-dvh max-w-xl px-4 pb-16 pt-[max(env(safe-area-inset-top),1.25rem)] sm:px-6 sm:pt-8">
      <header>
        <Link href="/" className="inline-block text-[26px]" aria-label="Bartaboard home">
          <BartaboardLogo />
        </Link>
        <h1 className="mt-6 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Your account</h1>
      </header>

      <div className="mt-6">
        <AccountPanel />
      </div>

      <p className="mt-8 text-center text-xs text-muted">
        <Link href="/" className="font-semibold text-accent hover:underline">
          ← Back to the headlines
        </Link>
      </p>
    </div>
  );
}
