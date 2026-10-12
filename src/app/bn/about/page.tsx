import type { Metadata, ResolvingMetadata } from "next";
import { AboutPage, aboutMetadata } from "@/components/pages/AboutPage";

export async function generateMetadata(_: unknown, parent: ResolvingMetadata): Promise<Metadata> {
  return aboutMetadata("bn", parent);
}

/** What Bartaboard is, in Bangla. */
export default function BanglaAbout() {
  return <AboutPage locale="bn" />;
}
