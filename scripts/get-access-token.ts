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

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const email = process.env.DEMO_EMAIL;
  const password = process.env.DEMO_PASSWORD;

  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env");
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

main();
