import type { Metadata } from "next";
import { CONTACT_EMAIL, LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What Bartaboard stores about you, where, and how to delete it.",
  alternates: { canonical: "/privacy/" },
};

/** Linked from Google's sign-in screen, the account page and the board's footer. */
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="10 October 2026">
      <p>
        Bartaboard collects Bangladeshi news headlines in one place. You can read it without an account, and we keep as
        little about you as we can.
      </p>

      <h2>Reading without an account</h2>
      <ul>
        <li>
          There are no ads, no analytics and no tracking cookies.
        </li>
        <li>
          Your theme, saved stories, pinned sources, card settings and the time of your last visit are kept only in your
          own browser&apos;s storage. They never reach us, and clearing your browser&apos;s site data removes them.
        </li>
        <li>
          The site is served by Cloudflare, which handles requests (including your IP address) to deliver and protect
          it, under{" "}
          <a href="https://www.cloudflare.com/privacypolicy/" rel="noopener">
            Cloudflare&apos;s privacy policy
          </a>
          .
        </li>
        <li>
          Headlines link to the newspapers that published them. Once you open one, that site&apos;s own privacy policy
          applies.
        </li>
      </ul>

      <h2>With an account</h2>
      <p>Accounts are optional. When you sign in we keep:</p>
      <ul>
        <li>your email address, to sign you in and to send you the sign-in codes and alerts you ask for;</li>
        <li>if you use Google, the name and profile photo on your Google account, to show who is signed in;</li>
        <li>your plan, when you joined, and the settings you save, such as keyword alerts.</li>
      </ul>
      <p>
        Accounts are stored with <a href="https://supabase.com/privacy" rel="noopener">Supabase</a> in Singapore.
        Sign-in emails are sent through <a href="https://resend.com/legal/privacy-policy" rel="noopener">Resend</a>. We
        don&apos;t sell or share your information with anyone else, and we don&apos;t use it for advertising.
      </p>

      <h2>Signing in with Google</h2>
      <p>
        If you choose &ldquo;Continue with Google&rdquo;, we ask Google only for your name, email address and profile
        photo, and use them only to sign you in and show your account. We don&apos;t ask for access to your Gmail,
        contacts, files or anything else. Bartaboard&apos;s use of information received from Google APIs adheres to the{" "}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" rel="noopener">
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements.
      </p>

      <h2>Deleting your data</h2>
      <p>
        Delete your account at any time from <a href="/account/">Your account</a>. That removes your email, name, photo,
        plan and everything saved to the account straight away. You can also remove Bartaboard&apos;s access from your{" "}
        <a href="https://myaccount.google.com/connections" rel="noopener">
          Google account
        </a>
        .
      </p>

      <h2>Contact</h2>
      <p>
        Questions or requests about your data: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. If this policy
        changes, the date at the top changes with it.
      </p>
    </LegalPage>
  );
}
