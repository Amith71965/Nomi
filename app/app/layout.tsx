import Link from "next/link";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Wordmark } from "@/components/landing/nav";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/app", label: "Assistant" },
  { href: "/app/connections", label: "Linked apps" },
] as const;

/** Signed-in frame: wordmark, section links, account, sign-out. proxy.ts guarantees a session here. */
export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-surface/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1120px] items-center justify-between gap-4 px-5 sm:px-8">
          <div className="flex items-center gap-6">
            <Wordmark className="text-xl" />
            <nav aria-label="App" className="flex items-center gap-4">
              {NAV.map((item) => (
                <Link key={item.href} href={item.href} className="text-sm text-muted transition-colors hover:text-text">
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden max-w-[24ch] truncate text-sm text-muted sm:inline">{user?.email ?? "Signed in"}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
