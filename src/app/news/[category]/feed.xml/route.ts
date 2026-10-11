import { notFound } from "next/navigation";
import type { Category } from "@/lib/categories";
import { cachedResults } from "@/lib/feed";
import { headlinesRss } from "@/lib/rss";
import { CATEGORY_PAGES, categoryDescription, categoryPath, SITE_NAME } from "@/lib/site";

// Rebuilt every 15 minutes from the cached headlines.
export const revalidate = 900;

/** A section's newest headlines from every outlet; a 404 for anything that isn't a section with a page. */
export async function GET(_: Request, ctx: RouteContext<"/news/[category]/feed.xml">) {
  const category = (await ctx.params).category as Category;
  const c = CATEGORY_PAGES.find((p) => p.id === category);
  if (!c) notFound();
  return headlinesRss(
    cachedResults(),
    {
      title: `${SITE_NAME}: Bangladesh ${c.label.toLowerCase()} news (${c.bn})`,
      description: categoryDescription(category),
      path: categoryPath(category)!,
    },
    (it) => it.category === category,
  );
}
