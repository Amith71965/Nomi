import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser client. Only the public URL and publishable key ever reach the
 * browser; the values are inlined at build time from NEXT_PUBLIC_* vars.
 * Reads are limited by RLS to the signed-in user's own rows; all writes go
 * through authenticated API routes.
 */
export function createBrowserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase public configuration is missing.");
  return createBrowserClient(url, key);
}
