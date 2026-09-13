import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getEnv } from "@/lib/env";

/**
 * Cookie-bound server client for route handlers and server components.
 * Create one per request; never share across requests. Token refreshes are
 * written back through `setAll`; in read-only contexts (server components)
 * the write is swallowed and proxy.ts performs the refresh instead.
 */
export async function createServerSupabase() {
  const env = getEnv();
  const cookieStore = await cookies();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Read-only cookie store (server component render). proxy.ts refreshes sessions.
        }
      },
    },
  });
}
