import { looksLikeXml } from "./http";
import { asArray, cleanTitle, parseDate, resolveUrl, textOf } from "./utils";
import { xmlParser } from "./xml";

export interface RawItem {
  title: string;
  link: string;
  publishedAt?: string;
  /** Section names from RSS <category> or sitemap news:keywords. */
  tags?: string[];
  /** The article's picture, when the feed names one (see pictureOf, and sitemap image:loc). */
  image?: string;
}

type Node = Record<string, unknown>;

/** Parse RSS 2.0, Atom or RSS 1.0 (RDF) into title/link/date items. */
export function parseFeed(xml: string, baseUrl: string): RawItem[] {
  if (!looksLikeXml(xml)) throw new Error("Response is not XML (probably an HTML error page)");
  const doc = xmlParser.parse(xml) as Node;

  // RSS 2.0
  const rss = doc.rss as Node | undefined;
  if (rss) {
    const channel = rss.channel as Node | undefined;
    return asArray(channel?.item as Node | Node[]).map((it) => rssItem(it, baseUrl)).filter(isValid);
  }

  // Atom
  const feed = doc.feed as Node | undefined;
  if (feed) {
    return asArray(feed.entry as Node | Node[])
      .map((e) => ({
        title: cleanTitle(e.title),
        link: resolveUrl(atomLink(e.link), baseUrl) ?? "",
        publishedAt: parseDate(e.published ?? e.updated),
        ...withPicture(pictureOf(e, baseUrl)),
      }))
      .filter(isValid);
  }

  // RSS 1.0 / RDF
  const rdf = doc.RDF as Node | undefined;
  if (rdf) {
    return asArray(rdf.item as Node | Node[]).map((it) => rssItem(it, baseUrl)).filter(isValid);
  }

  throw new Error("Unrecognised feed format");
}

function rssItem(it: Node, baseUrl: string): RawItem {
  let link = textOf(it.link);
  if (!link) {
    const guid = it.guid as Node | string | undefined;
    const guidText = textOf(guid);
    if (/^https?:\/\//.test(guidText)) link = guidText;
  }
  return {
    title: cleanTitle(it.title),
    link: resolveUrl(link, baseUrl) ?? "",
    publishedAt: parseDate(it.pubDate ?? it.date ?? it.published ?? it.updated),
    tags: asArray(it.category as unknown).map(textOf).map(cleanTitle).filter(Boolean),
    ...withPicture(pictureOf(it, baseUrl)),
  };
}

/** `{ image }` when there is one, else nothing: items without a picture have no `image` at all. */
export const withPicture = (image: string | undefined) => (image ? { image } : {});

const IMAGE_FILE = /\.(jpe?g|png|webp|gif|avif)(\?|$)/i;

/** An http(s) address for a picture, or undefined. */
export function pictureUrl(href: unknown, baseUrl: string): string | undefined {
  const text = textOf(href).trim();
  if (!text || /^data:/i.test(text)) return undefined;
  const url = resolveUrl(text, baseUrl);
  return url && /^https?:\/\//i.test(url) ? url : undefined;
}

/**
 * An item's picture, as feeds name it (namespace prefixes are stripped by the parser): Media RSS
 * <media:content medium="image"> or <media:thumbnail> (also inside <media:group>), an image
 * <enclosure>, else the first <img> in its description or content:encoded.
 */
export function pictureOf(it: Node, baseUrl: string): string | undefined {
  const isImage = (n: Node) => {
    const type = textOf(n["@_type"]);
    const medium = textOf(n["@_medium"]);
    return medium === "image" || type.startsWith("image/") || (!medium && !type && IMAGE_FILE.test(textOf(n["@_url"])));
  };
  const nodes = (v: unknown) => asArray(v as Node | Node[]).filter((n): n is Node => typeof n === "object" && n !== null);
  const groups = nodes(it.group);
  const candidates = [
    ...nodes(it.content).filter(isImage),
    ...groups.flatMap((g) => nodes(g.content).filter(isImage)),
    ...nodes(it.thumbnail),
    ...groups.flatMap((g) => nodes(g.thumbnail)),
    ...nodes(it.enclosure).filter(isImage),
  ];
  for (const n of candidates) {
    const url = pictureUrl(n["@_url"], baseUrl);
    if (url) return url;
  }
  for (const html of [it.encoded, it.description, it.content]) {
    const src = /<img\b[^>]*?\ssrc\s*=\s*["']([^"']+)["']/i.exec(textOf(html))?.[1];
    const url = src && pictureUrl(src.replace(/&amp;/g, "&"), baseUrl);
    if (url) return url;
  }
  return undefined;
}

function atomLink(link: unknown): string {
  const links = asArray(link as Node | Node[] | string);
  const alt =
    links.find((l) => typeof l === "object" && (!("@_rel" in l) || l["@_rel"] === "alternate")) ?? links[0];
  if (typeof alt === "string") return alt;
  return alt ? textOf((alt as Node)["@_href"]) : "";
}

export function isValid(it: RawItem): boolean {
  return it.title.length > 0 && it.link.length > 0;
}
