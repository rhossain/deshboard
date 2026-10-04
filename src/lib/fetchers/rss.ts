import { looksLikeXml } from "./http";
import { asArray, cleanTitle, parseDate, resolveUrl, textOf } from "./utils";
import { xmlParser } from "./xml";

export interface RawItem {
  title: string;
  link: string;
  publishedAt?: string;
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
  };
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
