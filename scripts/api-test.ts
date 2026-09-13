/**
 * Runs the Postman collection against a running server with a real session.
 * Signs in as the demo user, seeds one probe memory so PATCH/DELETE checks
 * have a target, runs newman, then removes the probe. Nothing is written to disk.
 *
 *   DEMO_EMAIL=... DEMO_PASSWORD=... npm run api:test
 *   BASE_URL=https://your-deploy.example DEMO_EMAIL=... DEMO_PASSWORD=... npm run api:test
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import newman from "newman";
import { applyAliases } from "@/lib/env";
import { MemoryService } from "@/lib/memory/service";
import { SupabaseMemoryStore } from "@/lib/memory/store";

async function main(): Promise<void> {

  const raw = applyAliases(process.env);
  const baseUrl = raw.BASE_URL ?? "http://localhost:3000";
  const url = raw.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = raw.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = raw.SUPABASE_SERVICE_ROLE_KEY;
  const email = raw.DEMO_EMAIL;
  const password = raw.DEMO_PASSWORD;

  if (!url || !publicKey || !serviceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL, a public key, or a server key in .env");
    process.exit(1);
  }
  if (!email || !password) {
    console.error("Usage: DEMO_EMAIL=... DEMO_PASSWORD=... npm run api:test");
    process.exit(1);
  }

  const health = await fetch(`${baseUrl}/api/health`).catch(() => null);
  if (!health || !health.ok) {
    console.error(`No server answering at ${baseUrl}/api/health. Start it with: npm run dev`);
    process.exit(1);
  }

  const { data, error } = await createClient(url, publicKey, { auth: { persistSession: false } }).auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    console.error(`Sign-in failed: ${error?.message ?? "no session"}`);
    process.exit(1);
  }
  const userId = data.user.id;

  const memory = new MemoryService(new SupabaseMemoryStore(createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })));
  const PROBE_KEY = "api_test_probe";
  const [seeded] = await memory.upsert(userId, [
    {
      category: "preference",
      entity: "API test probe",
      entityKey: PROBE_KEY,
      value: { note: "Temporary row created by npm run api:test" },
      quote: "api test probe",
      confidence: 0.99,
      source: "manual_edit",
      sourceTurnId: null,
      expiresAt: null,
    },
  ]);
  console.log(`Seeded probe memory ${seeded?.memory.id ?? "(already present)"} for the Postman PATCH/DELETE checks.`);

  async function cleanup(): Promise<void> {
    const rows = await memory.list(userId, "preference");
    const probe = rows.find((r) => r.entityKey === PROBE_KEY);
    if (probe) {
      await memory.delete(userId, probe.id, probe.version).catch(() => undefined);
      console.log("Removed probe memory.");
    }
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
      void cleanup().finally(() => {
        if (err) {
          console.error(err.message);
          process.exit(1);
        }
        const failures = summary.run.failures.length;
        console.log(`\n${failures === 0 ? "All assertions passed." : `${failures} assertion(s) failed.`}`);
        process.exit(failures === 0 ? 0 : 1);
      });
    },
  );

}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
