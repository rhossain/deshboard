import { CATEGORIES, type Category } from "./categories";
import type { Lang } from "./types";

/**
 * The board's view and filters, mirrored in the URL (`/?view=latest&lang=bn&cat=sports`) so a
 * filtered view can be bookmarked or shared. Defaults are left out of the URL.
 */
export type View = "sources" | "top" | "latest" | "saved" | "videos";
export type LangFilter = "all" | Lang;
export type Order = "default" | "newest";

export interface Filters {
  view: View;
  lang: LangFilter;
  /** Source id, or "" for all. */
  source: string;
  category: Category | "";
  query: string;
  order: Order;
}

export const DEFAULT_FILTERS: Filters = {
  view: "sources",
  lang: "all",
  source: "",
  category: "",
  query: "",
  order: "default",
};

const VIEWS: View[] = ["sources", "top", "latest", "saved", "videos"];
const CATEGORY_IDS = new Set<string>(CATEGORIES.map((c) => c.id));

type Params = Record<string, string | string[] | undefined>;

/** Reads filters from the page's search params, ignoring anything unknown. */
export function parseFilters(params: Params, sourceIds: Set<string>): Filters {
  const get = (key: string) => {
    const v = params[key];
    return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
  };
  const view = get("view") as View;
  const lang = get("lang");
  const source = get("source");
  const category = get("cat");
  return {
    view: VIEWS.includes(view) ? view : DEFAULT_FILTERS.view,
    lang: lang === "bn" || lang === "en" ? lang : "all",
    source: sourceIds.has(source) ? source : "",
    category: CATEGORY_IDS.has(category) ? (category as Category) : "",
    query: get("q").slice(0, 200),
    order: get("order") === "newest" ? "newest" : "default",
  };
}

/** `?view=…&…` for the non-default filters, or "" when everything is default. */
export function filtersToSearch(f: Filters): string {
  const params = new URLSearchParams();
  if (f.view !== DEFAULT_FILTERS.view) params.set("view", f.view);
  if (f.lang !== "all") params.set("lang", f.lang);
  if (f.source) params.set("source", f.source);
  if (f.category) params.set("cat", f.category);
  if (f.query.trim()) params.set("q", f.query.trim());
  if (f.view === "sources" && f.order !== "default") params.set("order", f.order);
  const s = params.toString();
  return s ? `?${s}` : "";
}
