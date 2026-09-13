import { beforeEach, describe, expect, it, vi } from "vitest";
import { connectionsViewSchema } from "@/lib/schemas/connections";

const auth = vi.hoisted(() => ({ current: null as null | { userId: string; email: string | null; isDemoUser: boolean } }));
const fakeEnv = vi.hoisted(() => ({
  APP_ORIGIN: "http://localhost:3000",
  OPENROUTER_API_KEY: "sk-or-secret-value",
  NOMI_MODEL: "openai/gpt-4.1-mini",
  NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-secret",
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
  GOOGLE_REFRESH_TOKEN: "",
  GOOGLE_CALENDAR_LABEL: "Nomi Demo Calendar",
  PRODUCT_SEARCH_API_KEY: "serp-secret",
  RESEARCH_MODE: "live",
  ENABLE_VOICE: true,
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

import { GET } from "@/app/api/connections/route";

describe("GET /api/connections", () => {
  beforeEach(() => {
    auth.current = { userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", email: null, isDemoUser: true };
  });

  it("401 without a session", async () => {
    auth.current = null;
    expect((await GET(new Request("http://x/api/connections"), undefined)).status).toBe(401);
  });

  it("reports configuration-only readiness honestly and never leaks key material", async () => {
    const res = await GET(new Request("http://x/api/connections"), undefined);
    expect(res.status).toBe(200);
    const text = await res.text();
    for (const secret of ["sk-or-secret-value", "service-role-secret", "serp-secret"]) expect(text).not.toContain(secret);
    const view = connectionsViewSchema.parse(JSON.parse(text));
    expect(view.verification).toBe("configuration_only");
    expect(view.model).toEqual({ ready: true, label: "openai/gpt-4.1-mini" });
    expect(view.database.ready).toBe(true);
    expect(view.calendar).toEqual({ ready: false, label: "Nomi Demo Calendar" });
    expect(view.shopping).toEqual({ ready: true, mode: "live" });
    expect(view.voice.enabled).toBe(false); // ENABLE_VOICE without an OpenAI key is not enabled
  });
});
