/**
 * Finishing touches on the static export (`npm run build` runs this after `next build`).
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
