import type { Metadata } from "next";
import Link from "next/link";
import { AdminShell } from "@/components/admin/AdminShell";
import { BartaboardLogo } from "@/components/BartaboardLogo";

export const metadata: Metadata = {
  title: "Admin",
  description: "Bartaboard's admin: the Facebook Page's queue, its settings and history.",
  // Behind Cloudflare Access (docs/admin.md); never for search engines.
  robots: { index: false, follow: false, nocache: true },
};

/**
 * The admin, at /admin/. Cloudflare Access asks for a sign-in before this page is sent, and every call it makes
 * to /api/admin/* carries the Access token (functions/api/admin/_middleware.ts checks it). The page itself holds
 * nothing private: all of it comes from the API after sign-in.
 */
export default function AdminPage() {
  return (
    <div className="mx-auto min-h-dvh max-w-4xl px-4 pb-16 pt-[max(env(safe-area-inset-top),1.25rem)] sm:px-6 sm:pt-8">
      <header>
        <Link href="/" className="inline-block text-[26px]" aria-label="Bartaboard home">
          <BartaboardLogo />
        </Link>
        <h1 className="mt-6 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Admin</h1>
      </header>
      <AdminShell />
    </div>
  );
}
