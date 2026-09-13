import { createClient } from "@supabase/supabase-js";
import { applyAliases } from "@/lib/env";

/**
 * Scoped reset of ONE account's Nomi data, for rehearsing the demo.
 * Dry run by default: it prints what it would delete and changes nothing.
 * Pass RESET_CONFIRM=true to actually delete. Never touches auth users,
 * another account's rows, or any table outside Nomi's four.
 */

const TABLES = ["actions", "memories", "turns"] as const; // children first
const KEEP_CONNECTIONS = "connections";

async function main() {
  const raw = applyAliases(process.env);
  const url = raw.NEXT_PUBLIC_SUPABASE_URL;
  const key = raw.SUPABASE_SERVICE_ROLE_KEY;
  const userId = process.env.RESET_USER_ID ?? raw.DEMO_USER_ID;
  const confirm = process.env.RESET_CONFIRM === "true";
  const alsoUnlink = process.env.RESET_UNLINK === "true";

  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or a Supabase service key.");
    process.exit(1);
  }
  if (!userId) {
    console.error("Set RESET_USER_ID (or DEMO_USER_ID) to the account to reset.");
    process.exit(1);
  }

  const db = createClient(url, key, { auth: { persistSession: false } });
  console.log(`${confirm ? "DELETING" : "DRY RUN"} for user ${userId}\n`);

  for (const table of TABLES) {
    const { count, error } = await db.from(table).select("id", { count: "exact", head: true }).eq("user_id", userId);
    if (error) {
      console.error(`  ${table}: could not count (${error.message})`);
      process.exit(1);
    }
    console.log(`  ${table}: ${count ?? 0} row(s)${confirm ? " → deleting" : ""}`);
    if (confirm && (count ?? 0) > 0) {
      const { error: deleteError } = await db.from(table).delete().eq("user_id", userId);
      if (deleteError) {
        console.error(`  ${table}: delete failed (${deleteError.message})`);
        process.exit(1);
      }
    }
  }

  const { count: links } = await db.from(KEEP_CONNECTIONS).select("id", { count: "exact", head: true }).eq("user_id", userId);
  if (alsoUnlink) {
    console.log(`  ${KEEP_CONNECTIONS}: ${links ?? 0} link(s)${confirm ? " → deleting" : ""}`);
    if (confirm && (links ?? 0) > 0) await db.from(KEEP_CONNECTIONS).delete().eq("user_id", userId);
  } else {
    console.log(`  ${KEEP_CONNECTIONS}: ${links ?? 0} link(s) kept (set RESET_UNLINK=true to remove them too)`);
  }

  console.log(confirm ? "\nDone." : "\nNothing was changed. Re-run with RESET_CONFIRM=true to delete.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
