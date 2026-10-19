/**
 * Copies what the Page posted (.social/facebook.json, carried by the deploy's Actions cache) into the admin's
 * database, as posted posts: the picking rules read them from there from now on (docs/admin.md). Run by the ops
 * workflow's d1-import-history task; safe to run again (each Facebook post is recorded once).
 *
 * Dry runs' picks and posts without a Facebook id were never made, and are left out.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { contentOf, type PostRecord } from "../src/lib/page-posts";
import { apiAccessFromEnv, fromApi } from "../src/lib/social-db";
import { insertPost, listPosts } from "../src/lib/social-store";

const FILE = path.join(process.cwd(), ".social", "facebook.json");

async function main() {
  const access = apiAccessFromEnv(process.env, readFileSync("wrangler.toml", "utf8"));
  if (!access) throw new Error("CLOUDFLARE_ACCOUNT_ID and a D1 token (SOCIAL_DB_TOKEN or CLOUDFLARE_API_TOKEN) are needed");
  if (!existsSync(FILE)) throw new Error(`${FILE} is missing: the Actions cache had no Facebook history to restore`);
  const posts = (JSON.parse(readFileSync(FILE, "utf8")) as { posts: PostRecord[] }).posts;
  const db = fromApi(access);

  let added = 0;
  let known = 0;
  let skipped = 0;
  for (const r of posts) {
    if (r.mode === "dry" || !r.id) {
      skipped++;
      continue;
    }
    const post = await insertPost(db, {
      kind: r.kind,
      content: contentOf(r),
      status: "posted",
      policy: "auto",
      slot: r.slot ?? null,
      scheduledAt: r.at,
      message: "",
      link: r.link,
      cards: [{ link: r.link, title: r.title, source: r.sourceId, sourceId: r.sourceId, section: r.category }],
      record: r,
      fbPostId: r.id,
      decidedBy: "import",
      decidedAt: r.at,
      postedAt: r.at,
      note: `imported from .social/facebook.json (${r.mode})`,
    });
    if (post) added++;
    else known++;
  }
  const total = (await listPosts(db, { statuses: ["posted"], limit: 10_000 })).length;
  const line = `History: ${posts.length} records — ${added} added, ${known} already there, ${skipped} left out (dry or never posted). The database now holds ${total} posted posts.`;
  console.log(line);
  if (process.env.REPORT) {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(process.env.REPORT, `${line}\n`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
