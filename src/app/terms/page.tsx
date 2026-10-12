import type { Metadata, ResolvingMetadata } from "next";
import { TermsPage, termsMetadata } from "@/components/pages/TermsPage";

export async function generateMetadata(_: unknown, parent: ResolvingMetadata): Promise<Metadata> {
  return termsMetadata("en", parent);
}

/** Linked from Google's sign-in screen, the account page and the board's footer (in Bangla at /bn/terms/). */
export default function Terms() {
  return <TermsPage locale="en" />;
}
