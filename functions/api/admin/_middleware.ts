/**
 * The admin's door: every request under /api/admin/* must carry a valid token from Cloudflare Access.
 *
 * Access (Zero Trust) sits in front of bartaboard.com/admin and /api/admin: a visitor signs in (a code sent to the
 * allowed address, see .github/workflows/ops.yml access-setup) before Cloudflare lets the request through, and the
 * request then carries a signed JWT in the `Cf-Access-Jwt-Assertion` header (and the CF_Authorization cookie). This
 * checks that token on every request — Access alone would be enough only if nothing could ever reach the Pages
 * project around it — so the API is closed even if the Access application were removed by mistake.
 *
 * The token must be signed by the team's current keys (https://<team>/cdn-cgi/access/certs, cached for an hour),
 * issued by the team, made for this application (its audience tag), and not expired. The signed-in address is passed
 * on to the handlers as data.admin.email, and may be narrowed further with ADMIN_EMAILS (comma-separated).
 *
 * CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD come from wrangler.toml ([vars]); without them every request is refused.
 */
import type { AdminBindings } from "../../../src/lib/admin-api";

export interface AdminEnv {
  /** The Zero Trust team domain, e.g. bartaboard.cloudflareaccess.com. */
  CF_ACCESS_TEAM_DOMAIN?: string;
  /** The Access application's audience tag. */
  CF_ACCESS_AUD?: string;
  /** Optional: only these addresses, besides what the Access policy allows. */
  ADMIN_EMAILS?: string;
}

export type AdminData = Record<string, unknown> & {
  admin: { email: string; sub: string };
};

/** The admin API's whole environment (the door's, the database's, Facebook's, Telegram's), and its handlers' type. */
export type Env = AdminEnv & AdminBindings & { SOCIAL_DB: D1Database };
export type Handler = PagesFunction<Env, string, AdminData>;

interface Jwk extends JsonWebKey {
  kid: string;
}

interface Claims {
  aud: string | string[];
  email?: string;
  exp: number;
  iat?: number;
  nbf?: number;
  iss: string;
  sub: string;
}

const KEYS_TTL_MS = 3600_000;
/** Allowance for clocks that disagree by a little. */
const CLOCK_SKEW_S = 60;

let keysCache: { team: string; keys: Jwk[]; at: number } | null = null;

export function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

function base64UrlDecode(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function signingKeys(team: string, fresh = false): Promise<Jwk[]> {
  if (!fresh && keysCache && keysCache.team === team && Date.now() - keysCache.at < KEYS_TTL_MS) return keysCache.keys;
  const res = await fetch(`https://${team}/cdn-cgi/access/certs`, { cf: { cacheTtl: 3600 } } as RequestInit);
  if (!res.ok) throw new Error(`certs ${res.status}`);
  const { keys } = (await res.json()) as { keys: Jwk[] };
  keysCache = { team, keys, at: Date.now() };
  return keys;
}

/** The token's claims if it is valid for this team and application, else the reason it isn't. */
export async function verifyAccessToken(
  token: string,
  team: string,
  aud: string,
): Promise<{ claims: Claims } | { error: string }> {
  const parts = token.split(".");
  if (parts.length !== 3) return { error: "malformed token" };
  let header: { alg?: string; kid?: string };
  let claims: Claims;
  try {
    header = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0])));
    claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])));
  } catch {
    return { error: "malformed token" };
  }
  if (header.alg !== "RS256" || !header.kid) return { error: "unexpected algorithm" };

  // A key the token names that isn't cached yet is most likely a rotated one: fetch the list again, once.
  let keys = await signingKeys(team);
  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    keys = await signingKeys(team, true);
    jwk = keys.find((k) => k.kid === header.kid);
  }
  if (!jwk) return { error: "unknown signing key" };

  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, base64UrlDecode(parts[2]), signed);
  if (!ok) return { error: "bad signature" };

  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== "number" || claims.exp + CLOCK_SKEW_S < now) return { error: "token expired" };
  if (typeof claims.nbf === "number" && claims.nbf - CLOCK_SKEW_S > now) return { error: "token not yet valid" };
  if (claims.iss !== `https://${team}`) return { error: "wrong issuer" };
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(aud)) return { error: "wrong audience" };
  if (!claims.email) return { error: "no email in token" };
  return { claims };
}

function tokenFrom(request: Request): string | null {
  const header = request.headers.get("cf-access-jwt-assertion");
  if (header) return header;
  const cookie = request.headers.get("cookie") ?? "";
  const m = cookie.match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
  return m ? m[1] : null;
}

export const onRequest: PagesFunction<AdminEnv, string, AdminData> = async (context) => {
  const { request, env } = context;
  // Changes only from the admin's own pages: another site can't have a signed-in browser send them.
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("origin");
    if (origin !== new URL(request.url).origin) return json({ error: "changes are accepted from the admin's own pages only" }, 403);
  }

  const team = env.CF_ACCESS_TEAM_DOMAIN?.trim();
  const aud = env.CF_ACCESS_AUD?.trim();
  if (!team || !aud) return json({ error: "admin not configured" }, 503);

  const token = tokenFrom(request);
  if (!token) return json({ error: "not signed in" }, 401);

  let result: Awaited<ReturnType<typeof verifyAccessToken>>;
  try {
    result = await verifyAccessToken(token, team, aud);
  } catch (e) {
    return json({ error: `cannot verify: ${e instanceof Error ? e.message : String(e)}` }, 503);
  }
  if ("error" in result) return json({ error: result.error }, 401);

  const email = result.claims.email!.toLowerCase();
  const allowed = (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length && !allowed.includes(email)) return json({ error: "not an admin" }, 403);

  context.data.admin = { email, sub: result.claims.sub };
  const response = await context.next();
  // Nothing from the admin API is ever cached or shared.
  const headers = new Headers(response.headers);
  headers.set("cache-control", "no-store");
  return new Response(response.body, { status: response.status, headers });
};
