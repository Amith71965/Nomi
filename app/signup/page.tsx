import type { Metadata } from "next";
import Link from "next/link";
import { SignupForm } from "@/components/auth/signup-form";
import { Wordmark } from "@/components/landing/nav";

export const metadata: Metadata = { title: "Create an account" };

export default function SignupPage() {
  return (
    <main className="grain relative flex flex-1 items-center justify-center px-5 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Wordmark className="text-3xl" />
          <p className="mt-2 text-sm text-muted">Create your account</p>
        </div>
        <div className="rounded-card border border-border bg-surface p-6 shadow-soft">
          <SignupForm />
        </div>
        <p className="mt-6 text-center text-sm text-muted">
          Already have an account?{" "}
          <Link href="/login" className="text-accent underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
        <p className="mt-3 text-center text-xs text-muted">
          After sign-up you choose which apps to link. Nothing is connected until you say so.
        </p>
      </div>
    </main>
  );
}
