import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";
import { Wordmark } from "@/components/landing/nav";
import { safeAppPath } from "@/lib/auth-paths";

export const metadata: Metadata = { title: "Sign in" };

const NOTICES: Record<string, string> = {
  confirmed: "Email confirmed. Sign in to continue.",
  link_invalid: "That confirmation link is invalid or has expired. Sign in, or create the account again to get a new one.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeAppPath(Array.isArray(params.next) ? params.next[0] : params.next);
  const noticeKey = Array.isArray(params.notice) ? params.notice[0] : params.notice;
  const notice = noticeKey ? NOTICES[noticeKey] : undefined;

  return (
    <main className="grain relative flex flex-1 items-center justify-center px-5 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Wordmark className="text-3xl" />
          <p className="mt-2 text-sm text-muted">Sign in to your account</p>
        </div>
        {notice && (
          <p role="status" className="mb-4 rounded-control border border-border bg-surface-2 px-3 py-2 text-sm">
            {notice}
          </p>
        )}
        <div className="rounded-card border border-border bg-surface p-6 shadow-soft">
          <LoginForm next={next} />
        </div>
        <p className="mt-6 text-center text-sm text-muted">
          New here?{" "}
          <Link href="/signup" className="text-accent underline-offset-4 hover:underline">
            Create an account
          </Link>
        </p>
        <p className="mt-3 text-center text-xs text-muted">
          Nomi stores only what you explicitly tell it, and you can edit or delete every memory.
        </p>
      </div>
    </main>
  );
}
