import type { Locale } from "@/lib/i18n";
import { faq as faqFor, type Intro } from "@/lib/intros";
import { STRINGS } from "@/lib/strings";

/**
 * The foot of the board: a few lines about the page (in English and Bangla, or in Bangla alone on
 * Bangla pages) and, on the board itself, common questions as plain disclosures. Kept below the
 * headlines so returning readers aren't slowed.
 */
export function PageNotes({ intro, faq = false, locale = "en" }: { intro: Intro; faq?: boolean; locale?: Locale }) {
  const t = STRINGS[locale];
  return (
    <section aria-label={t.aboutThisPage} className="mx-auto mt-16 max-w-3xl text-sm leading-relaxed text-muted">
      {locale === "bn" ? (
        intro.bnPage.map((line) => (
          <p key={line} className="mt-2 first:mt-0">
            {line}
          </p>
        ))
      ) : (
        <>
          {intro.en.map((line) => (
            <p key={line} className="mt-2 first:mt-0">
              {line}
            </p>
          ))}
          <p lang="bn" className="mt-2">
            {intro.bn}
          </p>
        </>
      )}
      {faq && (
        <>
          <h2 className="mt-10 font-display text-xl font-semibold text-foreground">{t.questions}</h2>
          <div className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface">
            {faqFor(locale).map(({ q, a }) => (
              <details key={q} className="group px-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3.5 font-medium text-foreground [&::-webkit-details-marker]:hidden">
                  {q}
                  <span aria-hidden className="text-muted transition group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="pb-4">{a}</p>
              </details>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
