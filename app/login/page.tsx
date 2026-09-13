import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";
import { Wordmark } from "@/components/landing/nav";

export const metadata: Metadata = { title: "Sign in" };

/** Only paths inside the app may be used as a post-login destination. */
function safeNext(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && /^\/app(\/[A-Za-z0-9_\-/]*)?$/.test(candidate) ? candidate : "/app";
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNext(params.next);

  return (
    <main className="grain relative flex flex-1 items-center justify-center px-5 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Wordmark className="text-3xl" />
          <p className="mt-2 text-sm text-muted">Private preview · sign in with the demo account</p>
        </div>
        <div className="rounded-card border border-border bg-surface p-6 shadow-soft">
          <LoginForm next={next} />
        </div>
        <p className="mt-6 text-center text-xs text-muted">
          There is no public sign-up. Nomi stores only what you explicitly tell it, and you can edit or delete every memory.
        </p>
      </div>
    </main>
  );
}
