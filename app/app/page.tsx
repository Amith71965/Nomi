import type { Metadata } from "next";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";

export const metadata: Metadata = { title: "Assistant" };
export const dynamic = "force-dynamic";

/**
 * Authenticated placeholder. proxy.ts redirects signed-out visitors to /login
 * before this renders. The conversation UI lands in the next phase; linking
 * already works from the Linked apps page.
 */
export default function AppPage() {
  return (
    <main className="mx-auto flex w-full max-w-[800px] flex-1 flex-col items-center justify-center px-5 py-16 text-center">
      <p className="font-mono text-xs uppercase tracking-[0.12em] text-muted">Signed in</p>
      <h1 className="mt-3 font-display text-[36px] leading-tight">The assistant is being wired up.</h1>
      <p className="mt-4 max-w-[48ch] text-muted">
        Memory, research, and approval land here next. You can already choose which apps Nomi may work with.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link href="/app/connections" className={buttonClasses("primary", "md")}>
          Choose linked apps
        </Link>
        <Link href="/" className={buttonClasses("quiet", "md")}>
          Back to the overview
        </Link>
      </div>
    </main>
  );
}
