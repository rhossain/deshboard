import type { ReactNode } from "react";
import { InfoPage } from "./InfoPage";

/** Where people reach whoever runs Bartaboard; also the support address on Google's sign-in screen. */
export const CONTACT_EMAIL = "support@bartaboard.com";

/** The privacy and terms pages: a plain column of text under the logo. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <InfoPage title={title} updated={updated}>
      {children}
    </InfoPage>
  );
}
