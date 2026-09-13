import { getEnv } from "@/lib/env";
import { ApiError } from "@/lib/errors";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";

export interface AuthContext {
  userId: string;
  email: string | null;
  isDemoUser: boolean;
}

/**
 * Verify identity server-side. Accepts the Supabase session cookie (browser)
 * or `Authorization: Bearer <access_token>` (Postman, scripts). The user ID
 * is always derived here; request bodies never carry one.
 */
export async function requireUser(request: Request): Promise<AuthContext> {
  const header = request.headers.get("authorization");
  let user: { id: string; email?: string } | null = null;

  if (header && /^bearer\s+/i.test(header)) {
    const token = header.replace(/^bearer\s+/i, "").trim();
    if (token.length === 0) throw unauthenticated();
    const { data, error } = await createAdminSupabase().auth.getUser(token);
    if (error || !data.user) throw unauthenticated();
    user = data.user;
  } else {
    const supabase = await createServerSupabase();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw unauthenticated();
    user = data.user;
  }

  const env = getEnv();
  return { userId: user.id, email: user.email ?? null, isDemoUser: user.id === env.DEMO_USER_ID };
}

/** Calendar and other private-demo routes are limited to the allowlisted account. */
export function requireDemoUser(ctx: AuthContext): void {
  if (!ctx.isDemoUser) {
    throw new ApiError("demo_restricted", "This private demo is limited to the demo account.");
  }
}

function unauthenticated(): ApiError {
  return new ApiError("unauthenticated", "Sign in to continue.");
}
