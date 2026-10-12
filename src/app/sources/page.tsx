import type { Metadata, ResolvingMetadata } from "next";
import { SourcesPage, sourcesMetadata } from "@/components/pages/SourcesPage";

export async function generateMetadata(_: unknown, parent: ResolvingMetadata): Promise<Metadata> {
  return sourcesMetadata("en", parent);
}

/** Every outlet Bartaboard reads (in Bangla at /bn/sources/). */
export default function Sources() {
  return <SourcesPage locale="en" />;
}
