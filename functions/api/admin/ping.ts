/**
 * GET /api/admin/ping: who is signed in, for the admin page's first check and for trying the door
 * (401 without an Access token, see _middleware.ts).
 */
import { type AdminData, type AdminEnv, json } from "./_middleware";

export const onRequestGet: PagesFunction<AdminEnv, string, AdminData> = async ({ data }) => {
  return json({ ok: true, email: data.admin.email, at: new Date().toISOString() });
};
