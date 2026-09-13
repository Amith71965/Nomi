import type { Metadata } from "next";
import Link from "next/link";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Wordmark } from "@/components/landing/nav";
import { Badge } from "@/components/ui/badge";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Assistant" };
export const dynamic = "force-dynamic";

/**
 * Authenticated shell placeholder. proxy.ts redirects signed-out visitors to
 * /login before this renders. The conversation UI lands in the next phase.
 */
export default async function AppPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border bg-surface/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1120px] items-center justify-between px-5 sm:px-8">
          <div className="flex items-center gap-3">
            <Wordmark className="text-xl" />
            <Badge tone="accent">Private preview</Badge>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted sm:inline">{user?.email ?? "Signed in"}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-[800px] flex-1 flex-col items-center justify-center px-5 py-16 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.12em] text-muted">Signed in</p>
        <h1 className="mt-3 font-display text-[36px] leading-tight">The assistant is being wired up.</h1>
        <p className="mt-4 max-w-[48ch] text-muted">
          Memory, research, and approval land here in the next phases. Until then, this page only proves that sign-in and
          session handling work.
        </p>
        <Link href="/" className="mt-8 text-sm text-accent underline-offset-4 hover:underline">
          Back to the overview
        </Link>
      </main>
    </div>
  );
}
