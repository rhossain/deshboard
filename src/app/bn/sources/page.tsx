import type { Metadata, ResolvingMetadata } from "next";
import { SourcesPage, sourcesMetadata } from "@/components/pages/SourcesPage";

// The lines about each outlet come from the server's cache, as it is when the page is asked for.
export const dynamic = "force-dynamic";

export async function generateMetadata(_: unknown, parent: ResolvingMetadata): Promise<Metadata> {
  return sourcesMetadata("bn", parent);
}

/** Every outlet Bartaboard reads in Bangla. */
export default function BanglaSources() {
  return <SourcesPage locale="bn" />;
}
