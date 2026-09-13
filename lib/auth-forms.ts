/**
 * Pure helpers behind the sign-up form so its decisions are unit-testable
 * without a browser or a Supabase client.
 */

export const PASSWORD_MIN_LENGTH = 8;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateSignup(input: { email: string; password: string; confirm: string }): string | null {
  if (!EMAIL.test(input.email.trim())) return "Enter a valid email address.";
  if (input.password.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters for the password.`;
  if (input.password !== input.confirm) return "The two passwords do not match.";
  return null;
}

export type SignupOutcome =
  | { kind: "signed_in" }
  | { kind: "confirm_email" }
  | { kind: "error"; message: string };

/**
 * Interpret Supabase's sign-up response honestly.
 * - A session means confirmations are off and the user is in.
 * - A user with zero identities is Supabase's obfuscated reply for an email
 *   that already exists (when confirmations are on).
 * - Otherwise the user must confirm by email.
 */
export function signupOutcome(input: {
  errorMessage: string | null;
  errorStatus: number | null;
  hasSession: boolean;
  identityCount: number | null;
}): SignupOutcome {
  if (input.errorMessage !== null) {
    const m = input.errorMessage.toLowerCase();
    if (m.includes("signups not allowed") || m.includes("signup is disabled")) {
      return { kind: "error", message: "Sign-ups are turned off on this deployment." };
    }
    if (m.includes("already registered") || m.includes("already exists")) {
      return { kind: "error", message: "An account with this email already exists. Sign in instead." };
    }
    if (m.includes("password")) {
      return { kind: "error", message: "That password was rejected. Use a longer or less common one." };
    }
    // Supabase's built-in email service allows only a couple of confirmation
    // emails per hour. That is a sending quota on this deployment, not a limit
    // on the person signing up, so say so rather than telling them to retry.
    if (m.includes("email rate limit") || m.includes("over_email_send_rate_limit")) {
      return {
        kind: "error",
        message: "This deployment has hit its hourly limit for confirmation emails. Try again later, or sign in if you already created this account.",
      };
    }
    if (input.errorStatus === 429 || m.includes("rate limit")) {
      return { kind: "error", message: "Too many attempts. Wait a minute and try again." };
    }
    return { kind: "error", message: "Could not create the account. Try again." };
  }
  if (input.hasSession) return { kind: "signed_in" };
  if (input.identityCount === 0) {
    return { kind: "error", message: "An account with this email already exists. Sign in instead." };
  }
  return { kind: "confirm_email" };
}
