import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";

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
  return <AdminShell />;
}
