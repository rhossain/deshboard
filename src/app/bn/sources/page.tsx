import type { Metadata, ResolvingMetadata } from "next";
import { SourcesPage, sourcesMetadata } from "@/components/pages/SourcesPage";

export async function generateMetadata(_: unknown, parent: ResolvingMetadata): Promise<Metadata> {
  return sourcesMetadata("bn", parent);
}

/** Every outlet Bartaboard reads, in Bangla. */
export default function BanglaSources() {
  return <SourcesPage locale="bn" />;
}
