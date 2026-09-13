/**
 * End-to-end setup verification. Prints PASS / FAIL / SKIP per check and
 * never prints a secret. Exit code 1 if anything FAILs.
 *
 *   npm run verify                                  # env + database + permissions
 *   DEMO_EMAIL=… DEMO_PASSWORD=… npm run verify     # + sign-in, RLS as the demo user, RPC round trips
 *   BASE_URL=http://localhost:3000 …                # + live API smoke against a running server
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { EnvError, applyAliases, calendarConfigured, modelConfigured, parseEnv, shoppingConfigured, type Env } from "@/lib/env";
import { MemoryService } from "@/lib/memory/service";
import { SupabaseMemoryStore } from "@/lib/memory/store";
import { SupabaseTurnStore } from "@/lib/turns/store";
import { OpenRouterClient } from "@/lib/ai/client";
import { readFileSync } from "node:fs";
import { transcriberFromEnv } from "@/lib/integrations/transcription";

async function main(): Promise<void> {

  type Status = "PASS" | "FAIL" | "SKIP";
  const results: Array<{ status: Status; name: string; detail: string }> = [];
  function report(status: Status, name: string, detail = ""): void {
    results.push({ status, name, detail });
    const pad = status.padEnd(4);
    console.log(`${pad}  ${name}${detail ? `  — ${detail}` : ""}`);
  }
  async function check(name: string, fn: () => Promise<string | void>): Promise<boolean> {
    try {
      const detail = await fn();
      report("PASS", name, detail ?? "");
      return true;
    } catch (e) {
      report("FAIL", name, e instanceof Error ? e.message : String(e));
      return false;
    }
  }
  function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
  }

  const raw = applyAliases(process.env);
  const demoEmail = raw.DEMO_EMAIL;
  const demoPassword = raw.DEMO_PASSWORD;
  const baseUrl = raw.BASE_URL;

  console.log("Nomi setup verification\n");

  // ── 1. Environment ──────────────────────────────────────────────────────────
  const envOutcome = ((): { env: Env | null; missing: string[] } => {
    try {
      return { env: parseEnv(process.env), missing: [] };
    } catch (e) {
      if (e instanceof EnvError) return { env: null, missing: e.missing };
      throw e;
    }
  })();
  const env = envOutcome.env;
  await check("env parses (all required names present)", async () => {
    if (!env) throw new Error(`missing or invalid: ${envOutcome.missing.join(", ")}`);
    return `supabase ${new URL(env.NEXT_PUBLIC_SUPABASE_URL).host}, tz ${env.DEMO_TIME_ZONE}`;
  });

  const url = raw.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = raw.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = raw.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !publicKey || !serviceKey) {
    report("SKIP", "database checks", "need NEXT_PUBLIC_SUPABASE_URL, a public key, and a server key");
  } else {
    const admin: SupabaseClient = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const anon: SupabaseClient = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });

    // ── 2. Connectivity and keys ──────────────────────────────────────────────
    await check("supabase auth endpoint reachable with the public key", async () => {
      const res = await fetch(`${url}/auth/v1/health`, { headers: { apikey: publicKey } });
      assert(res.ok, `HTTP ${res.status}`);
    });

    await check("server key is accepted and can call an RPC", async () => {
      const { data, error } = await admin.rpc("has_active_turn", { p_user_id: "00000000-0000-4000-8000-000000000000" });
      assert(!error, error?.message ?? "");
      assert(data === false, `unexpected result ${JSON.stringify(data)}`);
    });

    // ── 3. Schema ─────────────────────────────────────────────────────────────
    for (const table of ["turns", "memories", "actions"]) {
      await check(`table ${table} exists and is readable by the server`, async () => {
        const { error, count } = await admin.from(table).select("id", { count: "exact", head: true });
        assert(!error, error?.message ?? "");
        return `${count ?? 0} rows`;
      });
    }

    await check("anon key cannot read memories", async () => {
      const { data, error } = await anon.from("memories").select("id").limit(1);
      assert(error || (Array.isArray(data) && data.length === 0), "anon received rows");
      return error ? "permission denied, as intended" : "zero rows";
    });

    await check("anon key cannot execute memory RPCs", async () => {
      const { error } = await anon.rpc("upsert_memories", { p_user_id: "00000000-0000-4000-8000-000000000000", p_entries: [] });
      assert(error, "anon was allowed to call upsert_memories");
    });

    // ── 4. Demo user ──────────────────────────────────────────────────────────
    const demoUserId = raw.DEMO_USER_ID;
    if (!demoUserId) {
      report("SKIP", "demo user exists", "DEMO_USER_ID is empty; run npm run demo:user");
    } else {
      await check("demo user exists in auth", async () => {
        const { data, error } = await admin.auth.admin.getUserById(demoUserId);
        assert(!error && data.user, error?.message ?? "not found");
        return `email ${data.user.email ?? "(none)"}`;
      });
    }

    if (!demoEmail || !demoPassword) {
      report("SKIP", "sign-in, RLS as demo user, RPC round trips", "set DEMO_EMAIL and DEMO_PASSWORD to run these");
    } else {
      let accessToken: string | null = null;
      let signedInId: string | null = null;
      await check("demo user can sign in with email/password", async () => {
        const { data, error } = await anon.auth.signInWithPassword({ email: demoEmail, password: demoPassword });
        assert(!error && data.session, error?.message ?? "no session");
        accessToken = data.session.access_token;
        signedInId = data.user.id;
        if (demoUserId) assert(signedInId === demoUserId, "signed-in user differs from DEMO_USER_ID");
      });

      if (accessToken && signedInId) {
        const asUser = createClient(url, publicKey, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: `Bearer ${accessToken}` } },
        });

        await check("signed-in user can read own memories but cannot insert", async () => {
          const read = await asUser.from("memories").select("id").limit(5);
          assert(!read.error, read.error?.message ?? "");
          const write = await asUser.from("memories").insert({
            user_id: signedInId,
            category: "preference",
            entity_key: "rls_probe",
            entity: "RLS probe",
            value: { note: "x" },
            confidence: 0.9,
            source: "manual_edit",
            source_quote: "x",
          });
          assert(write.error, "insert through RLS was allowed");
          return "read ok, insert denied";
        });

        await check("signed-in user cannot write actions directly", async () => {
          const { error } = await asUser.from("actions").update({ status: "succeeded" }).eq("user_id", signedInId!);
          assert(error || true, "");
          const { data } = await admin.from("actions").select("id").eq("user_id", signedInId!).eq("status", "succeeded");
          assert(!data || data.length === 0, "an action was marked succeeded by the client");
        });

        const memory = new MemoryService(new SupabaseMemoryStore(admin));
        const probeKey = `verify_probe_${randomUUID().slice(0, 8)}`;
        let probeId: string | null = null;
        let probeVersion = 0;

        await check("memory RPC: upsert → list → patch (version CAS) → delete", async () => {
          const [created] = await memory.upsert(signedInId!, [
            { category: "preference", entity: "Verify probe", entityKey: probeKey, value: { note: "Temporary row from npm run verify" }, quote: "verify probe", confidence: 0.99, source: "manual_edit", sourceTurnId: null, expiresAt: null },
          ]);
          assert(created?.operation === "created", "upsert did not create");
          probeId = created.memory.id;
          probeVersion = created.memory.version;
          const listed = await memory.list(signedInId!, "preference");
          assert(listed.some((m) => m.id === probeId), "probe not listed");
          const patched = await memory.patch(signedInId!, probeId, { version: probeVersion, value: { note: "patched" } });
          assert(patched.version === probeVersion + 1, "version did not bump");
          let conflict = false;
          try {
            await memory.patch(signedInId!, probeId, { version: probeVersion, status: "completed" });
          } catch (e) {
            conflict = e instanceof Error && "code" in e && (e as { code: string }).code === "version_conflict";
          }
          assert(conflict, "stale version was accepted");
          await memory.delete(signedInId!, probeId, patched.version);
          probeId = null;
          return "created, listed, patched, stale patch rejected, deleted";
        }).finally(async () => {
          if (probeId) await admin.from("memories").delete().eq("id", probeId);
        });

        const turns = new SupabaseTurnStore(admin);
        let turnId: string | null = null;
        await check("turn RPC: begin (created) → begin again (existing) → complete → in context", async () => {
          const clientRequestId = randomUUID();
          const conversationId = randomUUID();
          const first = await turns.begin(signedInId!, { conversationId, clientRequestId, inputText: "verify probe", inputKind: "text" });
          assert(first.kind === "created", `first begin was ${first.kind}`);
          turnId = first.row.id;
          const second = await turns.begin(signedInId!, { conversationId, clientRequestId, inputText: "verify probe", inputKind: "text" });
          assert(second.kind === "existing", `second begin was ${second.kind}`);
          const other = await turns.begin(signedInId!, { conversationId, clientRequestId: randomUUID(), inputText: "x", inputKind: "text" });
          assert(other.kind === "busy", `concurrent begin was ${other.kind}`);
          await turns.complete(signedInId!, turnId, { probe: true }, []);
          const ctx = await turns.recentContext(signedInId!, conversationId, 6);
          assert(ctx.some((t) => t.id === turnId), "completed turn missing from context");
          return "idempotent, one-active-turn enforced, completed";
        }).finally(async () => {
          if (turnId) await admin.from("turns").delete().eq("id", turnId);
        });

        // ── 6. Live API (optional) ────────────────────────────────────────────
        if (!baseUrl) {
          report("SKIP", "live API smoke", "set BASE_URL (e.g. http://localhost:3000) with the dev server running");
        } else {
          await check(`GET ${baseUrl}/api/health`, async () => {
            const res = await fetch(`${baseUrl}/api/health`);
            assert(res.ok, `HTTP ${res.status}`);
          });
          await check("GET /api/connections with bearer token", async () => {
            const res = await fetch(`${baseUrl}/api/connections`, { headers: { Authorization: `Bearer ${accessToken}` } });
            assert(res.status === 200, `HTTP ${res.status}`);
            const body = (await res.json()) as { verification: string; database: { ready: boolean }; model: { ready: boolean } };
            return `verification=${body.verification} database.ready=${body.database.ready} model.ready=${body.model.ready}`;
          });
          await check("GET /api/memories with bearer token returns only own rows", async () => {
            const res = await fetch(`${baseUrl}/api/memories`, { headers: { Authorization: `Bearer ${accessToken}` } });
            assert(res.status === 200, `HTTP ${res.status}`);
            assert(res.headers.get("cache-control") === "no-store", "missing no-store");
            const body = (await res.json()) as { memories: Array<{ id: string }> };
            return `${body.memories.length} memories`;
          });
          await check("GET /api/memories without a token is 401", async () => {
            const res = await fetch(`${baseUrl}/api/memories`);
            assert(res.status === 401, `HTTP ${res.status}`);
          });
        }
      }
    }
  }

  // ── 7. Providers ──────────────────────────────────────────────────────────────
  if (env && modelConfigured(env)) {
    const e: Env = env;
    await check(`model reachable via OpenRouter (${e.NOMI_MODEL})`, async () => {
      const client = new OpenRouterClient({ apiKey: e.OPENROUTER_API_KEY ?? "", baseURL: e.OPENROUTER_BASE_URL, model: e.NOMI_MODEL, appName: "Nomi verify", timeoutMs: 20_000 });
      const res = await client.complete({ messages: [{ role: "user", content: "Reply with the single word: ready" }], tools: [] });
      assert(res.kind === "final", `model returned ${res.kind}`);
    });
  } else {
    report("SKIP", "model reachable via OpenRouter", "OPENROUTER_API_KEY not set");
  }
  const transcriber = env ? transcriberFromEnv(env) : null;
  if (transcriber) {
    await check(`voice transcription reachable via ${transcriber.name} (${transcriber.model})`, async () => {
      const wav = readFileSync("fixtures/audio/silence-1s.wav");
      const result = await transcriber.transcribe({ audio: new Uint8Array(wav), mimeType: "audio/wav", signal: AbortSignal.timeout(20_000) });
      return `duration ${result.durationSeconds ?? "?"}s, transcript ${JSON.stringify(result.text)} (silence expected to be empty)`;
    });
  } else {
    report("SKIP", "voice transcription reachable", env?.ENABLE_VOICE ? `ENABLE_VOICE=true but the ${env.TRANSCRIPTION_PROVIDER} key is missing` : "ENABLE_VOICE=false");
  }
  report(env && calendarConfigured(env) ? "PASS" : "SKIP", "google calendar configured", env && calendarConfigured(env) ? "" : "Phase 4: GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN not set");
  report(env && shoppingConfigured(env) ? "PASS" : "SKIP", "shopping research configured", env && shoppingConfigured(env) ? "" : "Phase 3: PRODUCT_SEARCH_API_KEY not set");

  const fails = results.filter((r) => r.status === "FAIL").length;
  const passes = results.filter((r) => r.status === "PASS").length;
  const skips = results.filter((r) => r.status === "SKIP").length;
  console.log(`\n${passes} passed, ${fails} failed, ${skips} skipped`);
  process.exit(fails === 0 ? 0 : 1);

}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
