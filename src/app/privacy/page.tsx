import type { Metadata, ResolvingMetadata } from "next";
import { PrivacyPage, privacyMetadata } from "@/components/pages/PrivacyPage";

export async function generateMetadata(_: unknown, parent: ResolvingMetadata): Promise<Metadata> {
  return privacyMetadata("en", parent);
}

/** Linked from Google's sign-in screen, the account page and the board's footer (in Bangla at /bn/privacy/). */
export default function Privacy() {
  return <PrivacyPage locale="en" />;
}
