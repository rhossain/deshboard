import type { Metadata, ResolvingMetadata } from "next";
import { PrivacyPage, privacyMetadata } from "@/components/pages/PrivacyPage";

export async function generateMetadata(_: unknown, parent: ResolvingMetadata): Promise<Metadata> {
  return privacyMetadata("bn", parent);
}

/** The privacy page in Bangla, a translation of the English one. */
export default function BanglaPrivacy() {
  return <PrivacyPage locale="bn" />;
}
