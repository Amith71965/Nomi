import { NextResponse } from "next/server";
import { safeAppPath } from "@/lib/auth-paths";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Lands the email-confirmation link. Supabase sends either a PKCE `code` or a
 * `token_hash` + `type` pair depending on the email template; both become a
 * session cookie here. Any failure goes back to login with a notice; nothing
 * about the token is logged.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const next = safeAppPath(url.searchParams.get("next"));
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");

  const supabase = await createServerSupabase();
  let failed = false;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    failed = Boolean(error);
  } else if (tokenHash && (type === "signup" || type === "email" || type === "magiclink" || type === "recovery")) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    failed = Boolean(error);
  } else {
    failed = true;
  }

  if (failed) {
    return NextResponse.redirect(`${origin}/login?notice=link_invalid`, { headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.redirect(`${origin}${next}`, { headers: { "Cache-Control": "no-store" } });
}
