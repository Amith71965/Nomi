"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { DEFAULT_AFTER_SIGNUP } from "@/lib/auth-paths";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { PASSWORD_MIN_LENGTH, signupOutcome, validateSignup } from "@/lib/auth-forms";

const inputClass =
  "h-11 w-full rounded-control border border-border-strong bg-surface px-3 text-[15px] outline-none transition-[box-shadow,border-color] duration-[var(--motion)] focus:border-accent focus:ring-2 focus:ring-accent/25";

export function SignupForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const problem = validateSignup({ email, password, confirm });
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    try {
      const supabase = createBrowserSupabase();
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(DEFAULT_AFTER_SIGNUP)}`;
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: redirectTo },
      });
      const outcome = signupOutcome({
        errorMessage: signUpError?.message ?? null,
        errorStatus: signUpError?.status ?? null,
        hasSession: Boolean(data?.session),
        identityCount: data?.user?.identities?.length ?? null,
      });
      if (outcome.kind === "signed_in") {
        router.replace(DEFAULT_AFTER_SIGNUP);
        router.refresh();
        return;
      }
      if (outcome.kind === "confirm_email") {
        setSentTo(email);
        return;
      }
      setError(outcome.message);
    } catch (e) {
      setError(
        e instanceof Error && e.message.includes("configuration")
          ? "Sign-up is not configured on this deployment yet."
          : "Could not reach the sign-up service. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <div role="status" className="space-y-3 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.12em] text-muted">Check your email</p>
        <p className="text-[15px]">
          We sent a confirmation link to <span className="font-medium">{sentTo}</span>. Open it to finish creating your
          account, then choose which apps to link.
        </p>
        <p className="text-xs text-muted">Nothing is connected until you sign in and link it yourself.</p>
      </div>
    );
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
          autoComplete="email"
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
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
        <p className="text-xs text-muted">At least {PASSWORD_MIN_LENGTH} characters.</p>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="confirm" className="text-sm font-medium">
          Confirm password
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={inputClass}
        />
      </div>
      {error && (
        <p role="alert" className="rounded-control border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      <Button
        type="submit"
        className="w-full"
        disabled={busy || email.length === 0 || password.length === 0 || confirm.length === 0}
      >
        {busy ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
