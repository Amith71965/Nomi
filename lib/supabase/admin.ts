import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "@/lib/env";

/**
 * Service-role client. SERVER ONLY. Bypasses RLS, so every query made with it
 * must filter by the verified user's ID. Import only from route handlers,
 * services, and scripts; never from anything that can reach the browser.
 */
let cached: SupabaseClient | undefined;

export function createAdminSupabase(): SupabaseClient {
  if (cached) return cached;
  const env = getEnv();
  cached = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { "X-Client-Info": "nomi-server" } },
  });
  return cached;
}
