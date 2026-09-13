"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { createBrowserSupabase } from "@/lib/supabase/client";

const inputClass =
  "h-11 w-full rounded-control border border-border-strong bg-surface px-3 text-[15px] outline-none transition-[box-shadow,border-color] duration-[var(--motion)] focus:border-accent focus:ring-2 focus:ring-accent/25";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const supabase = createBrowserSupabase();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError("That email and password did not match. Password is kept; check and try again.");
        return;
      }
      router.replace(next);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error && e.message.includes("configuration") ? "Sign-in is not configured on this deployment yet." : "Could not reach the sign-in service. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
      </div>
      {error && (
        <p role="alert" className="rounded-control border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={busy || email.length === 0 || password.length === 0}>
        {busy ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
