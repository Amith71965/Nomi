import type { Metadata } from "next";
import { Conversation } from "@/components/assistant/conversation";
import { getEnv, voiceConfigured } from "@/lib/env";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Assistant" };
export const dynamic = "force-dynamic";

/** The assistant. proxy.ts guarantees a session; the client loads its own history. */
export default async function AppPage() {
  await createServerSupabase(); // marks the render dynamic before env is read
  const env = getEnv();
  return (
    <main className="flex flex-1 flex-col">
      <Conversation voiceEnabled={voiceConfigured(env)} />
    </main>
  );
}
