import type { Metadata, ResolvingMetadata } from "next";
import { TermsPage, termsMetadata } from "@/components/pages/TermsPage";

export async function generateMetadata(_: unknown, parent: ResolvingMetadata): Promise<Metadata> {
  return termsMetadata("bn", parent);
}

/** The terms page in Bangla, a translation of the English one. */
export default function BanglaTerms() {
  return <TermsPage locale="bn" />;
}
