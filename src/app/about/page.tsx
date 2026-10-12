import type { Metadata, ResolvingMetadata } from "next";
import { AboutPage, aboutMetadata } from "@/components/pages/AboutPage";

export async function generateMetadata(_: unknown, parent: ResolvingMetadata): Promise<Metadata> {
  return aboutMetadata("en", parent);
}

/** What Bartaboard is (in Bangla at /bn/about/). */
export default function About() {
  return <AboutPage locale="en" />;
}
