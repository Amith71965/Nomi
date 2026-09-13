import { beforeEach, describe, expect, it, vi } from "vitest";
import { connectionsViewSchema } from "@/lib/schemas/connections";
import { LINK_INPUT, connectionStore } from "../helpers/fake-connections";

const auth = vi.hoisted(() => ({ current: null as null | { userId: string; email: string | null; isDemoUser: boolean } }));
const fakeEnv = vi.hoisted(() => ({
  APP_ORIGIN: "http://localhost:3000",
  OPENROUTER_API_KEY: "sk-or-secret-value",
  NOMI_MODEL: "openai/gpt-4.1-mini",
  NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-secret",
  GOOGLE_CLIENT_ID: "google-client-id",
  GOOGLE_CLIENT_SECRET: "google-client-secret",
  INTEGRATIONS_ENCRYPTION_KEY: "ZW5jcnlwdGlvbi1rZXktZW5jcnlwdGlvbi1rZXktISE=",
  PRODUCT_SEARCH_API_KEY: "serp-secret",
  RESEARCH_MODE: "live",
  ENABLE_VOICE: true,
  TRANSCRIPTION_PROVIDER: "deepgram",
  DEEPGRAM_API_KEY: "",
  OPENAI_API_KEY: "",
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

vi.mock("@/lib/connections/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/connections/service")>();
  const { connectionStore } = await import("../helpers/fake-connections");
  const { getEnv } = await import("@/lib/env");
  return { ...actual, connectionsServiceFromEnv: () => new actual.ConnectionsService(connectionStore, getEnv()) };
});

import { GET } from "@/app/api/connections/route";

const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("GET /api/connections", () => {
  beforeEach(() => {
    connectionStore.reset();
    auth.current = { userId: USER_A, email: null, isDemoUser: false };
  });

  it("401 without a session", async () => {
    auth.current = null;
    expect((await GET(new Request("http://x/api/connections"), undefined)).status).toBe(401);
  });

  it("returns the catalogue with honest statuses and never leaks key material", async () => {
    const res = await GET(new Request("http://x/api/connections"), undefined);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const text = await res.text();
    for (const secret of ["sk-or-secret-value", "service-role-secret", "serp-secret", "google-client-secret", "ZW5jcnlwdGlvbi1rZXkt"]) {
      expect(text).not.toContain(secret);
    }
    const view = connectionsViewSchema.parse(JSON.parse(text));
    expect(view.verification).toBe("configuration_only");
    expect(view.server.model).toEqual({ ready: true, label: "openai/gpt-4.1-mini" });
    expect(view.server.voice).toEqual({ enabled: false, provider: null });
    expect(view.server.linking.ready).toBe(true);
    const google = view.integrations.find((i) => i.key === "google_calendar");
    expect(google?.status).toBe("not_linked");
    expect(google?.connectPath).toBe("/api/integrations/google/start");
    expect(view.integrations.find((i) => i.key === "voice")?.status).toBe("not_ready");
  });

  it("shows only the caller's own link", async () => {
    await connectionStore.link(USER_B, LINK_INPUT);
    const mine = connectionsViewSchema.parse(await (await GET(new Request("http://x/api/connections"), undefined)).json());
    expect(mine.integrations.find((i) => i.key === "google_calendar")?.status).toBe("not_linked");

    auth.current = { userId: USER_B, email: null, isDemoUser: false };
    const res = await GET(new Request("http://x/api/connections"), undefined);
    const text = await res.text();
    const theirs = connectionsViewSchema.parse(JSON.parse(text));
    const google = theirs.integrations.find((i) => i.key === "google_calendar");
    expect(google?.status).toBe("linked");
    expect(google?.account?.email).toBe("person@example.com");
    expect(text).not.toContain("sealed-refresh-token");
  });
});
