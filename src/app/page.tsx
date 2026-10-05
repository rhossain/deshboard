import { NewsBoard } from "@/components/NewsBoard";
import { parseFilters } from "@/lib/filters";
import { SOURCES } from "@/lib/sources";

const SOURCE_IDS = new Set(SOURCES.map((s) => s.id));

// Rendered per request so the view and filters in the URL (shared links) apply on first paint.
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <NewsBoard sources={SOURCES} initial={parseFilters(await searchParams, SOURCE_IDS)} />;
}
