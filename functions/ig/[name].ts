/**
 * GET /ig/<key>.jpg — an Instagram post's picture (src/lib/instagram-cards.ts), from the admin's database where the
 * deploy stored it (social-store.ts putMedia). Public: Instagram fetches it from here when the post is made, and the
 * admin and Telegram show it. A key names one drawing for good, so it is cached as long as browsers allow.
 */
import { fromBinding, type D1Like } from "../../src/lib/social-db";
import { getMedia } from "../../src/lib/social-store";

interface Env {
  SOCIAL_DB?: D1Like;
}

export const onRequestGet: PagesFunction<Env> = async ({ params, env }) => {
  const m = /^([0-9a-f]{16,64}-\d{1,2})\.jpg$/.exec(String(params.name));
  if (!m || !env.SOCIAL_DB) return new Response("not found", { status: 404 });
  const media = await getMedia(fromBinding(env.SOCIAL_DB), m[1]);
  if (!media) return new Response("not found", { status: 404, headers: { "cache-control": "no-store" } });
  const bytes = Uint8Array.from(atob(media.base64), (c) => c.charCodeAt(0));
  return new Response(bytes, {
    headers: {
      "content-type": media.type,
      "content-length": String(bytes.length),
      "cache-control": "public, max-age=31536000, immutable",
      "x-robots-tag": "noindex",
    },
  });
};
