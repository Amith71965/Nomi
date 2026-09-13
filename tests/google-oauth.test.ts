import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import tokenFixture from "@/fixtures/google-token-response.json";
import userInfoFixture from "@/fixtures/google-userinfo.json";
import { GOOGLE_REVOKE_URL, GOOGLE_TOKEN_URL, GOOGLE_USERINFO_URL, GoogleOAuthClient, GoogleOAuthError } from "@/lib/integrations/google-oauth";
import { OAUTH_STATE_TTL_MS, createOAuthState, verifyOAuthState } from "@/lib/oauth-state";

const KEY = randomBytes(32).toString("base64");
const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NOW = new Date("2026-09-13T12:00:00.000Z");

function fakeFetch(handler: (url: string, init?: RequestInit) => { status: number; body: unknown }) {
  return async (url: string, init?: RequestInit) => {
    const { status, body } = handler(url, init);
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  };
}

function client(handler: Parameters<typeof fakeFetch>[0]) {
  return new GoogleOAuthClient({
    clientId: "client-id",
    clientSecret: "client-secret",
    redirectUri: "http://localhost:3000/api/integrations/google/callback",
    fetchImpl: fakeFetch(handler),
  });
}

describe("GoogleOAuthClient", () => {
  it("builds an offline, consent-prompting authorization URL with least-privilege scopes", () => {
    const url = new URL(client(() => ({ status: 200, body: {} })).authorizationUrl("state-123"));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/integrations/google/callback");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("state")).toBe("state-123");
    const scopes = url.searchParams.get("scope")?.split(" ") ?? [];
    expect(scopes).toContain("https://www.googleapis.com/auth/calendar.events");
    expect(scopes.some((s) => s.endsWith("/calendar") || s.includes("gmail"))).toBe(false);
  });

  it("exchanges a code with the secret in the body and parses the recorded response", async () => {
    let seen: { url?: string; body?: string } = {};
    const tokens = await client((url, init) => {
      seen = { url, body: String(init?.body) };
      return { status: 200, body: tokenFixture };
    }).exchangeCode("auth-code");
    expect(seen.url).toBe(GOOGLE_TOKEN_URL);
    const body = new URLSearchParams(seen.body);
    expect(body.get("code")).toBe("auth-code");
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("client_secret")).toBe("client-secret");
    expect(tokens.refreshToken).toBe("1//placeholder-refresh-token");
    expect(tokens.accessToken).toBe("ya29.placeholder-access-token");
    expect(tokens.scope).toContain("https://www.googleapis.com/auth/calendar.events");
  });

  it("maps token errors honestly and never fabricates tokens", async () => {
    await expect(client(() => ({ status: 400, body: { error: "invalid_grant" } })).exchangeCode("x")).rejects.toMatchObject({
      code: "provider_error",
      providerCode: "invalid_grant",
      retryable: false,
    });
    await expect(client(() => ({ status: 503, body: "down" })).exchangeCode("x")).rejects.toMatchObject({ code: "provider_unavailable", retryable: true });
    await expect(client(() => ({ status: 200, body: { nope: true } })).exchangeCode("x")).rejects.toBeInstanceOf(GoogleOAuthError);
  });

  it("reads the profile and treats revoke failures as false rather than throwing", async () => {
    const c = client((url) => {
      if (url === GOOGLE_USERINFO_URL) return { status: 200, body: userInfoFixture };
      if (url === GOOGLE_REVOKE_URL) return { status: 400, body: { error: "invalid_token" } };
      return { status: 500, body: "" };
    });
    expect(await c.userInfo("access")).toMatchObject({ sub: "108412345678901234567", email: "person@example.com" });
    expect(await c.revoke("1//gone")).toBe(false);
    expect(await client(() => ({ status: 200, body: {} })).revoke("1//ok")).toBe(true);
  });
});

describe("OAuth state", () => {
  it("round-trips when the cookie, signature, user, and provider all match", () => {
    const state = createOAuthState({ userId: USER, provider: "google_calendar", now: NOW }, KEY);
    const verdict = verifyOAuthState({ state, cookieState: state, userId: USER, provider: "google_calendar", now: NOW }, KEY);
    expect(verdict.ok).toBe(true);
  });

  it("refuses a missing cookie, a mismatched cookie, another user, a tampered payload, and an expired state", () => {
    const state = createOAuthState({ userId: USER, provider: "google_calendar", now: NOW }, KEY);
    const other = createOAuthState({ userId: USER, provider: "google_calendar", now: NOW }, KEY);
    expect(verifyOAuthState({ state, cookieState: null, userId: USER, provider: "google_calendar", now: NOW }, KEY)).toMatchObject({ ok: false, reason: "missing" });
    expect(verifyOAuthState({ state, cookieState: other, userId: USER, provider: "google_calendar", now: NOW }, KEY)).toMatchObject({ ok: false, reason: "mismatch" });
    expect(
      verifyOAuthState({ state, cookieState: state, userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", provider: "google_calendar", now: NOW }, KEY),
    ).toMatchObject({ ok: false, reason: "user" });
    const [payload, sig] = state.split(".");
    const forged = `${Buffer.from(JSON.stringify({ u: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", n: "nnnnnnnnnnnnnnnnnnnnnn", t: NOW.getTime(), p: "google_calendar" })).toString("base64url")}.${sig}`;
    expect(verifyOAuthState({ state: forged, cookieState: forged, userId: USER, provider: "google_calendar", now: NOW }, KEY)).toMatchObject({ ok: false, reason: "signature" });
    void payload;
    const late = new Date(NOW.getTime() + OAUTH_STATE_TTL_MS + 1);
    expect(verifyOAuthState({ state, cookieState: state, userId: USER, provider: "google_calendar", now: late }, KEY)).toMatchObject({ ok: false, reason: "expired" });
    expect(verifyOAuthState({ state, cookieState: state, userId: USER, provider: "google_calendar", now: NOW }, randomBytes(32).toString("base64"))).toMatchObject({ ok: false, reason: "signature" });
  });
});
