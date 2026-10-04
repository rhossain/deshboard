import { XMLParser } from "fast-xml-parser";

/**
 * Shared XML parser. Namespace prefixes are stripped so `news:title`
 * becomes `title`, `rdf:RDF` becomes `RDF`, etc.
 */
export const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: true,
  htmlEntities: true,
  cdataPropName: false,
});
