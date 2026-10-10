import type { Metadata } from "next";
import { CONTACT_EMAIL, LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Terms of service",
  description: "The rules for using Bartaboard and its accounts.",
  alternates: { canonical: "/terms/" },
};

/** Linked from Google's sign-in screen, the account page and the board's footer. */
export default function TermsPage() {
  return (
    <LegalPage title="Terms of service" updated="10 October 2026">
      <p>By using Bartaboard you agree to these terms. They are short on purpose.</p>

      <h2>What Bartaboard is</h2>
      <p>
        Bartaboard shows headlines, short excerpts and links from Bangladeshi news sites. The stories, names and images
        belong to the publishers that wrote them; we link to them and don&apos;t claim them as ours. If you publish one of
        these sites and want something changed, write to us.
      </p>

      <h2>Accounts</h2>
      <ul>
        <li>Accounts are optional and free. Keep access to the email or Google account you sign in with.</li>
        <li>One person per account. Don&apos;t sign up for someone else or use an address that isn&apos;t yours.</li>
        <li>You can delete your account whenever you like from Your account.</li>
        <li>
          We may close accounts used to abuse the service, such as automated scraping, sending sign-in emails to other
          people or trying to break in.
        </li>
      </ul>

      <h2>Paid plans</h2>
      <p>
        Paid plans aren&apos;t on sale yet. When they are, their price, what they include and how refunds work will be
        shown before you pay.
      </p>

      <h2>No guarantees</h2>
      <p>
        Bartaboard is provided as it is. Headlines come from other sites and can be late, missing or wrong, and the
        service may sometimes be down. Check the original story before relying on it. As far as the law allows, we
        aren&apos;t liable for losses from using Bartaboard.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these terms; the date at the top shows when. Questions:{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. See also the <a href="/privacy/">privacy policy</a>.
      </p>
    </LegalPage>
  );
}
