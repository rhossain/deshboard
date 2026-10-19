/**
 * Facebook's Graph API for the admin (the Pages Functions): posting a queued post now, taking one down, re-reading a
 * link's preview, checking the token. The deploy's own posting is scripts/post-facebook.ts; this is the small part
 * the admin needs, with fetch only.
 */
const GRAPH = "https://graph.facebook.com/v23.0";

export interface GraphAccess {
  /** FB_PAGE_TOKEN: the Page's token, or the business's system user's (the Page's is asked for with it). */
  token: string;
  pageId: string;
  /** FB_APP_ID|FB_APP_SECRET, for re-reading links (optional). */
  appToken?: string;
}

export function graphFromEnv(env: Record<string, string | undefined>): GraphAccess | null {
  const token = env.FB_PAGE_TOKEN?.trim();
  const pageId = env.FB_PAGE_ID?.trim();
  if (!token || !pageId) return null;
  const appToken = env.FB_APP_ID && env.FB_APP_SECRET ? `${env.FB_APP_ID}|${env.FB_APP_SECRET}` : undefined;
  return { token, pageId, appToken };
}

export async function graph<T>(endpoint: string, params: Record<string, string>, token: string, method: "GET" | "POST" | "DELETE" = "POST"): Promise<T> {
  const query = new URLSearchParams({ access_token: token, ...params });
  const res = await fetch(method === "POST" ? `${GRAPH}${endpoint}` : `${GRAPH}${endpoint}?${query}`, {
    method,
    body: method === "POST" ? query : undefined,
    signal: AbortSignal.timeout(25_000),
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; code?: number; error_user_msg?: string } };
  if (!res.ok || body.error) {
    const e = body.error;
    throw new Error(`Facebook ${res.status}${e?.code ? ` (code ${e.code})` : ""}: ${e?.message ?? "no answer"}${e?.error_user_msg ? ` — ${e.error_user_msg}` : ""}`);
  }
  return body;
}

/** The Page's own token, got with FB_PAGE_TOKEN; that token itself when Facebook won't say. */
export async function pageToken(access: GraphAccess): Promise<string> {
  try {
    const { access_token } = await graph<{ access_token?: string }>(`/${access.pageId}`, { fields: "access_token" }, access.token, "GET");
    return access_token ?? access.token;
  } catch {
    return access.token;
  }
}

/** Facebook reads the link afresh; true when its preview is the link's own. Undefined without an app token. */
export async function rescrape(access: GraphAccess, link: string): Promise<boolean | undefined> {
  if (!access.appToken) return undefined;
  try {
    const page = await graph<{ title?: string }>("/", { id: link, scrape: "true" }, access.appToken);
    return !!page.title && !/Bartaboard[^|]*$/.test(page.title);
  } catch {
    return undefined;
  }
}

/** Posts to the Page's feed now; Facebook's id for the post. */
export async function postToFeed(access: GraphAccess, params: Record<string, string>): Promise<string> {
  const token = await pageToken(access);
  // Now, not as scheduled.
  const now = { ...params };
  delete now.published;
  delete now.scheduled_publish_time;
  const { id } = await graph<{ id: string }>(`/${access.pageId}/feed`, now, token);
  return id;
}

/** Takes a post (published or scheduled) off the Page. */
export async function deletePost(access: GraphAccess, postId: string): Promise<void> {
  const token = await pageToken(access);
  await graph<{ success?: boolean }>(`/${postId}`, {}, token, "DELETE");
}

/** Whose token it is and whether it can post (for the admin's health page). */
export async function tokenHealth(access: GraphAccess): Promise<{ ok: boolean; page?: string; error?: string }> {
  try {
    const page = await graph<{ name?: string; access_token?: string }>(`/${access.pageId}`, { fields: "name,access_token" }, access.token, "GET");
    return { ok: !!page.access_token, page: page.name };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
