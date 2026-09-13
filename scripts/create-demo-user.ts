/**
 * Creates (or finds) the private demo user with the Supabase Admin API and
 * writes its UUID into .env as DEMO_USER_ID. Run once per project.
 *
 *   DEMO_EMAIL=you@example.com DEMO_PASSWORD='choose-a-strong-one' npm run demo:user
 *   DEMO_RESET_PASSWORD=true …  also sets the password when the user already exists
 *
 * The password is read from the process environment only and never written
 * to disk. Requires the Supabase URL and a server key in .env (any accepted name).
 */
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { applyAliases } from "@/lib/env";

async function main(): Promise<void> {

  const raw = applyAliases(process.env);
  const url = raw.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = raw.SUPABASE_SERVICE_ROLE_KEY;
  const email = raw.DEMO_EMAIL?.trim();
  const password = raw.DEMO_PASSWORD;
  const resetPassword = raw.DEMO_RESET_PASSWORD === "true";

  if (!url || !serviceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or a server key (SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEY / SUPABASE_LEGACY_SERVICE_ROLE_SECRET_KEY) in .env");
    process.exit(1);
  }
  if (!email || !password) {
    console.error("Usage: DEMO_EMAIL=... DEMO_PASSWORD=... npm run demo:user");
    process.exit(1);
  }
  if (password.length < 12) {
    console.error("Choose a password of at least 12 characters.");
    process.exit(1);
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  async function findByEmail(): Promise<string | null> {
    let page = 1;
    for (;;) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error(`listUsers failed: ${error.message}`);
      const hit = data.users.find((u) => u.email?.toLowerCase() === email!.toLowerCase());
      if (hit) return hit.id;
      if (data.users.length < 200) return null;
      page += 1;
    }
  }

  let userId = await findByEmail();
  if (userId) {
    console.log(`Demo user already exists: ${userId}`);
    if (resetPassword) {
      const { error } = await admin.auth.admin.updateUserById(userId, { password });
      if (error) {
        console.error(`Password update failed: ${error.message}`);
        process.exit(1);
      }
      console.log("Password updated.");
    }
  } else {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) {
      console.error(`createUser failed: ${error?.message ?? "unknown"}`);
      process.exit(1);
    }
    userId = data.user.id;
    console.log(`Created demo user: ${userId}`);
  }

  const envPath = ".env";
  const lines = readFileSync(envPath, "utf8").split("\n");
  let replaced = false;
  const next = lines.map((line) => {
    if (/^DEMO_USER_ID=/.test(line)) {
      replaced = true;
      return `DEMO_USER_ID=${userId}`;
    }
    return line;
  });
  if (!replaced) next.push(`DEMO_USER_ID=${userId}`);
  writeFileSync(envPath, next.join("\n"));
  console.log("Wrote DEMO_USER_ID to .env");

}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
