/**
 * Finishing touches on the static export (`npm run build` runs this after `next build`).
 *
 * Early Hints: every page's critical files are the one stylesheet and the two preloaded fonts, whose
 * names change with their contents, so this writes them as `Link: rel=preload` headers for the pages into
 * out/_headers (after public/_headers' own rules). With Early Hints on in Cloudflare (Speed →
 * Optimization), the edge sends them as a 103 response before the page itself, and the browser has
 * fetched them by the time the HTML arrives.
 *
 * The Bangla pages' language: one root layout serves both languages (the static 404 page, which the
 * shared links rely on, needs a single one), so Next writes `<html lang="en">` on every page and a script
 * in the layout corrects it in the browser. Search engines other than Google, translation prompts and
 * screen readers read the attribute from the HTML itself, so here every page under out/bn/ gets
 * `lang="bn"` written in. The 404 page keeps "en" and the script.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = join(process.cwd(), "out");

/** The pages (every HTML address), as _headers matches them; feeds under /news/ get the header too, harmlessly. */
const PAGE_RULES = ["/", "/news/*", "/sources/*", "/videos/", "/about/", "/privacy/", "/terms/"];
/** English-only pages. */
const EN_ONLY_RULES = ["/health/", "/account/"];

function earlyHints() {
  const head = readFileSync(join(OUT, "index.html"), "utf8").split("</head>")[0];
  const css = [...head.matchAll(/<link rel="stylesheet" href="(\/_next\/static\/[^"]+\.css)"/g)].map((m) => m[1]);
  const fonts = [...head.matchAll(/<link rel="preload" href="(\/_next\/static\/[^"]+\.woff2)" as="font"/g)].map((m) => m[1]);
  if (!css.length || !fonts.length) throw new Error(`after-build: found ${css.length} stylesheets and ${fonts.length} preloaded fonts in out/index.html`);
  const link = [
    ...css.map((href) => `<${href}>; rel=preload; as=style`),
    ...fonts.map((href) => `<${href}>; rel=preload; as=font; crossorigin`),
  ].join(", ");
  const rules = [...PAGE_RULES, ...EN_ONLY_RULES, ...PAGE_RULES.map((r) => `/bn${r}`)].map((r) => `${r}\n  Link: ${link}`);
  const file = join(OUT, "_headers");
  const marker = "\n# Early Hints for the pages, written by scripts/after-build.ts from this build's file names.\n";
  // Run again on the same build, the block is replaced, not repeated.
  const before = readFileSync(file, "utf8").split(marker)[0];
  writeFileSync(file, `${before}${marker}${rules.join("\n")}\n`);
  console.log(`after-build: Link preload headers for ${css.length} stylesheet and ${fonts.length} fonts on ${rules.length} routes`);
}

function* pages(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* pages(path);
    else if (name.endsWith(".html")) yield path;
  }
}

let fixed = 0;
let already = 0;
for (const path of pages(join(OUT, "bn"))) {
  const html = readFileSync(path, "utf8");
  if (/^<!DOCTYPE html><html lang="bn"/i.test(html)) {
    already++;
    continue;
  }
  const next = html.replace(/^(<!DOCTYPE html><html) lang="en"/i, '$1 lang="bn"');
  if (next === html) throw new Error(`${path}: expected the page to start with <!DOCTYPE html><html lang="en"`);
  writeFileSync(path, next);
  fixed++;
}
console.log(`after-build: lang="bn" on ${fixed} Bangla pages${already ? ` (${already} already)` : ""}`);
earlyHints();
