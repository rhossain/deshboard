import type { Category } from "@/lib/categories";
import { readFeed } from "@/lib/feed";
import { headlinesRss } from "@/lib/rss";
import { CATEGORY_PAGES, categoryDescription, categoryPath, SITE_NAME } from "@/lib/site";

// One feed per section, rendered at build time (static export).
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return CATEGORY_PAGES.map((c) => ({ category: c.id }));
}

/** A section's newest headlines from every outlet. */
export async function GET(_: Request, ctx: RouteContext<"/news/[category]/feed.xml">) {
  const category = (await ctx.params).category as Category;
  const c = CATEGORY_PAGES.find((p) => p.id === category)!;
  return headlinesRss(
    readFeed(),
    {
      title: `${SITE_NAME}: Bangladesh ${c.label.toLowerCase()} news (${c.bn})`,
      description: categoryDescription(category),
      path: categoryPath(category)!,
    },
    (it) => it.category === category,
  );
}
