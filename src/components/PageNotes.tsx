import type { Intro } from "@/lib/intros";
import { FAQ } from "@/lib/intros";

/**
 * The foot of the board: a few lines about the page (in English and Bangla) and, on the board itself,
 * common questions as plain disclosures. Kept below the headlines so returning readers aren't slowed.
 */
export function PageNotes({ intro, faq = false }: { intro: Intro; faq?: boolean }) {
  return (
    <section aria-label="About this page" className="mx-auto mt-16 max-w-3xl text-sm leading-relaxed text-muted">
      {intro.en.map((line) => (
        <p key={line} className="mt-2 first:mt-0">
          {line}
        </p>
      ))}
      <p lang="bn" className="mt-2">
        {intro.bn}
      </p>
      {faq && (
        <>
          <h2 className="mt-10 font-display text-xl font-semibold text-foreground">Questions</h2>
          <div className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface">
            {FAQ.map(({ q, a }) => (
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
