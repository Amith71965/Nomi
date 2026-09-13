import { beforeEach, describe, expect, it, vi } from "vitest";
import tokenFixture from "@/fixtures/google-token-response.json";
import userInfoFixture from "@/fixtures/google-userinfo.json";
import { openBox } from "@/lib/crypto";
import { GOOGLE_REVOKE_URL, GOOGLE_TOKEN_URL, GOOGLE_USERINFO_URL } from "@/lib/integrations/google-oauth";
import { unlinkResultSchema } from "@/lib/schemas/connections";
import { LINK_INPUT, connectionStore } from "../helpers/fake-connections";

const KEY = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=";
const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ORIGIN = "http://localhost:3000";

const auth = vi.hoisted(() => ({ current: null as null | { userId: string; email: string | null; isDemoUser: boolean } }));
const fakeEnv = vi.hoisted(() => ({
  APP_ORIGIN: "http://localhost:3000",
  NOMI_MODEL: "openai/gpt-4.1-mini",
  NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-secret",
  GOOGLE_CLIENT_ID: "google-client-id",
  GOOGLE_CLIENT_SECRET: "google-client-secret",
  INTEGRATIONS_ENCRYPTION_KEY: "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=",
  RESEARCH_MODE: "live",
  ENABLE_VOICE: false,
  TRANSCRIPTION_PROVIDER: "deepgram",
}));
const google = vi.hoisted(() => ({
  tokenStatus: 200,
  tokenBody: null as unknown,
  revokeStatus: 200,
  calls: [] as Array<{ url: string; body: string | null }>,
  configured: true,
}));

vi.mock("@/lib/auth", async () => {
  const { ApiError } = await import("@/lib/errors");
  return {
    requireUser: async () => {
      if (!auth.current) throw new ApiError("unauthenticated", "Sign in to continue.");
      return auth.current;
    },
    requireDemoUser: () => undefined,
  };
});

vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return { ...actual, getEnv: () => fakeEnv };
});

vi.mock("@/lib/connections/linking", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/connections/linking")>();
  const { GoogleOAuthClient } = await import("@/lib/integrations/google-oauth");
  const { connectionStore } = await import("../helpers/fake-connections");
  const { getEnv } = await import("@/lib/env");
  const fetchImpl = async (url: string, init?: RequestInit) => {
    google.calls.push({ url, body: init?.body ? String(init.body) : null });
    if (url === GOOGLE_TOKEN_URL) {
      return new Response(JSON.stringify(google.tokenBody ?? tokenFixture), { status: google.tokenStatus, headers: { "content-type": "application/json" } });
    }
    if (url === GOOGLE_USERINFO_URL) return new Response(JSON.stringify(userInfoFixture), { status: 200, headers: { "content-type": "application/json" } });
    if (url === GOOGLE_REVOKE_URL) return new Response("{}", { status: google.revokeStatus, headers: { "content-type": "application/json" } });
    return new Response("not found", { status: 404 });
  };
  return {
    ...actual,
    linkingServiceFromEnv: () =>
      google.configured
        ? new actual.LinkingService({
            store: connectionStore,
            google: new GoogleOAuthClient({ clientId: "google-client-id", clientSecret: "google-client-secret", redirectUri: `${ORIGIN}/api/integrations/google/callback`, fetchImpl }),
            env: getEnv(),
          })
        : null,
  };
});

import { GET as start } from "@/app/api/integrations/google/start/route";
import { GET as callback } from "@/app/api/integrations/google/callback/route";
import { DELETE as unlink } from "@/app/api/integrations/google/route";

function cookieValue(setCookie: string | null): string {
  const m = /nomi_oauth_state=([^;]*)/.exec(setCookie ?? "");
  return decodeURIComponent(m?.[1] ?? "");
}

