import type { ReactNode } from "react";
import { type Locale, localePath } from "@/lib/i18n";
import { InfoPage } from "./InfoPage";

/** Where people reach whoever runs Bartaboard; also the support address on Google's sign-in screen. */
export const CONTACT_EMAIL = "support@bartaboard.com";

/**
 * The privacy and terms pages: a plain column of text under the logo. `path` is the English address;
 * the Bangla page is a translation and says so, pointing to the English text, which is the one that applies.
 */
export function LegalPage({
  title,
  updated,
  path,
  locale = "en",
  children,
}: {
  title: string;
  updated: string;
  path: string;
  locale?: Locale;
  children: ReactNode;
}) {
  return (
    <InfoPage title={title} updated={updated} locale={locale} other={localePath(path, locale === "bn" ? "en" : "bn")}>
      {locale === "bn" && (
        <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-muted">
          এটি ইংরেজি লেখার বাংলা অনুবাদ। দুটির মধ্যে কোনো পার্থক্য থাকলে <a href={path}>ইংরেজি সংস্করণটি</a> প্রযোজ্য হবে।
        </p>
      )}
      {children}
    </InfoPage>
  );
}
