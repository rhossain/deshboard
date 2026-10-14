import { looksLikeXml } from "./http";
import { isValid, pictureUrl, type RawItem, withPicture } from "./rss";
import { asArray, cleanTitle, parseDate, resolveUrl, textOf } from "./utils";
import { xmlParser } from "./xml";

type Node = Record<string, unknown>;

/**
 * Parse a Google News sitemap:
 *   <url><loc>…</loc><news:news><news:title>…</news:title>
 *   <news:publication_date>…</news:publication_date></news:news></url>
 * Entries without a news:title are skipped (a plain sitemap has no headlines). A picture comes from
 * <image:image><image:loc>, when the sitemap has them.
 */
export function parseNewsSitemap(xml: string, baseUrl: string): RawItem[] {
  if (!looksLikeXml(xml)) throw new Error("Response is not XML (probably an HTML error page)");
  const doc = xmlParser.parse(xml) as Node;
  const urlset = doc.urlset as Node | undefined;
  if (!urlset) {
    if (doc.sitemapindex) throw new Error("Got a sitemap index, not a news sitemap");
    throw new Error("Unrecognised sitemap format");
  }

  const items = asArray(urlset.url as Node | Node[]).map((u) => {
    const news = asArray(u.news as Node | Node[])[0] as Node | undefined;
    return {
      title: cleanTitle(news?.title),
      link: resolveUrl(textOf(u.loc), baseUrl) ?? "",
      publishedAt: parseDate(news?.publication_date ?? u.lastmod),
      tags: textOf(news?.keywords).split(",").map((k) => k.trim()).filter(Boolean),
      // Google's image sitemap extension: <image:image><image:loc>…</image:loc></image:image>.
      ...withPicture(asArray(u.image as Node | Node[]).map((img) => pictureUrl(typeof img === "object" ? img.loc : img, baseUrl)).find(Boolean)),
    };
  });

  const valid = items.filter(isValid);
  if (items.length > 0 && valid.length === 0) {
    throw new Error("Sitemap has links but no news:title entries");
  }
  // Newest first
  return valid.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}