async function begin(): Promise<{ state: string; cookie: string }> {
  const res = await start(new Request(`${ORIGIN}/api/integrations/google/start`), undefined);
  expect(res.status).toBe(302);
  const location = new URL(res.headers.get("location") ?? "");
  const setCookie = res.headers.get("set-cookie");
  expect(setCookie).toMatch(/HttpOnly/);
  expect(setCookie).toMatch(/SameSite=Lax/);
  const state = location.searchParams.get("state") ?? "";
  expect(cookieValue(setCookie)).toBe(state);
  return { state, cookie: `nomi_oauth_state=${encodeURIComponent(state)}` };
}

describe("Google linking routes", () => {
  beforeEach(() => {
    connectionStore.reset();
    auth.current = { userId: USER_A, email: null, isDemoUser: false };
    google.tokenStatus = 200;
    google.tokenBody = null;
    google.revokeStatus = 200;
    google.calls = [];
    google.configured = true;
  });

  it("start: 401 without a session, redirects to Google with a signed state cookie when signed in", async () => {
    auth.current = null;
    expect((await start(new Request(`${ORIGIN}/api/integrations/google/start`), undefined)).status).toBe(401);
    auth.current = { userId: USER_A, email: null, isDemoUser: false };
    const res = await start(new Request(`${ORIGIN}/api/integrations/google/start`), undefined);
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.origin).toBe("https://accounts.google.com");
    expect(location.searchParams.get("access_type")).toBe("offline");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("start: sends the user back with unavailable when the deployment has no Google client", async () => {
    google.configured = false;
    const res = await start(new Request(`${ORIGIN}/api/integrations/google/start`), undefined);
    expect(res.headers.get("location")).toBe("/app/connections?link_error=unavailable");
  });

  it("callback: links the caller's own account, seals the refresh token, and never puts it in the redirect", async () => {
    const { state, cookie } = await begin();
    const res = await callback(new Request(`${ORIGIN}/api/integrations/google/callback?code=auth-code&state=${encodeURIComponent(state)}`, { headers: { cookie } }), undefined);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/app/connections?linked=google_calendar");
    expect(res.headers.get("set-cookie")).toMatch(/Max-Age=0/);
    const row = await connectionStore.get(USER_A, "google_calendar");
    expect(row).toMatchObject({ status: "linked", account_email: "person@example.com", account_label: "Primary calendar · person@example.com", external_account_id: "108412345678901234567" });
    const secret = await connectionStore.secret(USER_A, "google_calendar");
    expect(secret?.ciphertext).not.toContain("placeholder-refresh-token");
    expect(openBox(secret?.ciphertext ?? "", KEY)).toBe("1//placeholder-refresh-token");
    expect(await connectionStore.get(USER_B, "google_calendar")).toBeNull();
    const tokenCall = google.calls.find((c) => c.url === GOOGLE_TOKEN_URL);
    expect(new URLSearchParams(tokenCall?.body ?? "").get("code")).toBe("auth-code");
  });

  it("callback: refuses a missing or foreign state cookie and another session's state; nothing is stored", async () => {
    const { state, cookie } = await begin();
    const noCookie = await callback(new Request(`${ORIGIN}/api/integrations/google/callback?code=c&state=${encodeURIComponent(state)}`), undefined);
    expect(noCookie.headers.get("location")).toBe("/app/connections?link_error=state");
    const wrongCookie = await callback(new Request(`${ORIGIN}/api/integrations/google/callback?code=c&state=${encodeURIComponent(state)}`, { headers: { cookie: "nomi_oauth_state=other" } }), undefined);
    expect(wrongCookie.headers.get("location")).toBe("/app/connections?link_error=state");
    auth.current = { userId: USER_B, email: null, isDemoUser: false };
    const otherUser = await callback(new Request(`${ORIGIN}/api/integrations/google/callback?code=c&state=${encodeURIComponent(state)}`, { headers: { cookie } }), undefined);
    expect(otherUser.headers.get("location")).toBe("/app/connections?link_error=state");
    expect(google.calls.filter((c) => c.url === GOOGLE_TOKEN_URL)).toHaveLength(0);
    expect(await connectionStore.list(USER_A)).toEqual([]);
    expect(await connectionStore.list(USER_B)).toEqual([]);
  });

  it("callback: user denial, provider failure, and a missing refresh token each store nothing", async () => {
    let { state, cookie } = await begin();
    const denied = await callback(new Request(`${ORIGIN}/api/integrations/google/callback?error=access_denied&state=${encodeURIComponent(state)}`, { headers: { cookie } }), undefined);
    expect(denied.headers.get("location")).toBe("/app/connections?link_error=denied");

    ({ state, cookie } = await begin());
    google.tokenStatus = 400;
    google.tokenBody = { error: "invalid_grant" };
    const failed = await callback(new Request(`${ORIGIN}/api/integrations/google/callback?code=bad&state=${encodeURIComponent(state)}`, { headers: { cookie } }), undefined);
    expect(failed.headers.get("location")).toBe("/app/connections?link_error=provider");

    ({ state, cookie } = await begin());
    google.tokenStatus = 200;
    google.tokenBody = { ...tokenFixture, refresh_token: undefined };
    const noRefresh = await callback(new Request(`${ORIGIN}/api/integrations/google/callback?code=c&state=${encodeURIComponent(state)}`, { headers: { cookie } }), undefined);
    expect(noRefresh.headers.get("location")).toBe("/app/connections?link_error=no_refresh_token");
    expect(await connectionStore.list(USER_A)).toEqual([]);
  });

  it("callback: a signed-out browser is sent to login, not to a 401 body", async () => {
    auth.current = null;
    const res = await callback(new Request(`${ORIGIN}/api/integrations/google/callback?code=c&state=s`), undefined);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login?next=%2Fapp%2Fconnections");
  });

  it("unlink: 404 when nothing is linked, 403 on a foreign origin, otherwise revokes at Google and drops the token", async () => {
    const none = await unlink(new Request(`${ORIGIN}/api/integrations/google`, { method: "DELETE", headers: { origin: ORIGIN } }), undefined);
    expect(none.status).toBe(404);

    await connectionStore.link(USER_A, { ...LINK_INPUT, refreshTokenCiphertext: (await import("@/lib/crypto")).sealBox("1//live-token", KEY) });
    const foreign = await unlink(new Request(`${ORIGIN}/api/integrations/google`, { method: "DELETE", headers: { origin: "https://evil.example" } }), undefined);
    expect(foreign.status).toBe(403);

    const res = await unlink(new Request(`${ORIGIN}/api/integrations/google`, { method: "DELETE", headers: { origin: ORIGIN } }), undefined);
    expect(res.status).toBe(200);
    const body = unlinkResultSchema.parse(await res.json());
    expect(body).toEqual({ provider: "google_calendar", status: "revoked", providerRevoked: true });
    const revokeCall = google.calls.find((c) => c.url === GOOGLE_REVOKE_URL);
    expect(new URLSearchParams(revokeCall?.body ?? "").get("token")).toBe("1//live-token");
    expect(await connectionStore.secret(USER_A, "google_calendar")).toBeNull();
    expect((await connectionStore.get(USER_A, "google_calendar"))?.status).toBe("revoked");
  });

  it("unlink: still drops Nomi's copy when Google refuses the revocation, and says so", async () => {
    await connectionStore.link(USER_A, { ...LINK_INPUT, refreshTokenCiphertext: (await import("@/lib/crypto")).sealBox("1//live-token", KEY) });
    google.revokeStatus = 400;
    const res = await unlink(new Request(`${ORIGIN}/api/integrations/google`, { method: "DELETE", headers: { origin: ORIGIN } }), undefined);
    expect(unlinkResultSchema.parse(await res.json()).providerRevoked).toBe(false);
    expect(await connectionStore.secret(USER_A, "google_calendar")).toBeNull();
  });
});
