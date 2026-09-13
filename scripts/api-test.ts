/**
 * Runs the Postman collection against a running server with a real session.
 * Signs in as the demo user to obtain a bearer token, then hands the token to
 * newman. Nothing is written to disk.
 *
 *   DEMO_EMAIL=... DEMO_PASSWORD=... npm run api:test
 *   BASE_URL=https://your-deploy.example DEMO_EMAIL=... DEMO_PASSWORD=... npm run api:test
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import newman from "newman";

const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const email = process.env.DEMO_EMAIL;
const password = process.env.DEMO_PASSWORD;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or the publishable/anon key in .env");
  process.exit(1);
}
if (!email || !password) {
  console.error("Usage: DEMO_EMAIL=... DEMO_PASSWORD=... npm run api:test");
  process.exit(1);
}

const { data, error } = await createClient(url, key, { auth: { persistSession: false } }).auth.signInWithPassword({ email, password });
if (error || !data.session) {
  console.error(`Sign-in failed: ${error?.message ?? "no session"}`);
  process.exit(1);
}

newman.run(
  {
    collection: "postman/Nomi.postman_collection.json",
    envVar: [
      { key: "baseUrl", value: baseUrl },
      { key: "accessToken", value: data.session.access_token },
    ],
    reporters: ["cli"],
    reporter: { cli: { noBanner: true } },
  },
  (err, summary) => {
    if (err) {
      console.error(err.message);
      process.exit(1);
    }
    const failures = summary.run.failures.length;
    console.log(`\n${failures === 0 ? "All assertions passed." : `${failures} assertion(s) failed.`}`);
    process.exit(failures === 0 ? 0 : 1);
  },
);
