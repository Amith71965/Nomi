/**
 * Prints a Supabase access token for the demo user so Postman / curl can call
 * the API with `Authorization: Bearer <token>`.
 *
 *   DEMO_EMAIL=you@example.com DEMO_PASSWORD='...' npm run token
 *
 * Credentials are read from the process environment only and never written
 * anywhere. The token expires (default one hour).
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { applyAliases } from "@/lib/env";

async function main(): Promise<void> {

  const raw = applyAliases(process.env);
  const url = raw.NEXT_PUBLIC_SUPABASE_URL;
  const key = raw.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const email = raw.DEMO_EMAIL;
  const password = raw.DEMO_PASSWORD;

  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or a public key in .env");
    process.exit(1);
  }
  if (!email || !password) {
    console.error("Usage: DEMO_EMAIL=... DEMO_PASSWORD=... npm run token");
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    console.error(`Sign-in failed: ${error?.message ?? "no session"}`);
    process.exit(1);
  }
  console.log(`user_id=${data.user.id}`);
  console.log(`expires_in=${data.session.expires_in}s`);
  console.log(data.session.access_token);

}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
