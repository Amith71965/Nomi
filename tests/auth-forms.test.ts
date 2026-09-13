import { describe, expect, it } from "vitest";
import { signupOutcome, validateSignup } from "@/lib/auth-forms";
import { DEFAULT_AFTER_LOGIN, DEFAULT_AFTER_SIGNUP, safeAppPath } from "@/lib/auth-paths";

describe("validateSignup", () => {
  it("rejects bad emails, short passwords, and mismatches with one plain message", () => {
    expect(validateSignup({ email: "nope", password: "longenough", confirm: "longenough" })).toMatch(/email/);
    expect(validateSignup({ email: "a@b.co", password: "short", confirm: "short" })).toMatch(/8 characters/);
    expect(validateSignup({ email: "a@b.co", password: "longenough", confirm: "different" })).toMatch(/do not match/);
    expect(validateSignup({ email: "a@b.co", password: "longenough", confirm: "longenough" })).toBeNull();
  });
});

describe("signupOutcome", () => {
  it("signs in when a session is returned (confirmations off)", () => {
    expect(signupOutcome({ errorMessage: null, errorStatus: null, hasSession: true, identityCount: 1 })).toEqual({ kind: "signed_in" });
  });

  it("asks for email confirmation when there is a user but no session", () => {
    expect(signupOutcome({ errorMessage: null, errorStatus: null, hasSession: false, identityCount: 1 })).toEqual({ kind: "confirm_email" });
  });

  it("treats Supabase's zero-identity reply as an existing account, never as success", () => {
    const out = signupOutcome({ errorMessage: null, errorStatus: null, hasSession: false, identityCount: 0 });
    expect(out.kind).toBe("error");
    expect(out.kind === "error" && out.message).toMatch(/already exists/);
  });

  it("maps provider errors to honest messages without echoing them", () => {
    const disabled = signupOutcome({ errorMessage: "Signups not allowed for this instance", errorStatus: 422, hasSession: false, identityCount: null });
    expect(disabled.kind === "error" && disabled.message).toMatch(/turned off/);
    const weak = signupOutcome({ errorMessage: "Password should be at least 6 characters", errorStatus: 422, hasSession: false, identityCount: null });
    expect(weak.kind === "error" && weak.message).toMatch(/password/i);
    const limited = signupOutcome({ errorMessage: "Request rate limit reached", errorStatus: 429, hasSession: false, identityCount: null });
    expect(limited.kind === "error" && limited.message).toMatch(/Too many/);
    const unknown = signupOutcome({ errorMessage: "internal secret detail", errorStatus: 500, hasSession: false, identityCount: null });
    expect(unknown.kind === "error" && unknown.message).not.toContain("secret");
  });
});

describe("safeAppPath", () => {
  it("accepts only in-app paths and falls back otherwise", () => {
    expect(safeAppPath("/app/connections?welcome=1")).toBe("/app/connections?welcome=1");
    expect(safeAppPath("/app/memory")).toBe("/app/memory");
    expect(safeAppPath("https://evil.example/app")).toBe(DEFAULT_AFTER_LOGIN);
    expect(safeAppPath("//evil.example")).toBe(DEFAULT_AFTER_LOGIN);
    expect(safeAppPath("/login")).toBe(DEFAULT_AFTER_LOGIN);
    expect(safeAppPath(undefined, DEFAULT_AFTER_SIGNUP)).toBe(DEFAULT_AFTER_SIGNUP);
  });
});
