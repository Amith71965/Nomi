import { describe, expect, it } from "vitest";
import { EnvError, applyAliases, calendarConfigured, modelConfigured, parseEnv, shoppingConfigured } from "@/lib/env";

const VALID: Record<string, string> = {
  APP_ORIGIN: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
  DEMO_USER_ID: "6f1c2a1e-1b2c-4d3e-8f4a-5b6c7d8e9f01",
};

describe("parseEnv", () => {
  it("accepts a minimal valid env and applies defaults", () => {
    const env = parseEnv(VALID);
    expect(env.NOMI_MODEL).toBe("openai/gpt-4.1-mini");
    expect(env.OPENROUTER_BASE_URL).toBe("https://openrouter.ai/api/v1");
    expect(env.DEMO_TIME_ZONE).toBe("America/New_York");
    expect(env.RESEARCH_MODE).toBe("live");
    expect(env.ENABLE_VOICE).toBe(false);
    expect(env.ENABLE_PLACES).toBe(false);
    expect(env.GOOGLE_CALENDAR_ID).toBe("primary");
  });

  it("reports missing variable NAMES only, never values", () => {
    const raw = { ...VALID, NEXT_PUBLIC_SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "   " };
    let caught: unknown;
    try {
      parseEnv(raw);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(EnvError);
    const err = caught as EnvError;
    expect(err.missing).toEqual(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
    expect(err.message).not.toContain("sb_publishable_test");
  });

  it("does not require the model key at startup and reports it as unconfigured", () => {
    const env = parseEnv(VALID);
    expect(env.OPENROUTER_API_KEY).toBeUndefined();
    expect(modelConfigured(env)).toBe(false);
    expect(modelConfigured(parseEnv({ ...VALID, OPENROUTER_API_KEY: "sk-or-test" }))).toBe(true);
  });

  it("accepts legacy anon/service_role names, new publishable/secret names, and dashboard labels", () => {
    const base = { ...VALID };
    delete base.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    delete base.SUPABASE_SERVICE_ROLE_KEY;
    const legacy = parseEnv({ ...base, NEXT_PUBLIC_SUPABASE_ANON_KEY: "eyJ-anon", SUPABASE_SECRET_KEY: "sb_secret_x" });
    expect(legacy.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toBe("eyJ-anon");
    expect(legacy.SUPABASE_SERVICE_ROLE_KEY).toBe("sb_secret_x");
    const dashboard = parseEnv({ ...base, SUPABASE_ANON_PUBLIC_KEY: "eyJ-anon2", SUPABASE_LEGACY_SERVICE_ROLE_SECRET_KEY: "eyJ-service" });
    expect(dashboard.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toBe("eyJ-anon2");
    expect(dashboard.SUPABASE_SERVICE_ROLE_KEY).toBe("eyJ-service");
    // Canonical names win when several are present; blank canonical falls through to an alias.
    const both = parseEnv({ ...VALID, NEXT_PUBLIC_SUPABASE_ANON_KEY: "other" });
    expect(both.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toBe("sb_publishable_test");
    const blankCanonical = parseEnv({ ...VALID, SUPABASE_SERVICE_ROLE_KEY: "", SUPABASE_SECRET_KEY: "sb_secret_y" });
    expect(blankCanonical.SUPABASE_SERVICE_ROLE_KEY).toBe("sb_secret_y");
    expect(applyAliases({ SUPABASE_SECRET_KEY: "k" }).SUPABASE_SERVICE_ROLE_KEY).toBe("k");
  });

  it("rejects an APP_ORIGIN with a path or trailing slash", () => {
    expect(() => parseEnv({ ...VALID, APP_ORIGIN: "http://localhost:3000/" })).toThrow(EnvError);
    expect(() => parseEnv({ ...VALID, APP_ORIGIN: "localhost:3000" })).toThrow(EnvError);
  });

  it("rejects a non-UUID DEMO_USER_ID", () => {
    expect(() => parseEnv({ ...VALID, DEMO_USER_ID: "demo" })).toThrow(EnvError);
  });

  it("only requires OPENAI_API_KEY when voice is enabled", () => {
    expect(() => parseEnv({ ...VALID, ENABLE_VOICE: "false" })).not.toThrow();
    let missing: string[] = [];
    try {
      parseEnv({ ...VALID, ENABLE_VOICE: "true" });
    } catch (e) {
      missing = (e as EnvError).missing;
    }
    expect(missing).toEqual(["OPENAI_API_KEY"]);
    expect(() => parseEnv({ ...VALID, ENABLE_VOICE: "true", OPENAI_API_KEY: "sk-test" })).not.toThrow();
  });

  it("only requires GOOGLE_MAPS_API_KEY when places is enabled", () => {
    expect(() => parseEnv({ ...VALID, ENABLE_PLACES: "true" })).toThrow(/GOOGLE_MAPS_API_KEY/);
    expect(() => parseEnv({ ...VALID, ENABLE_PLACES: "true", GOOGLE_MAPS_API_KEY: "k" })).not.toThrow();
  });

  it("rejects an unknown RESEARCH_MODE", () => {
    expect(() => parseEnv({ ...VALID, RESEARCH_MODE: "demo" })).toThrow(/RESEARCH_MODE/);
  });

  it("reports calendar and shopping readiness without throwing", () => {
    const env = parseEnv(VALID);
    expect(calendarConfigured(env)).toBe(false);
    expect(shoppingConfigured(env)).toBe(false);
    const ready = parseEnv({
      ...VALID,
      GOOGLE_CLIENT_ID: "id",
      GOOGLE_CLIENT_SECRET: "secret",
      GOOGLE_REFRESH_TOKEN: "rt",
      PRODUCT_SEARCH_API_KEY: "serp",
    });
    expect(calendarConfigured(ready)).toBe(true);
    expect(shoppingConfigured(ready)).toBe(true);
    expect(shoppingConfigured(parseEnv({ ...VALID, RESEARCH_MODE: "fixture" }))).toBe(true);
  });
});
