import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AUTH_STORAGE_KEY } from "@/components/account";

// Accounts live in Supabase (docs/subscriptions.md). The project URL and publishable key are public by design:
// what each visitor may read or change is decided by row-level security in the database (supabase/migrations).
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://errwyvuguelgifuusbky.supabase.co";
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_KEY ?? "sb_publishable_futQPeNTqscx6x4l7eW4gw_fX-97Lfh";

let client: SupabaseClient | undefined;

/** The browser's Supabase client. Only /account/ loads it; a sign-in link or Google lands there with ?code=. */
export function supabase(): SupabaseClient {
  client ??= createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { storageKey: AUTH_STORAGE_KEY, flowType: "pkce", detectSessionInUrl: true },
  });
  return client;
}

/** Whether "Continue with Google" is switched on in the Supabase project. */
export async function googleEnabled(): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_KEY } });
    return Boolean(((await res.json()) as { external?: { google?: boolean } }).external?.google);
  } catch {
    return false;
  }
}
