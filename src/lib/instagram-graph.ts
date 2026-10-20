/**
 * Instagram's Graph API (the "Instagram API with Facebook Login"): the Instagram professional account connected to
 * the Facebook Page, reached with the Page's token (FB_PAGE_TOKEN, the business's system user's, with
 * instagram_basic and instagram_content_publish). Used by the deploy (scripts/post-instagram.ts) and the admin's
 * "Post now" alike: fetch only.
 *
 * A post is made in three steps: a container for each picture (Instagram fetches it from its address then), a
 * carousel container holding them with the caption, and publishing that. Instagram's API can't delete a post: that
 * is done in the app.
 */
import { graph, type GraphAccess, pageToken } from "./facebook-graph";

export interface InstagramAccount {
  id: string;
  username?: string;
}

/** The Instagram account connected to the Page (IG_USER_ID, when given, saves asking). */
export async function instagramAccount(access: GraphAccess, token?: string, igUserId?: string): Promise<InstagramAccount> {
  const t = token ?? (await pageToken(access));
  if (igUserId) {
    const me = await graph<{ id: string; username?: string }>(`/${igUserId}`, { fields: "id,username" }, t, "GET");
    return { id: me.id, username: me.username };
  }
  const page = await graph<{ instagram_business_account?: { id: string; username?: string } }>(
    `/${access.pageId}`,
    { fields: "instagram_business_account{id,username}" },
    t,
    "GET",
  );
  const account = page.instagram_business_account;
  if (!account?.id) throw new Error("no Instagram professional account is connected to the Facebook Page (docs/instagram.md)");
  return { id: account.id, username: account.username };
}

export interface InstagramPost {
  /** The pictures' public addresses (JPEG), in order: one for a single post, 2 to 10 for a carousel. */
  images: string[];
  caption: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Waits for Instagram to have fetched a container's pictures (usually at once for pictures). */
async function ready(id: string, token: string, tries = 10, every = 3000): Promise<void> {
  for (let i = 0; i < tries; i++) {
    const { status_code, status } = await graph<{ status_code?: string; status?: string }>(`/${id}`, { fields: "status_code,status" }, token, "GET");
    if (status_code === "FINISHED" || status_code === "PUBLISHED") return;
    if (status_code === "ERROR" || status_code === "EXPIRED") throw new Error(`Instagram couldn't take the pictures (${status_code}${status ? `: ${status}` : ""})`);
    await sleep(every);
  }
  throw new Error("Instagram was still taking the pictures after 30 seconds");
}

/** Makes the post now; Instagram's id for it and its address. */
export async function publishToInstagram(
  access: GraphAccess,
  post: InstagramPost,
  opts: { igUserId?: string } = {},
): Promise<{ id: string; permalink: string | null; account: InstagramAccount }> {
  if (!post.images.length || post.images.length > 10) throw new Error(`an Instagram post has 1 to 10 pictures, not ${post.images.length}`);
  const token = await pageToken(access);
  const account = await instagramAccount(access, token, opts.igUserId);
  const media = (params: Record<string, string>) => graph<{ id: string }>(`/${account.id}/media`, params, token);
  let container: string;
  if (post.images.length === 1) {
    container = (await media({ image_url: post.images[0], caption: post.caption })).id;
  } else {
    const children: string[] = [];
    for (const image_url of post.images) children.push((await media({ image_url, is_carousel_item: "true" })).id);
    for (const id of children) await ready(id, token);
    container = (await media({ media_type: "CAROUSEL", children: children.join(","), caption: post.caption })).id;
  }
  await ready(container, token);
  const { id } = await graph<{ id: string }>(`/${account.id}/media_publish`, { creation_id: container }, token);
  let permalink: string | null = null;
  try {
    permalink = (await graph<{ permalink?: string }>(`/${id}`, { fields: "permalink" }, token, "GET")).permalink ?? null;
  } catch {
    // The post is made; its address is only for the admin's link.
  }
  return { id, permalink, account };
}

/** The account, and how many of its 24-hour posting allowance are used (for the admin's health page). */
export async function instagramHealth(access: GraphAccess, igUserId?: string): Promise<{ ok: boolean; username?: string; used?: number; limit?: number; error?: string }> {
  try {
    const token = await pageToken(access);
    const account = await instagramAccount(access, token, igUserId);
    try {
      const { data } = await graph<{ data?: { quota_usage?: number; config?: { quota_total?: number } }[] }>(
        `/${account.id}/content_publishing_limit`,
        { fields: "quota_usage,config" },
        token,
        "GET",
      );
      return { ok: true, username: account.username, used: data?.[0]?.quota_usage, limit: data?.[0]?.config?.quota_total };
    } catch {
      return { ok: true, username: account.username };
    }
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
