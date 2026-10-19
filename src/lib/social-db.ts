/**
 * The admin's database (D1 bartaboard-social; schema in migrations/), reached two ways with the same calls:
 *   - from the Pages Functions, through the SOCIAL_DB binding (fromBinding)
 *   - from GitHub Actions and scripts, through Cloudflare's API (fromApi)
 * The queries themselves are in social-store.ts. Nothing here uses Node or Workers-only APIs.
 */

export type SqlValue = string | number | null;

export interface Db {
  /** Every row the statement returns. */
  all<T = Record<string, unknown>>(sql: string, params?: SqlValue[]): Promise<T[]>;
  /** The first row, or null. */
  first<T = Record<string, unknown>>(sql: string, params?: SqlValue[]): Promise<T | null>;
  /** A statement that changes rows: how many it changed. */
  run(sql: string, params?: SqlValue[]): Promise<{ changes: number }>;
}

/** The parts of Workers' D1Database used here (structural, so this file needs no Workers types). */
export interface D1Like {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      all<T>(): Promise<{ results: T[] }>;
      first<T>(): Promise<T | null>;
      run(): Promise<{ meta: { changes?: number } }>;
    };
  };
}

export function fromBinding(d1: D1Like): Db {
  return {
    all: async <T>(sql: string, params: SqlValue[] = []) => (await d1.prepare(sql).bind(...params).all<T>()).results,
    first: <T>(sql: string, params: SqlValue[] = []) => d1.prepare(sql).bind(...params).first<T>(),
    run: async (sql: string, params: SqlValue[] = []) => ({ changes: (await d1.prepare(sql).bind(...params).run()).meta.changes ?? 0 }),
  };
}

export interface ApiAccess {
  accountId: string;
  databaseId: string;
  token: string;
}

interface ApiResponse<T> {
  success: boolean;
  errors?: { code: number; message: string }[];
  result?: { results: T[]; success: boolean; meta: { changes?: number } }[];
}

/** Through Cloudflare's API (POST /accounts/:id/d1/database/:db/query): one statement a call. */
export function fromApi({ accountId, databaseId, token }: ApiAccess): Db {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
  async function query<T>(sql: string, params: SqlValue[] = []) {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ sql, params }),
    });
    const body = (await res.json().catch(() => ({ success: false }))) as ApiResponse<T>;
    if (!res.ok || !body.success || !body.result?.[0]) {
      const why = body.errors?.map((e) => `${e.code} ${e.message}`).join("; ") || `HTTP ${res.status}`;
      throw new Error(`D1: ${why} (${sql.slice(0, 80)})`);
    }
    return body.result[0];
  }
  return {
    all: async <T>(sql: string, params?: SqlValue[]) => (await query<T>(sql, params)).results,
    first: async <T>(sql: string, params?: SqlValue[]) => (await query<T>(sql, params)).results[0] ?? null,
    run: async (sql: string, params?: SqlValue[]) => ({ changes: (await query(sql, params)).meta.changes ?? 0 }),
  };
}

/**
 * The API route from the environment: CLOUDFLARE_ACCOUNT_ID, a token that may edit D1 (SOCIAL_DB_TOKEN, else
 * CLOUDFLARE_API_TOKEN) and the database's id (SOCIAL_DB_ID, else wrangler.toml's, passed in as `wranglerToml`).
 * Null when something is missing.
 */
export function apiAccessFromEnv(env: Record<string, string | undefined>, wranglerToml?: string): ApiAccess | null {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const token = env.SOCIAL_DB_TOKEN || env.CLOUDFLARE_API_TOKEN;
  const databaseId =
    env.SOCIAL_DB_ID || wranglerToml?.match(/binding\s*=\s*"SOCIAL_DB"[\s\S]*?database_id\s*=\s*"([^"]+)"/)?.[1];
  return accountId && token && databaseId ? { accountId, databaseId, token } : null;
}
